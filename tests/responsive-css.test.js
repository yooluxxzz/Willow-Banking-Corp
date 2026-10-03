const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Static guards for layout bugs that only show up in a real browser at certain screen sizes.
const cssDir = path.join(__dirname, '../public/css');
const sheets = fs.readdirSync(cssDir).filter(file => file.endsWith('.css')).map(file => ({ file, css: fs.readFileSync(path.join(cssDir, file), 'utf8') }));

// Innermost `selector { body }` rules, including those inside @media blocks.
function rules(css) {
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
}

describe('Responsive CSS guards', () => {
    it('gives every fr grid track a minimum so long content cannot widen the page', () => {
        const offenders = [];
        for (const { file, css } of sheets) {
            for (const [, value] of css.matchAll(/grid-template-columns:\s*([^;{}]+);/g)) {
                // Drop minmax(...) groups (one nesting level for min()), then any fr left is a bare track.
                const bare = value.replace(/minmax\((?:[^()]|\([^()]*\))*\)/g, '');
                if (/\d*\.?\d+fr\b/.test(bare)) offenders.push(`${file}: ${value.trim()}`);
            }
        }
        assert.deepEqual(offenders, [], 'use minmax(0, 1fr) instead of 1fr');
    });

    it('keeps the site header from trapping its fixed mobile menu and scrim', () => {
        const header = sheets.find(sheet => sheet.file === 'site.css');
        const trapping = /(^|\s|;)(backdrop-filter|-webkit-backdrop-filter|filter|transform|perspective|contain|will-change)\s*:\s*(?!none)/;
        const offenders = rules(header.css)
            .filter(rule => rule.selector.split(',').some(selector => /^\.site-header(\.[\w-]+|\[[^\]]+\]|:not\([^)]*\))*$/.test(selector.trim())))
            .filter(rule => trapping.test(rule.body))
            .map(rule => rule.selector);
        assert.deepEqual(offenders, [], 'put header effects on .site-header::before');
    });

    it('defines the amount input component once', () => {
        const definitions = sheets.flatMap(({ file, css }) => rules(css).filter(rule => rule.selector.split(',').map(s => s.trim()).includes('.amount-input')).map(() => file));
        assert.deepEqual(definitions, ['willow.css']);
    });

    it('makes horizontal scrollers the containing block for hidden labels inside them', () => {
        const willow = sheets.find(sheet => sheet.file === 'willow.css').css;
        const tableWrap = rules(willow).find(rule => rule.selector === '.table-wrap');
        assert.match(tableWrap.body, /position:\s*relative/);
    });
});
