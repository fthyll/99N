// Run: node js/.warstate.test.mjs   (throwaway harness, not part of the app)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

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
const seen = { warEnded: 0, stale: 0 };
const labels = {};

for (const filename of index) {
  const war = { ...JSON.parse(fs.readFileSync(path.join(base, filename), 'utf8')), filename };
  const html = getWarSummaryHtml(war, now);
  const label = /uppercase tracking-widest leading-none[^>]*>([A-Za-z ]+)<\/p>/.exec(html)?.[1]?.trim();
  labels[`${war.state} => ${label}`] = (labels[`${war.state} => ${label}`] || 0) + 1;
  if (war.state === 'warEnded') {
    seen.warEnded++;
    if (!DECIDED.has(label)) throw new Error(`regression: decided war lost its result: ${filename} -> ${label}`);
    const expected = war.clan.stars > war.opponent.stars ? 'Victory'
      : war.clan.stars < war.opponent.stars ? 'Loss'
      : war.clan.destructionPercentage > war.opponent.destructionPercentage ? 'Victory'
      : war.clan.destructionPercentage < war.opponent.destructionPercentage ? 'Loss' : 'Draw';
    if (label !== expected) throw new Error(`wrong score label ${filename}: ${label} != ${expected}`);
  } else {
    seen.stale++;
    if (DECIDED.has(label)) throw new Error(`stale snapshot still scored: ${filename} (${war.state}) -> ${label}`);
  }
}

console.log('warEnded files checked :', seen.warEnded);
console.log('stale files checked    :', seen.stale);
console.log('label distribution     :', labels);
console.log('PASS: no stale snapshot reports a win/loss/draw; real results unchanged.');
fs.unlinkSync(tmp);
