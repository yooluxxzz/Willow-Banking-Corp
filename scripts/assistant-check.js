/**
 * npm run assistant:check — checks that Ask Willow can use Ollama on this computer.
 *
 * 1. Is Ollama running at OLLAMA_URL (default http://127.0.0.1:11434)?
 * 2. Which chat model would Willow use (OLLAMA_MODEL, or the best installed one)?
 * 3. How long does it take to load, and to answer a small test question?
 * 4. Does the answer use the figures it was given (a check of grounding)?
 *
 * No Willow data is used: the test question comes with its own made-up figures.
 * Exits with code 0 when Ask Willow is ready, 1 otherwise.
 */
require('dotenv').config();
const config = require('../src/config');
const { chatModels, pickModel, thinkFilter, SYSTEM_PROMPT } = require('../src/services/assistant');

const url = config.assistant.ollamaUrl;
const ok = text => console.log(`  ✔ ${text}`);
const bad = text => console.log(`  ✘ ${text}`);
const info = text => console.log(`    ${text}`);
const seconds = ms => `${(ms / 1000).toFixed(1)}s`;

async function json(path, options = {}, timeoutMs = 5000) {
    const response = await fetch(`${url}${path}`, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), { status: response.status });
    return body;
}

async function main() {
    console.log(`Ask Willow check (Ollama at ${url})\n`);
    if (!config.assistant.enabled) {
        bad('ASSISTANT_ENABLED=false in your settings, so Willow will not offer the assistant.');
        return false;
    }

    let version;
    try {
        version = (await json('/api/version')).version;
        ok(`Ollama ${version} is running.`);
    } catch (error) {
        bad('Ollama is not running (or not at this address).');
        info('Install it from https://ollama.com/download and start it, then run this check again.');
        info('If it runs elsewhere, set OLLAMA_URL in .env (for example http://127.0.0.1:11434).');
        return false;
    }

    const installed = (await json('/api/tags')).models || [];
    const names = chatModels(installed);
    const model = pickModel(names, config.assistant.model);
    if (!model) {
        bad(config.assistant.model ? `OLLAMA_MODEL is "${config.assistant.model}", but it isn't installed.` : 'No chat model is installed.');
        info('Run: ollama pull llama3.2   (about 2 GB; qwen2.5:7b or llama3.1:8b answer better if you have 8 GB+ of free memory)');
        if (installed.length) info(`Installed: ${installed.map(item => item.name).join(', ')}`);
        return false;
    }
    ok(`Willow will use ${model}${config.assistant.model ? ' (from OLLAMA_MODEL)' : ''}.`);
    if (names.length > 1) info(`Other chat models installed: ${names.filter(name => name !== model).join(', ')}. Set OLLAMA_MODEL to choose.`);

    let started = Date.now();
    try {
        await json('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [], keep_alive: '30m' }) }, config.assistant.timeoutMs);
        ok(`Model loaded in ${seconds(Date.now() - started)}.`);
    } catch (error) {
        bad(`The model could not be loaded: ${error.message}`);
        info('If this mentions memory, try a smaller model: ollama pull llama3.2');
        return false;
    }

    const context = [
        '## Key figures (already calculated: use these numbers as they are)',
        '- Money in Willow accounts in US dollars: $1,234.56, of which $400.00 in savings.',
        '- This month: spent $318.20 in 6 payments; money in $2,000.00.',
        '- Biggest spending categories this month: Groceries $142.10, Dining $96.40, Transport $79.70.',
    ].join('\n');
    const question = 'How much did I spend this month, and on what most?';
    started = Date.now();
    let firstToken = null;
    let answer = '';
    let stats = {};
    const filter = thinkFilter();
    try {
        const response = await fetch(`${url}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, stream: true, keep_alive: '30m', options: { temperature: 0.2, num_ctx: config.assistant.contextTokens }, messages: [{ role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXT\n${context}` }, { role: 'user', content: question }] }),
            signal: AbortSignal.timeout(Math.max(config.assistant.timeoutMs, 180000)),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of response.body) {
            buffer += decoder.decode(chunk, { stream: true });
            let newline;
            while ((newline = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (!line) continue;
                const event = JSON.parse(line);
                if (event.error) throw new Error(event.error);
                if (event.message && event.message.content) {
                    if (firstToken === null) firstToken = Date.now() - started;
                    answer += filter.push(event.message.content);
                }
                if (event.done) stats = event;
            }
        }
        answer = (answer + filter.flush()).trim();
    } catch (error) {
        bad(`The test question failed: ${error.message}`);
        return false;
    }
    const rate = stats.eval_count && stats.eval_duration ? ` (${(stats.eval_count / (stats.eval_duration / 1e9)).toFixed(1)} words/s)` : '';
    ok(`Answered in ${seconds(Date.now() - started)}; first words after ${seconds(firstToken || 0)}${rate}.`);
    console.log(`\n  Q: ${question}\n  A: ${answer.replace(/\n+/g, '\n     ')}\n`);
    const grounded = /318\.20/.test(answer) && /grocer/i.test(answer);
    if (grounded) ok('The answer used the figures it was given.');
    else bad('The answer did not quote the figures it was given ($318.20, Groceries). A larger model (qwen2.5:7b or llama3.1:8b) is more reliable.');
    console.log(grounded ? '\nAsk Willow is ready. Open Willow and select “Ask Willow about your money”.' : '\nAsk Willow works, but answers may be unreliable with this model.');
    return grounded;
}

main().then(ready => process.exit(ready ? 0 : 1)).catch(error => { console.error(`Check failed: ${error.message}`); process.exit(1); });
