import { esc } from './constants.js';

const format = value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString();
const valueFor = (row, type) => {
    if (type === 'players') return format(row.trophies);
    if (type === 'builderBasePlayers') return format(row.builderBaseTrophies);
    if (type === 'clans') return format(row.clanPoints);
    if (type === 'builderBaseClans') return format(row.clanBuilderBasePoints ?? row.clanPoints);
    return format(row.clanCapitalPoints ?? row.clanPoints);
};
const metricFor = type => ({
    players: 'Trophies', builderBasePlayers: 'Builder trophies', clans: 'Clan points',
    builderBaseClans: 'Builder Base points', capitalClans: 'Capital points',
})[type] || 'Points';

export function renderRankings(snapshot, type, scope, limit = 50) {
    const host = document.getElementById('rankingsTable');
    if (!host) return;
    const toggle = document.getElementById('rankingWindowToggle');
    const group = snapshot?.rankings?.[type]?.[scope];
    if (!group) {
        if (toggle) toggle.hidden = true;
        host.innerHTML = '<p class="py-10 text-center text-sm text-gray-500">Leaderboard data has not been archived yet. It appears after the next successful daily API sync.</p>';
        return;
    }
    const rows = group.items || [];
    if (toggle) toggle.hidden = rows.length <= 50;
    const freshness = document.getElementById('rankingsFreshness');
    const stale = group.stale ? ' · last successful snapshot held after a refresh failure' : '';
    const stamp = group.fetchedAt ? new Date(group.fetchedAt).toLocaleString() : 'Unknown';
    if (freshness) freshness.textContent = `${group.locationName || scope} · ${rows.length} entries · synced ${stamp}${stale}`;
    if (!rows.length) {
        host.innerHTML = '<p class="py-10 text-center text-sm text-gray-500">The API returned no ranking entries for this category and location.</p>';
        return;
    }
    const visibleRows = rows.slice(0, limit);
    const metric = metricFor(type);
    host.innerHTML = `<table class="profile-table"><thead><tr><th>Rank</th><th>Name</th><th>Clan</th><th>${esc(metric)}</th><th>Change</th></tr></thead><tbody>${visibleRows.map(row => {
        const rank = Number(row.rank);
        const prior = row.previousRank == null ? NaN : Number(row.previousRank);
        const movement = Number.isFinite(rank) && Number.isFinite(prior) && prior !== rank
            ? `${prior > rank ? '↑' : '↓'} ${Math.abs(prior - rank)}` : '—';
        const clanName = row.clan?.name || '';
        const level = row.clanLevel ? ` · Lv ${row.clanLevel}` : '';
        const members = row.members ? ` · ${row.members} members` : '';
        return `<tr><td class="font-mono">${format(row.rank)}</td><td class="font-semibold">${esc(row.name || '—')}<small class="block text-gray-500 font-mono">${esc(row.tag || '')}</small></td><td>${esc(clanName)}${esc(level)}${esc(members)}</td><td class="font-mono">${valueFor(row, type)}</td><td>${esc(movement)}</td></tr>`;
    }).join('')}</tbody></table>${rows.length > visibleRows.length ? `<p class="text-xs text-gray-500 mt-2">Showing ${visibleRows.length} of ${rows.length} cached entries.</p>` : ''}`;
}
