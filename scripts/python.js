#!/usr/bin/env node
/**
 * Runs Python 3 with the given arguments on any operating system.
 *
 *   node scripts/python.js -m unittest discover -s market-data-service/tests
 *
 * The npm scripts use this instead of calling `python3` directly, because on
 * Windows Python is usually `python` or `py -3`. Set PYTHON to choose a specific
 * interpreter (for example one inside a virtual environment).
 */
'use strict';

const { spawnSync } = require('child_process');

const candidates = [
    process.env.PYTHON && [process.env.PYTHON, []],
    ['python3', []],
    ['python', []],
    process.platform === 'win32' && ['py', ['-3']],
].filter(Boolean);

function findPython() {
    for (const [command, args] of candidates) {
        const probe = spawnSync(command, [...args, '-c', 'import sys; assert sys.version_info >= (3, 10)'], { windowsHide: true, stdio: 'ignore' });
        if (probe.status === 0) return [command, args];
    }
    return null;
}

const python = findPython();
if (!python) {
    console.error('Python 3.10 or newer was not found.');
    console.error('Install it from https://www.python.org/downloads/ (on Windows, tick "Add python.exe to PATH"),');
    console.error('or set the PYTHON environment variable to the full path of python.');
    process.exit(1);
}

const [command, args] = python;
const result = spawnSync(command, [...args, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
