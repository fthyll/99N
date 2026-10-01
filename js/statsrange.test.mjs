// Run: node js/statsrange.test.mjs
//
// The Stats tab's default range ("This Month") is empty whenever no war started
// inside the current calendar month — every war from the previous month, and on
// the 1st of a month essentially always. Three panels then render blank with no
// explanation. These checks pin the empty-range fallback so that never ships.
import { resolveStatsRange } from './statsrange.js';

const check = (name, cond, detail = '') => {
    if (cond) console.log('PASS  ' + name);
    else { console.log('FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); process.exitCode = 1; }
};

const cocStamp = (d) => d.toISOString().replace(/[-:T]/g, '').substring(0, 15) + '000Z';
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

// A finished war with a roster, dated the day it started.
const war = (startTime, stars = 20) => ({
    startTime, endTime: startTime.slice(0, 8) + 'T235959.000Z', state: 'warEnded',
    teamSize: 10, attacksPerMember: 2,
    clan: { stars, destructionPercentage: 90, members: [{ tag: '#A', attacks: [{ stars: 3 }] }] },
    opponent: { stars: 10, destructionPercentage: 40 },
});

console.log('a range with data is used as-is');
{
    const wars = [war(cocStamp(daysAgo(2)))];
    const r = resolveStatsRange(wars, 'week', new Date());
    check('week with data needs no fallback', r.fallbackFrom === null && r.wars.length === 1,
        `fallbackFrom=${r.fallbackFrom} wars=${r.wars.length}`);
    check('and is labelled plainly', r.label === 'This Week', 'label=' + r.label);
}

console.log('the empty calendar month — the reported bug');
{
    // Two wars 40 days ago: inside the current year but not the current month.
    const wars = [war(cocStamp(daysAgo(40)), 30), war(cocStamp(daysAgo(41)), 24)];
    const r = resolveStatsRange(wars, 'month', new Date());
    check('falls back instead of rendering three blank panels',
        r.fallbackFrom === 'month' && r.wars.length > 0, `fallbackFrom=${r.fallbackFrom} wars=${r.wars.length}`);
    check('the fallback names both the real range and why',
        /Previous War/.test(r.label) && /this month/i.test(r.label), 'label=' + r.label);
}

console.log('an empty month falls back to this week when a week exists');
{
    const wars = [war(cocStamp(daysAgo(2)), 30), war(cocStamp(daysAgo(40)), 24)];
    const r = resolveStatsRange(wars, 'month', new Date());
    check('week is preferred over the single previous war',
        r.range === 'week' && r.wars.length === 1, `range=${r.range} wars=${r.wars.length}`);
    check('label says so', /This Week/.test(r.label), 'label=' + r.label);
}

console.log('an empty week falls back further, not to a blank');
{
    const wars = [war(cocStamp(daysAgo(40)), 30)];
    const r = resolveStatsRange(wars, 'week', new Date());
    check('week -> previous war, which does have data',
        r.fallbackFrom === 'week' && r.range === 'prev' && r.wars.length === 1,
        `range=${r.range} wars=${r.wars.length}`);
}

console.log('empty across every range');
{
    const r = resolveStatsRange([], 'month', new Date());
    check('reports empty rather than inventing data', r.wars.length === 0 && r.fallbackFrom === 'month');
    check('and still yields a readable label', typeof r.label === 'string' && r.label.length > 0, 'label=' + r.label);
}

console.log('undecided wars never supply data');
{
    const live = war(cocStamp(daysAgo(1)));
    live.state = 'inWar';
    const r = resolveStatsRange([live], 'week', new Date());
    check('a partial score is not averaged in as final', r.wars.length === 0, 'wars=' + r.wars.length);
}

console.log('previous war picks the newest finished war');
{
    const wars = [war(cocStamp(daysAgo(40)), 10), war(cocStamp(daysAgo(3)), 30), war(cocStamp(daysAgo(1)), 5)];
    wars[2].state = 'inWar';  // newest but unfinished
    const r = resolveStatsRange(wars, 'prev', new Date());
    check('returns exactly the last finished war, 30 stars',
        r.wars.length === 1 && r.wars[0].clan.stars === 30, `wars=${r.wars.length}`);
}

console.log('degenerate input');
{
    check('undefined history is safe', resolveStatsRange(undefined, 'month', new Date()).wars.length === 0);
    check('null history is safe', resolveStatsRange(null, 'week', new Date()).wars.length === 0);
    check('unknown range passes everything through',
        resolveStatsRange([war(cocStamp(daysAgo(40)))], 'all', new Date()).wars.length === 1);
}

console.log(process.exitCode ? '\nFAILURES' : '\nAll statsrange checks passed.');