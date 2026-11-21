import { esc, getTHImage } from './constants.js';

const number = value => value == null || value === '' || !Number.isFinite(Number(value))
    ? '—' : Number(value).toLocaleString();
const nameOf = value => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return value.name || value.en || value.language || Object.values(value).find(v => typeof v === 'string') || '';
};
const percent = (value, target) => target > 0 ? Math.max(0, Math.min(100, value / target * 100)) : 0;

export function filterMembers(members, { query = '', townHall = '', warPreference = '', profiles = {} } = {}) {
    const needle = query.trim().toLocaleLowerCase();
    return (members || []).filter(member => {
        const preference = String(profiles[member.tag]?.warPreference || '').toLowerCase();
        if (needle && !`${member.name || ''} ${member.tag || ''}`.toLocaleLowerCase().includes(needle)) return false;
        if (townHall && String(member.townHallLevel || '') !== String(townHall)) return false;
        if (warPreference === 'unknown' && preference) return false;
        if (warPreference && warPreference !== 'unknown' && preference !== warPreference) return false;
        return true;
    });
}

export function memberProfileFallback(member, career = {}) {
    if (!member) return null;
    return {
        ...career,
        ...member,
        tag: member.tag,
        name: member.name || career.name || 'Player',
        profileArchiveAvailable: false,
    };
}

export function renderPlayerTrend(points, metric = 'trophies') {
    const validPoints = (points || []).filter(point => point[metric] != null && point[metric] !== '' && Number.isFinite(Number(point[metric])));
    if (validPoints.length < 2) return '<p class="text-xs text-gray-500">Not enough archived snapshots for this trend.</p>';
    const values = validPoints.map(point => Number(point[metric]));
    const min = Math.min(...values), max = Math.max(...values), spread = max - min || 1;
    const coords = values.map((value, i) => `${(i / (values.length - 1) * 100).toFixed(2)},${(34 - (value - min) / spread * 28).toFixed(2)}`).join(' ');
    const firstDate = validPoints[0].date || 'unknown';
    const lastDate = validPoints.at(-1).date || 'unknown';
    const delta = values.at(-1) - values[0];
    return `<svg class="profile-history-chart" viewBox="0 0 100 40" role="img" aria-label="${esc(metric)} trend across ${values.length} archived snapshots from ${esc(firstDate)} to ${esc(lastDate)}, values ${number(values[0])} to ${number(values.at(-1))}"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke"/><text x="0" y="39" font-size="4" fill="currentColor">${number(min)}</text><text x="100" y="39" text-anchor="end" font-size="4" fill="currentColor">${number(max)}</text></svg><p class="text-xs text-gray-500">${values.length} valid snapshots · ${esc(firstDate)} to ${esc(lastDate)} · change ${delta > 0 ? '+' : ''}${number(delta)}</p>`;
}

function panel(title, content, wide = false) {
    return `<section class="profile-panel${wide ? ' profile-wide' : ''}"><h3 class="display gold text-sm font-semibold uppercase mb-3">${title}</h3>${content}</section>`;
}

function metrics(profile) {
    const rows = [
        ['Role', profile.role], ['War preference', profile.warPreference || 'Not reported'],
        ['Trophies', profile.trophies], ['Best trophies', profile.bestTrophies],
        ['War stars', profile.warStars], ['Attack wins', profile.attackWins],
        ['Defense wins', profile.defenseWins], ['Builder Hall', profile.builderHallLevel ? `BH${profile.builderHallLevel}` : null],
        ['Builder trophies', profile.builderBaseTrophies], ['Capital contributed', profile.clanCapitalContributions],
        ['Donated this season', profile.donations], ['Received this season', profile.donationsReceived],
    ];
    return `<dl class="grid grid-cols-2 gap-3">${rows.map(([label, value]) => `<div><dt class="stat-label">${esc(label)}</dt><dd class="stat-value text-xs">${esc(typeof value === 'number' ? number(value) : value ?? '—')}</dd></div>`).join('')}</dl><p class="text-[10px] text-gray-500 mt-3">Donation totals reset each League season.</p>`;
}

function listContent(items) {
    if (!Array.isArray(items) || !items.length) return '<p class="text-xs text-gray-500">Not present in this snapshot.</p>';
    return `<div class="profile-items">${items.map(item => {
        const level = Number(item.level) || 0, max = Number(item.maxLevel) || 0;
        const label = esc(nameOf(item.name) || 'Unknown item');
        return `<div class="profile-item"><span>${label}${item.superTroopIsActive ? ' · Super active' : ''}</span><span class="font-mono">${number(level)}${max ? ` / ${number(max)}` : ''}</span>${max ? `<span class="profile-progress" aria-label="${label} level ${level} of ${max}"><span style="width:${percent(level, max).toFixed(1)}%"></span></span>` : ''}</div>`;
    }).join('')}</div>`;
}

function achievements(items) {
    if (!Array.isArray(items) || !items.length) return '<p class="text-xs text-gray-500">Not present in this snapshot.</p>';
    return `<div class="profile-achievements space-y-2">${items.map(item => {
        const label = esc(nameOf(item.name) || 'Achievement');
        const value = Number(item.value) || 0, target = Number(item.target) || 0;
        return `<div class="profile-item"><span>${label}<small class="block text-gray-500">${esc(nameOf(item.info))} · ${esc(item.village || '')}</small></span><span class="font-mono">${number(value)} / ${number(target)} · ${number(item.stars)}★</span>${target ? `<span class="profile-progress" aria-label="${label}: ${value} of ${target}"><span style="width:${percent(value, target).toFixed(1)}%"></span></span>` : ''}</div>`;
    }).join('')}</div>`;
}

function battleLog(entries, available, stale = false) {
    if (!Array.isArray(entries) || !entries.length) {
        const reason = available === false ? 'The API did not provide this log during the latest sync.' : 'No battle-log snapshot is archived.';
        return `<p class="text-xs text-gray-500">${reason}</p>`;
    }
    const staleNote = stale ? '<p class="text-xs text-yellow-600 mb-2">Showing the last successful battle-log snapshot.</p>' : '';
    return `${staleNote}<div class="profile-table-wrap"><table class="profile-table"><thead><tr><th>Mode</th><th>Side</th><th>Stars</th><th>Destruction</th><th>Opponent</th></tr></thead><tbody>${entries.slice(0, 20).map(b => `<tr><td>${esc(b.battleType || '—')}</td><td>${b.attack ? 'Attack' : 'Defense'}</td><td>${number(b.stars)}</td><td>${b.destructionPercentage == null ? '—' : `${number(b.destructionPercentage)}%`}</td><td>${esc(b.opponentName || b.opponentPlayerTag || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}

function leagueHistory(entries, available, stale = false) {
    if (!Array.isArray(entries) || !entries.length) {
        const reason = available === false ? 'The API did not provide this history during the latest sync.' : 'No ranked-history snapshot is archived.';
        return `<p class="text-xs text-gray-500">${reason}</p>`;
    }
    const staleNote = stale ? '<p class="text-xs text-yellow-600 mb-2">Showing the last successful ranked-history snapshot.</p>' : '';
    return `${staleNote}<div class="profile-table-wrap"><table class="profile-table"><thead><tr><th>Season</th><th>Trophies</th><th>Rank</th><th>Attack</th><th>Defense</th><th>Stars</th></tr></thead><tbody>${entries.map(row => `<tr><td>${esc(row.leagueSeasonId ?? '—')}</td><td>${number(row.leagueTrophies)}</td><td>${number(row.placement)}</td><td>${number(row.attackWins)}W · ${number(row.attackLosses)}L</td><td>${number(row.defenseWins)}W · ${number(row.defenseLosses)}L</td><td>${number(row.attackStars)} / ${number(row.defenseStars)}</td></tr>`).join('')}</tbody></table></div>`;
}

function limitedProfile(profile, trend) {
    const trendMetrics = ['trophies', 'donations', 'warStars', 'clanCapitalContributions'];
    const trendView = `<label class="stat-label">Metric<select data-trend-metric class="control-base mt-1">${trendMetrics.map(metric => `<option value="${metric}">${metric === 'clanCapitalContributions' ? 'Capital contribution' : metric === 'warStars' ? 'War stars' : metric[0].toUpperCase() + metric.slice(1)}</option>`).join('')}</select></label><div data-profile-trend>${renderPlayerTrend(trend)}</div>`;
    return `<p class="text-xs text-gray-500 mb-3">Detailed player profile was not archived. Showing only current roster and saved career fields.</p>${panel('Available roster and career data', metrics(profile), true)}${panel('Archived trends', trendView, true)}<p class="text-xs text-gray-500">Heroes, troops, achievements and battle logs are unavailable for this snapshot.</p>`;
}

export function renderPlayerProfile(profile, { trend = [], fetchedAt = '' } = {}) {
    if (!profile) return '<div class="p-6"><p role="status">Player profile is not available in the roster or archive.</p><button type="button" class="member-profile-trigger mt-3" data-profile-close>Close</button></div>';
    const playerName = nameOf(profile.name) || 'Player';
    const league = nameOf(profile.leagueTier?.name) || nameOf(profile.league?.name) || 'Unranked';
    const close = '<button type="button" class="member-profile-trigger" data-profile-close aria-label="Close player profile">Close</button>';
    const parsedSync = fetchedAt ? new Date(fetchedAt) : null;
    const lastSync = parsedSync && !Number.isNaN(parsedSync.valueOf()) ? parsedSync.toLocaleString() : 'Unknown';
    const header = `<header class="flex items-start justify-between gap-3 mb-4"><div class="flex items-center gap-3"><img src="${esc(getTHImage(profile.townHallLevel || 1))}" alt="Town Hall ${esc(profile.townHallLevel || 'unknown')}" class="th-icon"><div><h2 id="playerProfileTitle" class="display gold text-lg">${esc(playerName)}</h2><p class="text-xs text-gray-500 font-mono">${esc(profile.tag || '')} · ${esc(profile.role || '')} · ${esc(league)} · synced ${esc(lastSync)}</p></div></div>${close}</header>`;
    if (profile.profileArchiveAvailable === false) return `<div class="player-profile-content">${header}${limitedProfile(profile, trend)}</div>`;
    const legend = profile.legendStatistics || {};
    const legendContent = legend.currentSeason || legend.bestSeason || legend.legendTrophies
        ? `<dl class="grid grid-cols-2 gap-3">${[['Current season trophies', legend.currentSeason?.trophies], ['Current season rank', legend.currentSeason?.rank], ['Best season trophies', legend.bestSeason?.trophies], ['Best season rank', legend.bestSeason?.rank], ['Legend trophies', legend.legendTrophies], ['Previous season trophies', legend.previousSeason?.trophies]].map(([label, value]) => `<div><dt class="stat-label">${esc(label)}</dt><dd class="stat-value text-xs">${esc(number(value))}</dd></div>`).join('')}</dl>`
        : '<p class="text-xs text-gray-500">Legend League statistics not reported.</p>';
    const labels = (profile.labels || []).map(label => esc(nameOf(label.name))).filter(Boolean).join(' · ') || 'No labels reported';
    const house = profile.playerHouse?.elements || [];
    const houseText = house.length ? house.map(item => `${esc(item.type)} ${esc(item.id)}`).join(' · ') : 'No house elements reported';
    const trendOptions = ['trophies', 'donations', 'warStars', 'clanCapitalContributions'];
    const equipment = profile.heroEquipment?.length ? profile.heroEquipment : (profile.heroes || []).flatMap(hero => hero.equipment || []);
    return `<div class="player-profile-content">${header}<div class="profile-grid">${panel('Career and status', metrics(profile))}${panel('Archived trends', `<label class="stat-label">Metric<select data-trend-metric class="control-base mt-1">${trendOptions.map(field => `<option value="${field}">${field === 'clanCapitalContributions' ? 'Capital contribution' : field === 'warStars' ? 'War stars' : field[0].toUpperCase() + field.slice(1)}</option>`).join('')}</select></label><div data-profile-trend>${renderPlayerTrend(trend)}</div>`, true)}${panel('Heroes', listContent(profile.heroes))}${panel('Hero equipment', listContent(equipment))}${panel('Troops', listContent(profile.troops), true)}${panel('Spells', listContent(profile.spells))}${panel('Legend League', legendContent)}${panel('Labels and Player House', `<p class="text-xs mb-2">${labels}</p><p class="text-xs text-gray-500">${houseText}</p>`)}${panel('Achievements', achievements(profile.achievements), true)}${panel('Recent battles', battleLog(profile.battleLog, profile.battleLogAvailable, profile.battleLogStale), true)}${panel('Ranked league history', leagueHistory(profile.leagueHistory, profile.leagueHistoryAvailable, profile.leagueHistoryStale), true)}</div></div>`;
}
