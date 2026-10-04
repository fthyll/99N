// Run: node js/cwl.test.mjs
import { renderCwlPanel } from './cwl.js';

const check = (name, cond, detail = '') => {
    if (cond) console.log('PASS  ' + name);
    else { console.log('FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); process.exitCode = 1; }
};

const row = (tag, name, w, d, l, pos, th = 15) => ({
    tag, name, wins: w, draws: d, losses: l, position: pos,
    stars: w * 30, townHallLevels: [th], badgeUrls: { small: `${tag.slice(1).toLowerCase()}.png` },
});

console.log('outside a season');
{
    const html = renderCwlPanel(null, '#99N');
    check('says so in words', /Not in a season/i.test(html), html.slice(0, 120));
    check('shows no zeroed record', !/Position/.test(html) && !/Record/.test(html));
    check('keeps the panel heading', /Clan War League/.test(html));
}

console.log('a lookup that failed is not a quiet season');

{
    // The distinction that let the dead /cwl/ endpoint go unnoticed for weeks:
    // a null and a failed lookup rendered identically.
    const failed = renderCwlPanel({ state: 'unavailable', httpStatus: 500 }, '#99N');
    check('does not claim the clan is out of season', !/Not in a season/i.test(failed), failed.slice(0, 200));
    check('names the fault', /Lookup failed/i.test(failed));
    check('surfaces the HTTP status', /HTTP 500/.test(failed), failed.match(/HTTP \d+/)?.[0]);
    check('says it is a scraper fault, not a quiet league', /scraper fault/i.test(failed));

    const quiet = renderCwlPanel({ state: 'notInSeason' }, '#99N');
    check('a real out-of-season still says so', /Not in a season/i.test(quiet));
    check('and is worded as a season, not a fault', !/Lookup failed/i.test(quiet));

    check('a failure status with no code still reads', /HTTP \?/.test(renderCwlPanel({ state: 'unavailable' }, '#99N')));
}

console.log('a group with no decided war yet');
{
    const cwl = { state: 'preparation', season: '2026-10', standings: [row('#AAA', 'Alpha', 0, 0, 0, 1), row('#BBB', 'Beta', 0, 0, 0, 2)] };
    const html = renderCwlPanel(cwl, '#AAA');
    check('lists every clan', (html.match(/Alpha/g) || []).length === 1 && /Beta/.test(html));
    check('says no war decided yet', /No war decided yet/i.test(html));
    check('own row is marked', /bg-raise/.test(html));
    check('record reads 0-0-0 honestly', /0-0-0/.test(html), html.match(/\d-\d-\d/)?.[0]);
}

console.log('mid-season standings');
{
    const cwl = {
        state: 'inWar', season: '2026-09',
        standings: [row('#AAA', 'Alpha', 4, 1, 1, 1, 16), row('#BBB', 'Beta', 3, 0, 3, 2, 14)],
    };
    const html = renderCwlPanel(cwl, '#BBB');
    check('points are wins*3 + draws = 13 for Beta', />13</.test(html), html.match(/>\d+</g)?.join(','));
    check('own position is shown', /#2/.test(html));
    check('status reflects a live battle day', /Battle day live/i.test(html));
    check('every clan gets a row', /Alpha/.test(html) && /Beta/.test(html));
    check('no "no war decided" note when wars are played', !/No war decided yet/.test(html));
}

console.log('a held table after a failed refresh');
{
    // The exact shape the scraper now writes when a good table is held across
    // a 500: the last standings survive, stale:true, error attached. The panel
    // must show the table with a visible warning, not "Lookup failed" — that
    // is what made a live league read as dead for 15 minutes.
    const held = {
        state: 'inWar', season: '2026-10', stale: true,
        error: 'last refresh failed: HTTP 500',
        standings: [row('#AAA', 'Alpha', 1, 0, 0, 1), row('#BBB', 'Beta', 0, 0, 1, 2)],
    };
    const html = renderCwlPanel(held, '#AAA');
    check('still renders the table', /Alpha/.test(html) && /Beta/.test(html));
    check('still shows it as a live season', /Battle day live/i.test(html));
    check('does NOT read as a dead lookup', !/Lookup failed/i.test(html));
    check('the failure is shown, not hidden', /last refresh failed/i.test(html), html.match(/last refresh[^<]*/)?.[0]);
    check('it says the table is held', /last good standings/i.test(html));
    check('it is announced as a status region for screen readers', /role="status"/.test(html));

    // The error string is API-derived; it must be escaped, not injected.
    const injected = {
        state: 'inWar', season: 's', stale: true,
        error: '<img src=x onerror=alert(1)>',
        standings: [row('#AAA', 'Alpha', 1, 0, 0, 1)],
    };
    // The danger is the tag, not the words: the angle brackets must be
    // neutralised so the string renders as text.
    check('a hostile error string is escaped',
        !/<img src=x onerror/.test(renderCwlPanel(injected, '#AAA')));

    // A held table that has no error text still warns.
    const noText = { state: 'inWar', season: 's', stale: true, standings: [row('#AAA', 'Alpha', 1, 0, 0, 1)] };
    check('missing error falls back to a generic warning', /Last refresh failed/i.test(renderCwlPanel(noText, '#AAA')));
}

console.log('a non-stale table shows no warning');
{
    const clean = { state: 'inWar', season: '2026-10', standings: [row('#AAA', 'Alpha', 1, 0, 0, 1), row('#BBB', 'Beta', 0, 0, 1, 2)] };
    check('no held-staleness banner on a fresh table', !/last refresh failed/i.test(renderCwlPanel(clean, '#AAA')));
}

console.log('missing or malformed meta never throws');
{
    check('undefined is safe', /Not in a season/i.test(renderCwlPanel(undefined, '#AAA')));
    check('empty standings is safe', /Not in a season/i.test(renderCwlPanel({ standings: [] }, '#AAA')));
    check('a missing state falls back to the no-season wording',
        /Not in a season/i.test(renderCwlPanel({ season: 'x', standings: [row('#AAA', 'A', 0, 0, 0, 1)] }, '#AAA')));
    check('a row without badgeUrls still renders', /Alpha/.test(
        renderCwlPanel({ season: 'x', standings: [{ tag: '#AAA', name: 'Alpha', wins: 1, draws: 0, losses: 0, position: 1 }] }, '#AAA')));
}

console.log('escaping');
{
    const nasty = row('#ZZZ', '<img src=x onerror=alert(1)>', 1, 0, 0, 1);
    nasty.badgeUrls = {};
    const html = renderCwlPanel({ season: '<b>s</b>', standings: [nasty] }, '#AAA');
    check('clan name is escaped', !/<img src=x/.test(html) && /&lt;img/.test(html));
    check('season is escaped', !/<b>s<\/b>/.test(html));
}

console.log(process.exitCode ? '\nFAILURES' : '\nAll cwl checks passed.');