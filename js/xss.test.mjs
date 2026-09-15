// xss-check: a weaponised player/clan name must render inertly everywhere.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
global.document = { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} };
global.window = { location: { hash: '' } };
global.Chart = class { constructor() { this.destroy = () => {}; } };

const { esc, parseCoCDate } = await import(pathToFileURL(path.join(dir, 'constants.js')).href);
const PAYLOAD = '<img src=x onerror=alert(1)>';

let fail = 0;
const t = (name, cond) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name); if (!cond) fail = 1; };

t('esc neutralises markup', esc(PAYLOAD) === '&lt;img src=x onerror=alert(1)&gt;');
t('esc survives quotes/amp', esc(`A & "b" 'c'`) === 'A &amp; &quot;b&quot; &#39;c&#39;');
t('esc passes numbers/undefined', esc(0) === '0' && esc(undefined) === '' && esc(null) === '');

// Run every export of render.js against data whose names are payloads.
const src = fs.readFileSync(path.join(dir, 'render.js'), 'utf8')
  + '\nexport { getWarSummaryHtml };\n';
const tmp = path.join(dir, '.render.probe.mjs');
fs.writeFileSync(tmp, src);
const R = await import(pathToFileURL(tmp).href);

const poison = (o) => {
  for (const k of Object.keys(o)) {
    if (typeof o[k] === 'string' && /name|description|tag/i.test(k) && !k.includes('icon')) o[k] = PAYLOAD;
    else if (Array.isArray(o[k])) o[k].forEach(poison);
    else if (o[k] && typeof o[k] === 'object') poison(o[k]);
  }
  return o;
};

const latest = (idxFile) => {
  const list = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', idxFile), 'utf8'));
  return list[0];
};
const clan = poison(JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'clan_stats', latest('clan_stats_index.json')), 'utf8')));
const raid = poison(JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'raid_stats', latest('raid_stats_index.json')), 'utf8')));
// Synthetic currentwar payload: war archives may legitimately be empty (fresh
// clan), but the XSS-prone war render paths must stay covered by this test.
const atk = { attackerTag: '#A1', defenderTag: '#B1', stars: 2, destructionPercentage: 90, order: 1, duration: 120 };
const war = poison({
  state: 'warEnded', teamSize: 2, attacksPerMember: 2, battleModifier: 'none',
  preparationStartTime: '20260914T030000.000Z', startTime: '20260915T020000.000Z', endTime: '20260916T020000.000Z',
  clan: { tag: '#C', name: 'n', badgeUrls: { small: 'u' }, clanLevel: 1, attacks: 2, stars: 4, destructionPercentage: 90,
          members: [{ tag: '#A1', name: 'n', townhallLevel: 16, mapPosition: 1, attacks: [atk], opponentAttacks: [atk], bestOpponentAttack: atk }] },
  opponent: { tag: '#O', name: 'n', badgeUrls: { small: 'u' }, clanLevel: 1, attacks: 1, stars: 2, destructionPercentage: 60,
          members: [{ tag: '#B1', name: 'n', townhallLevel: 15, mapPosition: 1, attacks: [atk], opponentAttacks: [atk], bestOpponentAttack: atk }] },
});
war.filename = 'x.json';

const bodies = [
  ['getWarSummaryHtml', R.getWarSummaryHtml ? R.getWarSummaryHtml(war, new Date()) : ''],
  ['renderWarHistory', (() => { R.renderWarHistory([war]); return document.__warHistoryList || ''; })()],
  ['renderMembers', (() => { R.renderMembers(clan.memberList.slice(0, 3)); return ''; })()],
];

// render* write into fake containers: capture innerHTML instead of trusting stdout.
const captured = {};
const fakeEl = (id) => ({ id, innerHTML: '', classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, setAttribute() {}, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [], onclick: null, onchange: null });
const els = {};
global.document.getElementById = (id) => (els[id] ??= fakeEl(id));
global.document.querySelectorAll = () => [];

R.renderMembers(clan.memberList.slice(0, 5));
R.renderWarHistory([war]);
R.renderAbout(clan);
R.renderWarDetail(war, [war]);
R.renderRaidSummary(raid, clan.memberList);
R.renderRaidAttacks(raid);
R.renderRaidDefenses(raid);

for (const [id, el] of Object.entries(els)) {
  const hit = el.innerHTML.includes(PAYLOAD);
  t(`container #${id} free of raw payload`, !hit);
  if (hit) { const i = el.innerHTML.indexOf(PAYLOAD); console.log('   ...' + el.innerHTML.slice(Math.max(0, i - 60), i + 40).replace(/\n/g, ' ') + '...'); }
}
const allHtml = Object.values(els).map(e => e.innerHTML).join('');
t('escaped form present (names still visible)', allHtml.includes('&lt;img src=x onerror'));
// Diagnostic: is there ever a RAW '<' immediately starting the payload tag?
const rawTag = allHtml.match(/<[a-zA-Z][^>]{0,40}onerror\s*=/gi) || [];
if (rawTag.length) console.log('  raw onerror-tag matches:', rawTag.slice(0, 3));
// A live handler needs a RAW '<' opening the payload tag. Escaped '&lt;' inside
// an attribute value is inert text, so match only raw-angle occurrences.
t('payload never appears with a raw angle bracket', !allHtml.includes('<img src=x'));

fs.unlinkSync(tmp);
process.exit(fail);
