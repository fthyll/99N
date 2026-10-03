// Run: node js/chartdata.test.mjs
// The canvas charts are a picture: a screen reader sees nothing, and a shared
// screenshot loses the graph entirely. These checks pin the text twin that
// makes the same numbers available without the chart.
import { readFileSync } from 'fs';

// charts.js touches document/Chart at module scope? No — only inside functions,
// so the module imports cleanly. paintChartData is not exported, so exercise it
// through the exported entry point with a minimal DOM stub.
import { renderCharts } from './charts.js';

const check = (name, cond, detail = '') => {
    if (cond) console.log('PASS  ' + name);
    else { console.log('FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); process.exitCode = 1; }
};

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// A canvas is not text. The twin is what carries the numbers.
console.log('the markup carries the text twin');

check('trend canvas is labelled for assistive tech',
    /id="starsTrendChart"[^>]*role="img"/.test(html) && /id="starsTrendChart"[^>]*aria-label="[^"]{20,}"/.test(html));
check('efficiency canvas is labelled too',
    /id="efficiencyChart"[^>]*role="img"/.test(html) && /id="efficiencyChart"[^>]*aria-label="[^"]{20,}"/.test(html));
check('a host exists for the trend twin', /id="starsTrendData"[^>]*sr-only/.test(html));
check('a host exists for the efficiency twin', /id="efficiencyData"[^>]*sr-only/.test(html));
check('the twin is hidden from sight, not from AT', (html.match(/class="sr-only"/g) || []).length >= 2);

// The aria-label must not promise a table that does not exist in the markup;
// paintChartData builds it at runtime into the sr-only hosts above.
console.log('the label points at a table that exists');

check('trend label mentions the table', /starsTrendChart[^>]*aria-label="[^"]*table below/i.test(html));
check('efficiency label mentions the table', /efficiencyChart[^>]*aria-label="[^"]*table below/i.test(html));

// sr-only must not rely on display:none, which removes it from the a11y tree.
const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
console.log('sr-only keeps the content reachable');

check('sr-only is defined', /\.sr-only\s*\{/.test(css));
check('sr-only does not use display:none', !/\.sr-only\s*\{[^}]*display:\s*none/.test(css));
check('sr-only uses clip, which keeps it in the tree', /\.sr-only\s*\{[^}]*clip/.test(css));

console.log('keyboard focus is visible');

check(':focus-visible is defined globally', /:focus-visible\s*\{/.test(css));
const focusBlock = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] || '';
check('the focus ring has an outline', /outline:\s*\S/.test(focusBlock), focusBlock.trim().slice(0, 80));

// Markup alone does not prove the twin is populated: paintChartData could fail
// to find its host, or be never called. Drive the real render entry point
// against a stub DOM and read the numbers back out.
console.log('the twin is actually filled by a render');

const war = (startTime, stars, teamSize, attacks) => ({
    startTime, endTime: startTime, state: 'warEnded', teamSize, result: 'win',
    clan: { stars, members: [{ tag: '#AAA', name: 'Alpha', attacks }] },
    opponent: { stars: 0, members: [] },
});
// 30 stars out of 40 attackers * 3 = 120 available = 25.0%.
const wars = [war('20261001T000000.000Z', 30, 40, [
    { stars: 3 }, { stars: 2 }, { stars: 0 },
])];

const hosts = {};
globalThis.document = {
    getElementById: (id) => (id in hosts ? hosts[id] : null),
    documentElement: {},
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '0 0 0' });
globalThis.Chart = class {
    constructor(ctx, cfg) { this.cfg = cfg; }
    destroy() {}
};
// The parser lives in constants.js and is already covered; a fixed stamp keeps
// this independent of the wall clock.
const originalNow = Date;
globalThis.Date = class extends originalNow {
    constructor(...a) { return a.length ? new originalNow(...a) : new originalNow('2026-10-15T12:00:00Z'); }
    static now() { return new originalNow('2026-10-15T12:00:00Z').getTime(); }
};

hosts.starsTrendData = { innerHTML: '' };
hosts.efficiencyData = { innerHTML: '' };
hosts.statsRangeNote = { textContent: '', classList: { toggle: () => {} } };
// The canvases must exist but expose no context, so the chart itself is skipped
// by Chart.js never being reached while the text twin still gets written. A
// missing element would return early and prove nothing about the twin.
hosts.starsTrendChart = { getContext: () => null };
hosts.efficiencyChart = { getContext: () => null };

try {
    renderCharts(wars, 'month');
} finally {
    globalThis.Date = originalNow;
    delete globalThis.document;
}

const trend = hosts.starsTrendData.innerHTML;
check('the trend twin has a table', /<table/.test(trend), trend.slice(0, 120));
check('it carries the computed percentage', /25\.0/.test(trend), trend.replace(/<[^>]+>/g, ' ').trim().slice(0, 120));
check('rows are real table rows', (trend.match(/<tr>/g) || []).length >= 2, String((trend.match(/<tr>/g) || []).length));

const eff = hosts.efficiencyData.innerHTML;
check('the efficiency twin has a table', /<table/.test(eff), eff.slice(0, 120));
check('it carries all four star bands', /3-Star/.test(eff) && /2-Star/.test(eff) && /1-Star/.test(eff) && /Fail/.test(eff));
// Three attacks (3-star, 2-star, fail) -> 33.3 / 33.3 / 0.0 / 33.3 = 100.
const bands = [...eff.matchAll(/<td class="text-right py-1 pl-2 font-mono">([\d.]+)<\/td>/g)].map(m => Number(m[1]));
check('the four bands are there and total 100', bands.length === 4 && Math.abs(bands.reduce((a, b) => a + b, 0) - 100) < 0.5,
    bands.join(', '));
check('a zero-star-only band really reads 0.0', /0\.0/.test(eff), bands.join(', '));

console.log('\n' + (process.exitCode ? 'FAILURES above' : 'All chart-text-twin checks passed.'));
