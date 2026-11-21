const TREND_FIELDS = [
    'trophies', 'donations', 'warStars', 'clanCapitalContributions',
    'builderBaseTrophies', 'townHallLevel',
];

export function buildPlayerTrends(index = [], loadSnapshot) {
    const trends = {};
    for (const filename of [...index].sort()) {
        const snapshot = loadSnapshot(filename);
        const date = filename.replace(/^players_/, '').replace(/\.json$/, '');
        for (const [tag, player] of Object.entries(snapshot?.players || {})) {
            const point = { date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` };
            for (const field of TREND_FIELDS) point[field] = player[field] ?? null;
            (trends[tag] ||= []).push(point);
        }
    }
    return trends;
}
