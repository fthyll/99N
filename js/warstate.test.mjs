// Run: node js/warstate.test.mjs   (throwaway harness, not part of the app)
//
// Regression guard for the "Incomplete" war cards. A war whose endTime has
// passed must always report a settled result (Victory/Loss/Draw) once the API
// has archived it; a live or still-runnng war must not be scored.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { mergeWarLog } from './warmerge.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, 'render.js'), 'utf8')
  + '\nexport { getWarSummaryHtml };\n';
const tmp = path.join(dir, '.render.probe.mjs');
fs.writeFileSync(tmp, src);

global.document = { getElementById: () => null, querySelectorAll: () => [] };
global.window = {};

const { getWarSummaryHtml } = await import(pathToFileURL(tmp).href);
const base = path.join(dir, '..', 'data', 'war_stats');
const index = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'war_stats_index.json'), 'utf8'));
const now = new Date();
const DECIDED = new Set(['Victory', 'Loss', 'Draw']);
const seen = { warEnded: 0, promoted: 0, stale: 0 };
const labels = {};

const wars = index.map((filename) => ({
  ...JSON.parse(fs.readFileSync(path.join(base, filename), 'utf8')), filename,
}));
const wasFrozen = new Set(wars.filter(w => w.state !== 'warEnded').map(w => w.endTime));

// Same merge the app performs on load.
const warlogPath = path.join(dir, '..', 'data', 'warlog_stats', 'warlog.json');
const warlog = fs.existsSync(warlogPath)
  ? JSON.parse(fs.readFileSync(warlogPath, 'utf8')).items
  : [];
const leftovers = mergeWarLog(wars, warlog);

for (const war of [...wars, ...leftovers]) {
  const html = getWarSummaryHtml(war, now);
  const label = /uppercase tracking-widest leading-none[^>]*>([A-Za-z ]+)<\/p>/.exec(html)?.[1]?.trim();
  labels[`${war.state} => ${label}`] = (labels[`${war.state} => ${label}`] || 0) + 1;

  if (war.state === 'warEnded') {
    seen.warEnded++;
    if (wasFrozen.has(war.endTime)) seen.promoted++;
    if (!DECIDED.has(label)) throw new Error(`regression: decided war lost its result: ${war.filename} -> ${label}`);
    const expected = war.clan.stars > war.opponent.stars ? 'Victory'
      : war.clan.stars < war.opponent.stars ? 'Loss'
      : war.clan.destructionPercentage > war.opponent.destructionPercentage ? 'Victory'
      : war.clan.destructionPercentage < war.opponent.destructionPercentage ? 'Loss' : 'Draw';
    if (label !== expected) throw new Error(`wrong score label ${war.filename}: ${label} != ${expected}`);
  } else {
    seen.stale++;
    if (DECIDED.has(label)) throw new Error(`stale snapshot still scored: ${war.filename} (${war.state}) -> ${label}`);
  }
}

// The user's exact symptom: a war past its endTime may never read "Incomplete".
const past = (w) => Date.parse(
  `${w.endTime.slice(0, 4)}-${w.endTime.slice(4, 6)}-${w.endTime.slice(6, 8)}T${w.endTime.slice(9, 11)}:${w.endTime.slice(11, 13)}:${w.endTime.slice(13, 15)}Z`
) < now;
for (const war of wars.filter(past)) {
  const label = /uppercase tracking-widest leading-none[^>]*>([A-Za-z ]+)<\/p>/
    .exec(getWarSummaryHtml(war, now))?.[1]?.trim();
  if (label === 'Incomplete') {
    throw new Error(`regression: finished war ${war.filename} (end ${war.endTime}) still renders as Incomplete`);
  }
}

console.log('warEnded files checked :', seen.warEnded);
console.log('  promoted from frozen :', seen.promoted);
console.log('stale files checked    :', seen.stale);
console.log('label distribution     :', labels);
console.log('PASS: no finished war renders as Incomplete; no stale snapshot is scored.');
fs.unlinkSync(tmp);