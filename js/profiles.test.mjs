import assert from 'node:assert/strict';
import { filterMembers, memberProfileFallback, renderPlayerProfile, renderPlayerTrend } from './player-profile.js';
import { renderRankings } from './render-rankings.js';

const member = { tag: '#P1', name: '<Player>', townHallLevel: 18 };
const profiles = {
    '#P1': { warPreference: 'IN' },
    '#P2': { warPreference: 'out' },
};
assert.deepEqual(filterMembers([member, { tag: '#P2', name: 'Other', townHallLevel: 17 }], {
    query: 'p1', profiles,
}), [member]);
assert.deepEqual(filterMembers([member, { tag: '#P2', townHallLevel: 17 }], {
    warPreference: 'in', profiles,
}), [member]);
assert.deepEqual(filterMembers([member, { tag: '#P3', townHallLevel: 17 }], {
    warPreference: 'unknown', profiles,
}).map(m => m.tag), ['#P3']);
assert.deepEqual(filterMembers([member], { townHall: '18' }), [member]);
assert.deepEqual(filterMembers([member], { townHall: '17' }), []);

const trend = renderPlayerTrend([
    { date: '2026-01-01', trophies: 100 },
    { date: '2026-01-02', trophies: null },
    { date: '2026-01-03', trophies: 90 },
]);
assert.match(trend, /2 valid snapshots/);
assert.match(trend, /change -10/);
assert.match(renderPlayerTrend([{ trophies: null }]), /Not enough archived snapshots/);
assert.match(renderPlayerProfile({ tag: '#P1', name: '<img src=x onerror=alert(1)>', townHallLevel: 18 }), /&lt;img/);
const fallback = memberProfileFallback(member, { warStars: 22, name: 'Old Player' });
assert.equal(fallback.profileArchiveAvailable, false);
assert.match(renderPlayerProfile(fallback), /Detailed player profile was not archived/);
assert.match(renderPlayerProfile(fallback), /22/);
assert.match(renderPlayerProfile(fallback, {trend: [{date: '2026-01-01', trophies: 5}, {date: '2026-01-02', trophies: 9}]}), /data-profile-trend/);
assert.match(renderPlayerProfile(fallback, {trend: [{date: '2026-01-01', trophies: 5}, {date: '2026-01-02', trophies: 9}]}), /change \+4/);

const els = {};
global.document = { getElementById: id => els[id] ??= { innerHTML: '', textContent: '' } };
renderRankings({ rankings: { players: { global: {
    locationName: 'Global', fetchedAt: '2026-11-20T00:00:00Z',
    items: [{ rank: 1, previousRank: 3, name: '<Rival>', tag: '#P2', trophies: 5000 }],
} } } }, 'players', 'global');
assert.match(els.rankingsTable.innerHTML, /&lt;Rival&gt;/);
assert.match(els.rankingsTable.innerHTML, /↑ 2/);
assert.match(els.rankingsFreshness.textContent, /Global · 1 entries/);
renderRankings({ rankings: { players: { global: { items: [{ rank: 1, name: 'Top' }] } } } }, 'players', 'global');
assert.match(els.rankingsTable.innerHTML, /—<\/td><\/tr>/);
renderRankings({ rankings: { players: { global: { items: [], fetchedAt: '2026-11-20T00:00:00Z' } } } }, 'players', 'global');
assert.match(els.rankingsFreshness.textContent, /global · 0 entries/);
const hundredRows = Array.from({length: 100}, (_, rank) => ({rank: rank + 1, name: `P${rank + 1}`}));
renderRankings({rankings:{players:{global:{items:hundredRows}}}}, 'players', 'global');
assert.equal((els.rankingsTable.innerHTML.match(/<tr>/g) || []).length, 51); // 50 data rows plus the header.
assert.match(els.rankingsTable.innerHTML, /Showing 50 of 100 cached entries/);
renderRankings({rankings:{players:{global:{items:hundredRows}}}}, 'players', 'global', 200);
assert.equal((els.rankingsTable.innerHTML.match(/<tr>/g) || []).length, 101);
assert.doesNotMatch(els.rankingsTable.innerHTML, /Showing 100 of 100/);
renderRankings(null, 'players', 'global');
assert.match(els.rankingsTable.innerHTML, /next successful daily API sync/);
console.log('PASS: player filtering, missing history values, profile escaping, rankings and empty state');
