// Run: node js/refresh.test.mjs
// The refresh button already existed; what it lacked was any way to tell the
// reader whether pressing it did anything. These checks pin that report.
import { refreshOutcome, refreshMessage } from './refresh.js';

const check = (name, cond, detail = '') => {
    if (cond) console.log('PASS  ' + name);
    else { console.log('FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); process.exitCode = 1; }
};

const NOW = Date.now;
const AT = '2026-10-02T20:10:05Z';
const LATER = '2026-10-03T06:00:00Z';
const pin = () => { Date.now = () => new Date('2026-10-03T07:00:00Z').getTime(); };
pin();

console.log('a refresh that found new data');

{
    const o = refreshOutcome(null, { fetchedAt: LATER }, null, AT);
    check('reports changed', o.changed === true);
    check('carries the new timestamp', o.latest?.toISOString() === LATER.replace('Z', '.000Z'),
        String(o.latest));
    const m = refreshMessage(o);
    check('message is positive', m.tone === 'good', m.text);
    check('and says data moved', /new data/i.test(m.text), m.text);
}

console.log('a refresh that found nothing — the case worth reporting');

{
    // Same files re-downloaded. The button silently did nothing, which reads
    // as "the scrapers are broken" rather than "nothing has been committed yet".
    const o = refreshOutcome(null, { fetchedAt: AT }, null, AT);
    check('reports unchanged', o.changed === false);
    check('still carries the timestamp', o.latest?.toISOString() === AT.replace('Z', '.000Z'), String(o.latest));
    check('and the age, so the wait is legible', Math.abs(o.ageHours - 10.83) < 0.1, String(o.ageHours));
    const m = refreshMessage(o);
    check('says no change', /No change/.test(m.text), m.text);
    check('says how long', /10h/.test(m.text), m.text);
    check('points away from the page as the cause', /until one lands/i.test(m.text), m.text);
    check('is a warning, not a success', m.tone === 'warn', m.tone);
}

console.log('the first load is not an update');

{
    // Nothing to compare against yet. Claiming "updated" on first paint would
    // be a lie, and would fire every time the page is opened fresh.
    const o = refreshOutcome(null, { fetchedAt: AT }, null, null);
    check('does not claim a change', o.changed === false);
    check('message is the no-change one', /No change/.test(refreshMessage(o).text));
}

console.log('heartbeats missing entirely');

{
    const o = refreshOutcome(null, null, null, AT);
    check('reports no latest', o.latest === null);
    check('and no age', o.ageHours === null);
    const m = refreshMessage(o);
    check('says there is nothing to compare', /nothing to compare/i.test(m.text), m.text);
    check('does not claim an update', !/Updated/i.test(m.text), m.text);
}

console.log('newest wins across the three sources');

{
    const o = refreshOutcome({ fetchedAt: LATER }, { fetchedAt: AT }, { fetchedAt: '2026-10-01T00:00:00Z' }, AT);
    check('takes the newest stamp, not the first', o.latest?.toISOString() === LATER.replace('Z', '.000Z'), String(o.latest));
    check('and compares that against the previous', o.changed === true);
}

console.log('an older commit is not a change');

{
    // e.g. a rollback, or a stale cached heartbeat. Time must not go backwards
    // into "updated".
    const o = refreshOutcome(null, { fetchedAt: AT }, null, LATER);
    check('a backwards stamp is not reported as new', o.changed === false, String(o.changed));
}

console.log('malformed input');

{
    const o = refreshOutcome({ fetchedAt: 'not-a-date' }, { fetchedAt: 'also bad' }, null, AT);
    check('garbage stamps yield no latest', o.latest === null, String(o.latest));
    check('and the message says so', /nothing to compare/i.test(refreshMessage(o).text));
}

console.log('a failed load');

{
    const o = refreshOutcome(null, { fetchedAt: AT }, null, AT);
    const m = refreshMessage(o, true);
    check('is an error', m.tone === 'error', m.tone);
    check('says it failed to load', /failed to load/i.test(m.text), m.text);
    check('and does not blame the scrapers', !/until one lands/i.test(m.text), m.text);
}

console.log('age units');

{
    Date.now = () => new Date('2026-10-03T07:40:00Z').getTime();
    const m = refreshMessage(refreshOutcome(null, { fetchedAt: '2026-10-03T07:00:00Z' }, null, '2026-10-03T07:00:00Z'));
    check('a sub-hour wait reads in minutes', /40m/.test(m.text), m.text);
    Date.now = pin();
}

Date.now = NOW;
console.log('\n' + (process.exitCode ? 'FAILURES above' : 'All refresh-feedback checks passed.'));