import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlayerTrends } from './player-trends.js';

const data = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const index = JSON.parse(readFileSync(join(data, 'player_stats_index.json'), 'utf8'));
const trends = buildPlayerTrends(index, name => JSON.parse(readFileSync(join(data, 'player_stats', name), 'utf8')));
const files = [...index].sort();
const lastDate = name => `${name.slice(8, 12)}-${name.slice(12, 14)}-${name.slice(14, 16)}`;
const sampleTag = '#88GLRP9LQ';
const points = trends[sampleTag];
const archivedTagSnapshots = index.filter(name => {
    const snapshot = JSON.parse(readFileSync(join(data, 'player_stats', name), 'utf8'));
    return Object.hasOwn(snapshot.players || {}, sampleTag);
}).sort();
assert.equal(points.length, archivedTagSnapshots.length);
assert.equal(points.length < index.length, true);
assert.equal(points[0].date, lastDate(archivedTagSnapshots[0]));
assert.equal(points.at(-1).date, lastDate(archivedTagSnapshots.at(-1)));
const archivedTags = new Set();
for (const name of index) {
    const snapshot = JSON.parse(readFileSync(join(data, 'player_stats', name), 'utf8'));
    for (const tag of Object.keys(snapshot.players || {})) archivedTags.add(tag);
}
assert.equal(Object.keys(trends).length, archivedTags.size);
console.log(`PASS: ${Object.keys(trends).length} archived players, ${Object.values(trends).reduce((sum, series) => sum + series.length, 0)} dated points, ${files[0]}..${files.at(-1)}`);
