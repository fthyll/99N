// notifier.test.mjs — embed shapes, dry-run notifier, and failure tolerance.
// Run: node js/notifier.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
let fail = 0;
const t = (name, cond) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name); if (!cond) fail = 1; };

const py = (args, env = {}) => execFileSync('python3', args, {
  cwd: root,
  env: { ...process.env, PYTHONPATH: path.join(root, 'scrapers'), ...env },
  encoding: 'utf8',
});

// 1. Every notification type renders an embed with title + colour.
const probe = `
import json
from notifier import embeds
war = {"state": "warEnded", "teamSize": 15, "attacksPerMember": 2, "battleModifier": "none",
       "startTime": "20260916T041524.000Z", "endTime": "20260917T041524.000Z",
       "clan": {"name": "99N", "stars": 41, "destructionPercentage": 96.4, "attacks": 26},
       "opponent": {"name": "House of Dragon", "stars": 33, "destructionPercentage": 88.1, "attacks": 24}}
raid = {"state": "ended", "startTime": "20260912T070000.000Z", "endTime": "20260914T070000.000Z",
        "capitalTotalLoot": 190804, "raidsCompleted": 24, "totalAttacks": 61, "enemyDistrictsDestroyed": 61,
        "offensiveReward": 120, "defensiveReward": 45,
        "members": [{"name": "A", "capitalResourcesLooted": 9000, "attacks": 6},
                    {"name": "B", "capitalResourcesLooted": 7000, "attacks": 5}]}
out = {
 "war_preview": embeds.war_preview(war),
 "war_result": embeds.war_result(war),
 "raid_start": embeds.raid_start(raid),
 "raid_summary": embeds.raid_summary(raid),
 "membership": embeds.membership_change(["Newbie"], ["Quitter"], 49),
 "donations": embeds.donation_week({"total": 20000, "received": 18000}, {"donations": 300, "received": 200},
                                   [{"name": "A", "donations": 100}]),
}
print(json.dumps(out))
`;
const embedsOut = JSON.parse(py(['-c', probe]));
for (const [name, embed] of Object.entries(embedsOut)) {
  t(`${name}: has title/description/color`,
    typeof embed.title === 'string' && embed.title.length > 0 &&
    typeof embed.description === 'string' && embed.description.length > 0 &&
    typeof embed.color === 'number');
}
t('war_result derives VICTORY from stars', embedsOut.war_result.title.includes('VICTORY'));
t('war_result shows the score', embedsOut.war_result.title.includes('41–33'));
t('raid_summary ranks top looters', embedsOut.raid_summary.fields[0].value.indexOf('A') < embedsOut.raid_summary.fields[0].value.indexOf('B'));

// 2. A definite defeat must be labelled DEFEAT, never VICTORY.
const loseProbe = `
import json
from notifier import embeds
war = {"state": "warEnded", "teamSize": 15, "attacksPerMember": 2,
       "startTime": "20260916T041524.000Z", "endTime": "20260916T041524.000Z",
       "clan": {"name": "99N", "stars": 20, "destructionPercentage": 70.0, "attacks": 26},
       "opponent": {"name": "X", "stars": 44, "destructionPercentage": 98.0, "attacks": 29}}
print(json.dumps(embeds.war_result(war)))
`;
const lose = JSON.parse(py(['-c', loseProbe]));
t('defeat mapped to DEFEAT + red', lose.title.includes('DEFEAT') && lose.color === 0xED4245);

// 3. dry-run notify.py must not require a webhook URL and must not throw.
const noWebhook = { DISCORD_WEBHOOK_URL: '' };
for (const ev of ['war', 'raid', 'clan']) {
  let out = '';
  try { out = py(['scrapers/notify.py', '--event', ev, '--dry-run'], noWebhook); }
  catch (e) { out = `THREW ${e.message}`; }
  t(`notify --event ${ev} tolerates a missing webhook`, !out.includes('THREW') && out.includes('sent='));
}

// 4. broadcast.py refuses to send without a webhook instead of crashing.
let bOut = '';
try { bOut = py(['scrapers/broadcast.py', '--text', 'hello', '--dry-run']); }
catch (e) { bOut = `THREW ${e.message}`; }
t('broadcast --dry-run prints payload', !bOut.includes('THREW') && bOut.includes('"embeds"') && bOut.includes('sent'));

// 5. The webhook URL never reaches a data file.
const state = path.join(root, 'data', 'notify_state.json');
if (fs.existsSync(state)) {
  const body = fs.readFileSync(state, 'utf8');
  t('notify_state.json holds no webhook URL', !/discord(app)?\.com\/api\/webhooks/.test(body));
}
t('discord.py rejects non-Discord URLs',
  py(['-c', 'from notifier import discord; import os; os.environ["DISCORD_WEBHOOK_URL"]="https://evil.example.com/api/webhooks/1/x"; print("REJECTED" if discord.webhook_url() is None else "ACCEPTED")']).trim().endsWith('REJECTED'));

console.log(fail ? '\nFAILED' : '\nPASS: notifier behaviour verified.');
process.exit(fail);
