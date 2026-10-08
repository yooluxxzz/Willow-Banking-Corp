const { it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');

it('refuses missing, placeholder or shared production secrets', () => {
    const load = (sessionSecret, factorKey) => spawnSync(process.execPath, ['-e', 'require(' + JSON.stringify(require.resolve('../src/config')) + ')'], {
        cwd: tmpdir(),
        env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: sessionSecret, TWO_FACTOR_KEY: factorKey, ADMIN_EMAIL: 'admin@config.test', ADMIN_PASSWORD: 'unused' },
        encoding: 'utf8',
    });
    for (const [sessionSecret, factorKey] of [['', ''], ['change-me', ''], ['a'.repeat(40), 'a'.repeat(40)], ['a'.repeat(40), 'short']]) {
        const result = load(sessionSecret, factorKey);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Production requires independent/);
    }
    assert.equal(load('a'.repeat(40), 'b'.repeat(40)).status, 0);
});
