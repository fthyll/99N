import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCoCDate } from './constants.js';
import * as R from './render.js';

assert.equal(parseCoCDate('20261013T120000.000Z').toISOString(), '2026-10-13T12:00:00.000Z');
for (const value of [null, 123, '', '20261013120000.000Z', '20261313T120000.000Z']) {
    assert.equal(parseCoCDate(value), null);
}

const els = {};
global.document = {
    getElementById: id => els[id] ??= { innerHTML: '', classList: { add() {}, remove() {} } },
    querySelectorAll: () => [],
};
global.window = {};
const member = { tag: '#A', name: 'TH19', townHallLevel: 19, trophies: 100, donations: 1 };
R.renderMembers([member]);
assert.match(els.memberList.innerHTML, /assets\/Town_Hall19.webp/);
R.renderRaidSummary({ members: [{ ...member, attacks: 1, attackLimit: 5, bonusAttackLimit: 1 }] }, [member]);
assert.match(els.raidSummaryTableBody.innerHTML, /assets\/Town_Hall19.webp/);
R.renderRaidAttendance([{ members: [{ tag: '#B', attacks: 6, attackLimit: 5, bonusAttackLimit: 1 }] }], [member]);
assert.match(els.raidAbsentList.innerHTML, /assets\/Town_Hall19.webp/);
assert.match(R.renderAtkSmall({ defenderTag: '#A', stars: 3, destructionPercentage: 100 }, {
    '#A': { name: 'TH19', th: 19, pos: 1 },
}), /assets\/Town_Hall19.webp/);

const war = JSON.parse(readFileSync(new URL('../data/war_stats/war_20260916T041524.000Z.json', import.meta.url)));
war.filename = 'war_test.json';
const interval = global.setInterval;
global.setInterval = () => 0;
try {
    R.renderWarHistory([war]);
    assert.match(els.warHistoryList.innerHTML, /data-war-file="war_test.json"/);
    R.renderWarHistory([{ ...war, summaryOnly: true }]);
    assert.doesNotMatch(els.warHistoryList.innerHTML, /data-war-file=/);
    assert.doesNotMatch(els.warHistoryList.innerHTML, /<a\b/);
    R.renderWarHistory([war]);
    assert.match(els.warHistoryList.innerHTML, /<a href="#war\/details\/war_test"/);
    assert.match(els.warHistoryList.innerHTML, /aria-label="View war:/);
    assert.match(els.warHistoryList.innerHTML, /focus-visible:outline/);
} finally {
    global.setInterval = interval;
}
console.log('PASS: real TH19 render modules, date parsing, and native war-card links');
