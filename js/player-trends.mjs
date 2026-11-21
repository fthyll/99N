import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = join(ROOT, 'data');
const index = JSON.parse(readFileSync(join(data, 'player_stats_index.json'), 'utf8'));
const trends = {};
const fields = ['trophies', 'donations', 'warStars', 'clanCapitalContributions', 'builderBaseTrophies', 'townHallLevel'];
for (const filename of [...index].sort()) {
    const snapshot = JSON.parse(readFileSync(join(data, 'player_stats', filename), 'utf8'));
    const date = filename.replace(/^players_/, '').replace(/\.json$/, '');
    for (const [tag, player] of Object.entries(snapshot.players || {})) {
        const point = { date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` };
        for (const field of fields) point[field] = player[field] ?? null;
        (trends[tag] ||= []).push(point);
    }
}
const snapshot = JSON.parse(readFileSync(join(data, 'player_stats', index[0]), 'utf8'));
const payload = JSON.stringify({ fetchedAt: snapshot.fetchedAt, players: trends });
const temp = join(data, 'player_trends.json.tmp');
await import('node:fs/promises').then(({ writeFile, rename }) => writeFile(temp, payload).then(() => rename(temp, join(data, 'player_trends.json'))));
console.log(`Saved data/player_trends.json for ${Object.keys(trends).length} players, ${Object.values(trends).reduce((sum, points) => sum + points.length, 0)} archived points.`);
