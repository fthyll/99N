import assert from 'node:assert/strict';
import { buildPlayerTrends } from './player-trends.js';

const snapshots = {
    'players_20261102.json': { players: { '#A': { trophies: 0, warStars: 10 }, '#B': { donations: 5 } } },
    'players_20261101.json': { players: { '#A': { trophies: 100, warStars: 9 }, '#B': { donations: 3 } } },
};
const result = buildPlayerTrends(Object.keys(snapshots), name => snapshots[name]);
assert.deepEqual(result['#A'].map(point => [point.date, point.trophies, point.warStars]), [
    ['2026-11-01', 100, 9], ['2026-11-02', 0, 10],
]);
assert.equal(result['#B'][0].trophies, null);
assert.equal(result['#B'][1].donations, 5);
assert.deepEqual(buildPlayerTrends([], () => null), {});
console.log('PASS: trends are chronologically ordered and preserve valid zero/missing fields');
