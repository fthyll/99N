// Run: node js/fonts.test.mjs
// The Clash face is self-hosted (assets/fonts/*.woff2) instead of pulled from
// a font CDN, so a broken font silently degrades the whole dashboard to a
// fallback face. These checks pin the files, their binary header, and the
// fact that nothing still asks Google Fonts for Outfit/Fredoka.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const faces = [
    { file: 'assets/fonts/Clash-Regular.woff2', weight: '400 500' },
    { file: 'assets/fonts/Clash-Bold.woff2', weight: '600 900' },
];

for (const face of faces) {
    const bytes = readFileSync(new URL(`../${face.file}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'wOF2', `${face.file} is not WOFF2`);
    assert.ok(bytes.length > 10000, `${face.file} is suspiciously small (${bytes.length} bytes)`);

    const name = face.file.split('/').pop();
    assert.ok(
        css.includes(`url('../${face.file}')`),
        `style.css does not load ${face.file}`
    );
    assert.ok(css.includes(`font-weight: ${face.weight};`), `no @font-face weight range ${face.weight} for ${name}`);
}

assert.ok(css.includes("font-family: 'Clash'"), 'body does not use the Clash face');
assert.ok(html.includes('Clash'), 'index.html does not name the Clash face');
assert.ok(!/fonts\.googleapis\.com/.test(html), 'index.html still loads Google Fonts');
assert.ok(!/fonts\.googleapis\.com/.test(css), 'style.css still loads Google Fonts');
assert.ok(!/Outfit|Fredoka/.test(html + css), 'the old Outfit/Fredoka faces are still referenced');

// Every non-ASCII glyph the dashboard renders must exist in the shipped font,
// otherwise the browser silently substitutes a different face mid-sentence.
const { execFileSync } = await import('node:child_process');
const missing = execFileSync(
    'python3',
    ['-c', `
import sys, json
from fontTools.ttLib import TTFont
font = TTFont('assets/fonts/Clash-Regular.woff2')
cmap = set(font.getBestCmap())
chars = set()
for path in ['index.html', 'css/style.css']:
    chars |= set(open(path, encoding='utf-8').read())
for path in __import__('glob').glob('js/*.js'):
    chars |= set(open(path, encoding='utf-8').read())
print(json.dumps(sorted(c for c in chars if ord(c) > 127 and ord(c) not in cmap)))
`],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8' }
).trim();

// Arrows and emoji are intentionally left to the system fallback; only flag
// characters that carry meaning in the copy.
const mustCover = ['·', '—', '–', '’', '“', '”', '€', '£', '¥', '°', '×'];
const uncovered = mustCover.filter(c => JSON.parse(missing).includes(c));
assert.deepEqual(uncovered, [], `Clash is missing glyphs the UI uses: ${uncovered.join(' ')}`);

// Clash is wider than the Outfit/Fredoka faces it replaced, so the profile
// item tiles need room for a full name. Two regressions are guarded here:
// the tile grid going back to 155px, and the name inheriting the 16px body
// size (which made names wrap mid-word, e.g. "Barbarian" -> "Barbaria/n").
const itemsGrid = css.match(/\.profile-items \{[^}]*\}/);
assert.ok(itemsGrid, 'no .profile-items grid rule');
assert.match(itemsGrid[0], /minmax\(min\((\d+)px, 100%\), 1fr\)/, 'profile tiles must use a fluid minmax width');
assert.ok(
    Number(itemsGrid[0].match(/minmax\(min\((\d+)px, 100%\), 1fr\)/)[1]) >= 250,
    `profile tiles are too narrow for Clash names: ${itemsGrid[0]}`
);
assert.match(
    css,
    /\.profile-item-name > span \{[^}]*font-size: 13px/,
    'profile item names must use a 13px size so a name stays on one line'
);
assert.match(
    css,
    /\.profile-item-name > span \{[^}]*overflow-wrap: break-word/,
    'profile item names must break between words, not inside them'
);

console.log(`PASS: 2 WOFF2 faces loaded, ${mustCover.length} required glyphs covered`);
