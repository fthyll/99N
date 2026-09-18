/**
 * Tests for js/raidstats.js.
 *
 * Run: node js/raidstats.test.mjs
 *
 * Uses the real raid payload from data/ when present so the counting rules are
 * checked against data the API actually produces, plus hand-built fixtures for
 * the edge cases the real file does not cover.
 */

import assert from 'node:assert';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { raidParticipation, raidAbsentees, raidAttendanceHistory, raidAttendanceSummary, isDormant, splitAbsentees } from './raidstats.js';

let passed = 0;
let failed = 0;

function check(name, fn) {
    try {
        fn();
        console.log(`  PASS  ${name}`);
        passed++;
    } catch (e) {
        console.log(`  FAIL  ${name}: ${e.message}`);
        failed++;
    }
}

const m = (name, attacks, opts = {}) => ({
    tag: opts.tag || `#${name}`,
    name,
    attacks,
    attackLimit: opts.limit ?? 5,
    bonusAttackLimit: opts.bonus ?? 1,
    capitalResourcesLooted: opts.loot ?? 1000,
});

console.log('participation split');

check('splits complete / incomplete / untouched', () => {
    const raid = { members: [m('full', 6), m('part', 3), m('none', 0)] };
    const r = raidParticipation(raid);
    assert.strictEqual(r.complete.length, 1);
    assert.strictEqual(r.incomplete.length, 1);
    assert.strictEqual(r.untouched.length, 1);
    assert.strictEqual(r.participants, 3);
});

check('uses attackLimit + bonusAttackLimit as the allowance', () => {
    // 5 + 1 = 6 is the cap, so 6 attacks counts as complete, not over.
    const r = raidParticipation({ members: [m('a', 6), m('b', 7)] });
    assert.strictEqual(r.complete.length, 2, 'over-limit attacks must still be complete');
});

check('reports attacks remaining per member', () => {
    const r = raidParticipation({ members: [m('a', 2), m('b', 6)] });
    assert.strictEqual(r.incomplete[0].attacksRemaining, 4);
    assert.strictEqual(r.complete[0].attacksRemaining, 0);
});

check('never reports negative attacks remaining', () => {
    const r = raidParticipation({ members: [m('over', 9)] });
    assert.strictEqual(r.complete[0].attacksRemaining, 0);
});

check('orders incomplete by most attacks left', () => {
    const raid = { members: [m('small', 5), m('big', 1), m('mid', 3)] };
    const names = raidParticipation(raid).incomplete.map(x => x.name);
    assert.deepStrictEqual(names, ['big', 'mid', 'small']);
});

check('aggregates attacks used vs possible', () => {
    const r = raidParticipation({ members: [m('a', 6), m('b', 2)] });
    assert.strictEqual(r.attacksUsed, 8);
    assert.strictEqual(r.attacksPossible, 12);
});

check('tolerates an empty or missing payload', () => {
    assert.strictEqual(raidParticipation(null).participants, 0);
    assert.strictEqual(raidParticipation({}).participants, 0);
    assert.deepStrictEqual(raidParticipation({}).complete, []);
});

check('tolerates members missing attack fields', () => {
    const r = raidParticipation({ members: [{ tag: '#x', name: 'x' }] });
    assert.strictEqual(r.untouched.length, 1, 'missing attacks counts as zero');
    assert.strictEqual(r.untouched[0].allowance, 0);
});

check('bonus attack limit affects completeness', () => {
    const raid = { members: [m('nobonus', 5, { bonus: 0 })] };
    assert.strictEqual(raidParticipation(raid).complete.length, 1, '5/5 with no bonus is complete');
});

console.log('absentee detection');

const roster = [
    { tag: '#a', name: 'Alpha', townHallLevel: 16 },
    { tag: '#b', name: 'Bravo', townHallLevel: 15 },
    { tag: '#c', name: 'Charlie', townHallLevel: 14 },
];

check('finds roster members missing from the raid', () => {
    const raid = { members: [{ tag: '#a', name: 'Alpha', attacks: 6 }] };
    const absent = raidAbsentees(raid, roster);
    assert.deepStrictEqual(absent.map(x => x.name), ['Bravo', 'Charlie']);
    assert.strictEqual(absent[0].townHallLevel, 15);
});

check('returns nothing when everyone raided', () => {
    const raid = { members: roster.map(m => ({ ...m, attacks: 6 })) };
    assert.deepStrictEqual(raidAbsentees(raid, roster), []);
});

check('an empty roster yields no absentees', () => {
    assert.deepStrictEqual(raidAbsentees({ members: [] }, []), []);
});

console.log('attendance history');

check('attendance rate uses the roster size, not participants', () => {
    // 34 raided out of 50: everyone who showed up attacked fully, yet
    // attendance is 68% — this is the number that matters.
    const members = Array.from({ length: 34 }, (_, i) => m(`p${i}`, 6, { tag: `#p${i}` }));
    const bigRoster = Array.from({ length: 50 }, (_, i) => ({ tag: `#p${i}`, name: `p${i}` }));
    const [row] = raidAttendanceHistory([{ startTime: 'T1', members }], bigRoster);
    assert.strictEqual(row.participants, 34);
    assert.strictEqual(row.absent, 16);
    assert.strictEqual(row.rosterSize, 50);
    assert.strictEqual(row.attendanceRate, 34 / 50);
    assert.strictEqual(row.completionRate, 1);
});

check('ignores raids with no members array', () => {
    assert.deepStrictEqual(raidAttendanceHistory([null, {}, { members: [] }], roster).length, 1);
});

check('summary is null when there is no history', () => {
    assert.strictEqual(raidAttendanceSummary([], roster), null);
    assert.strictEqual(raidAttendanceSummary([{ members: [] }], roster), null);
});

check('summary averages across weekends', () => {
    const raids = [
        { startTime: 'T1', members: [m('a', 6, { tag: '#a' }), m('b', 6, { tag: '#b' })] },
        { startTime: 'T2', members: [m('a', 6, { tag: '#a' })] },
    ];
    const s = raidAttendanceSummary(raids, roster);
    assert.strictEqual(s.weekends, 2);
    assert.strictEqual(s.avgParticipants, 1.5);
});

check('worstAbsentees carries the dormant flag so callers can filter', () => {
    // The raid needs a participant, otherwise the summary is null by design.
    const raids = [{ startTime: 'T1', members: [{ tag: '#somebody', name: 'Somebody', attacks: 6 }] }];
    const r2 = [
        { tag: '#alt', name: 'Alt', trophies: 0, donations: 0 },
        { tag: '#active', name: 'Active', trophies: 800, donations: 10 },
    ];
    const s = raidAttendanceSummary(raids, r2);
    const alt = s.worstAbsentees.find(x => x.name === 'Alt');
    const act = s.worstAbsentees.find(x => x.name === 'Active');
    assert.strictEqual(alt.inactive, true);
    assert.strictEqual(act.inactive, false);
});

check('ranks worst absentee across weekends', () => {
    const raids = [
        { startTime: 'T1', members: [m('a', 6, { tag: '#a' })] },
        { startTime: 'T2', members: [m('a', 6, { tag: '#a' })] },
    ];
    const s = raidAttendanceSummary(raids, roster);
    // Bravo and Charlie missed both; Alpha missed none.
    const names = s.worstAbsentees.map(x => x.name).sort();
    assert.deepStrictEqual(names, ['Bravo', 'Charlie']);
    assert.strictEqual(s.worstAbsentees[0].missed, 2);
});


console.log('dormant vs active absentees');

check('zero trophies AND zero donations is dormant', () => {
    assert.strictEqual(isDormant({ trophies: 0, donations: 0 }), true);
});

check('a player donating but at 0 trophies is NOT dormant', () => {
    // Guards the real case: an active member between seasons sits at 0
    // trophies, and must not be written off as an unused alt.
    assert.strictEqual(isDormant({ trophies: 0, donations: 250 }), false);
});

check('a player with trophies but no donations is NOT dormant', () => {
    assert.strictEqual(isDormant({ trophies: 1200, donations: 0 }), false);
});

check('missing fields are treated as dormant, not as active', () => {
    assert.strictEqual(isDormant({}), true);
    assert.strictEqual(isDormant(null), true);
});

check('splits absentees into the two groups', () => {
    const raid = { members: [{ tag: '#here', name: 'Here', attacks: 6 }] };
    const bigRoster = [
        { tag: '#here', name: 'Here' },
        { tag: '#alt1', name: 'Alt1', trophies: 0, donations: 0, townHallLevel: 8 },
        { tag: '#alt2', name: 'Alt2', trophies: 0, donations: 0, townHallLevel: 8 },
        { tag: '#lazy', name: 'Lazy', trophies: 900, donations: 40, townHallLevel: 15 },
    ];
    const s = splitAbsentees(raid, bigRoster);
    assert.strictEqual(s.dormant.length, 2);
    assert.strictEqual(s.neglected.length, 1);
    assert.strictEqual(s.neglected[0].name, 'Lazy');
    assert.strictEqual(s.all.length, 3, 'split must not drop anyone');
});

check('absentees keep their activity fields for labelling', () => {
    const raid = { members: [] };
    const [row] = raidAbsentees(raid, [{ tag: '#x', name: 'X', trophies: 0, donations: 0, expLevel: 37 }]);
    assert.strictEqual(row.inactive, true);
    assert.strictEqual(row.expLevel, 37);
});

console.log('against the real archived raid');

const dir = 'data/raid_stats';
if (existsSync(dir)) {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    if (files.length) {
        const raid = JSON.parse(readFileSync(`${dir}/${files[0]}`, 'utf8'));
        check(`parses ${files[0]} without throwing`, () => {
            const r = raidParticipation(raid);
            assert.ok(r.participants > 0, 'should find participants');
            assert.strictEqual(r.complete.length + r.incomplete.length + r.untouched.length, r.participants);
            assert.ok(r.attacksPossible >= r.attacksUsed, 'cannot use more than allowed');
        });
        check('real raid split is self-consistent', () => {
            const r = raidParticipation(raid);
            assert.strictEqual(r.participants, raid.members.length);
        });
        check('real data: absentees are never silently dropped by the split', () => {
            const clanFile = 'data/clan_stats/members_20260917.json';
            if (existsSync(clanFile)) {
                const roster = JSON.parse(readFileSync(clanFile, 'utf8')).memberList || [];
                const s = splitAbsentees(raid, roster);
                assert.strictEqual(s.dormant.length + s.neglected.length, s.all.length);
            }
        });
    } else {
        console.log('  SKIP  no archived raid files');
    }
} else {
    console.log('  SKIP  data/raid_stats not present');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
