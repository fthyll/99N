import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTHImage } from './constants.js';

for (let level = 1; level <= 19; level++) {
    const path = getTHImage(level);
    const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', path);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', path);
}
console.log('PASS: TH1–TH19 resolve to WebP assets');
