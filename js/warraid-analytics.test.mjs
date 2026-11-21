import assert from 'node:assert/strict';
import { summarizeWars, summarizeRaids, renderWarRaidAnalytics } from './warraid-analytics.js';

const wars = [
    {
        state: 'warEnded', startTime: '20261101T000000.000Z', teamSize: 2, attacksPerMember: 2,
        clan: { name: '99N', stars: 5, destructionPercentage: 90, members: [
            { tag: '#A', name: 'Alpha', attacks: [{ stars: 3 }, { stars: 2 }] },
            { tag: '#B', name: 'Beta', attacks: [{ stars: 0 }] },
        ] },
        opponent: { name: 'Rival', stars: 4, destructionPercentage: 80 },
    },
    { state: 'inWar', startTime: '20261102T000000.000Z', teamSize: 2, attacksPerMember: 2,
      clan: { stars: 10, members: [{ tag: '#A', attacks: [{ stars: 3 }] }] }, opponent: { stars: 0 } },
];
const warSummary = summarizeWars(wars);
assert.equal(warSummary.length, 1);
assert.equal(warSummary[0].result, 'win');
assert.equal(warSummary[0].attacksUsed, 3);
assert.equal(warSummary[0].attacksPossible, 4);
assert.equal(warSummary[0].attackRate, 0.75);
assert.equal(warSummary[0].topPlayer.name, 'Alpha');

const raids = [{
    startTime: '20261113T070000.000Z', state: 'ended', capitalTotalLoot: 10000,
    raidsCompleted: 7, totalAttacks: 4, enemyDistrictsDestroyed: 3,
    members: [
        { tag: '#A', attacks: 3, attackLimit: 2, bonusAttackLimit: 1, capitalResourcesLooted: 6000 },
        { tag: '#B', attacks: 1, attackLimit: 2, bonusAttackLimit: 0, capitalResourcesLooted: 4000 },
    ],
}];
const raidSummary = summarizeRaids(raids);
assert.equal(raidSummary.length, 1);
assert.equal(raidSummary[0].participants, 2);
assert.equal(raidSummary[0].attacksUsed, 4);
assert.equal(raidSummary[0].attacksPossible, 5);
assert.equal(raidSummary[0].districtsDestroyedPerAttack, 0.75);
assert.equal(raidSummary[0].totalLoot, 10000);

const els = {};
global.document = { getElementById: id => els[id] ??= { innerHTML: '' } };
renderWarRaidAnalytics(wars, raids);
assert.match(els.warAnalytics.innerHTML, /Attack use/);
assert.match(els.raidAnalytics.innerHTML, /Districts per attack/);
assert.doesNotMatch(els.warAnalytics.innerHTML, /inWar/);
renderWarRaidAnalytics([], []);
assert.match(els.warAnalytics.innerHTML, /No finished wars/);
assert.match(els.raidAnalytics.innerHTML, /No raid snapshots/);
console.log('PASS: war/raid aggregates exclude partial war data and render useful empty states');
