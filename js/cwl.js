/**
 * Clan War League panel.
 *
 * meta.json carries either null (outside a season) or the live group: state,
 * season, and one standings row per clan. The standings are derived by
 * meta_scraper from the finished wars, so a row is always present for every
 * clan in the group — even at 0-0-0 before the first war.
 *
 * Outside a season this renders an explicit "not in a season" state rather
 * than zeros, because a table of zeroes reads as a lost season.
 */

import { esc } from './constants.js';

const STATE_LABEL = {
    notInWar: 'Not in a season',
    preparation: 'Preparing for battle day',
    inWar: 'Battle day live',
    ended: 'Season ended',
};

const stateLabel = (state) => STATE_LABEL[state] || 'Not in a season';

/** Points decide a league table; stars only break ties. */
const points = (row) => (row.wins || 0) * 3 + (row.draws || 0);

const badge = (row) => row.badgeUrls?.small
    ? `<img src="${esc(row.badgeUrls.small)}" class="w-5 h-5 rounded" alt="" loading="lazy">`
    : '';

const rowHtml = (row) => `
    <div class="flex items-center gap-2 py-1.5 px-2 rounded ${row.isUs ? 'bg-raise border border-gold/40' : ''}">
        <span class="text-[9px] font-mono text-gray-500 w-4 text-right">${row.position}</span>
        ${badge(row)}
        <span class="text-[10px] font-bold truncate flex-1 ${row.isUs ? 'gold' : 'text-gray-300'}">${esc(row.name)}</span>
        ${row.townHallLevels?.length ? `<span class="text-[8px] text-gray-500 font-mono">TH${Math.max(...row.townHallLevels)}</span>` : ''}
        <span class="text-[10px] font-mono text-green-500 w-6 text-right">${row.wins || 0}</span>
        <span class="text-[10px] font-mono text-gray-400 w-5 text-right">${row.draws || 0}</span>
        <span class="text-[10px] font-mono text-red-500 w-5 text-right">${row.losses || 0}</span>
        <span class="text-[10px] font-mono text-gray-400 w-8 text-right">${points(row)}</span>
    </div>`;

/**
 * @param {object|null} cwl  clanMeta.cwl — null outside a season.
 * @param {string} clanTag   this clan's tag, to mark its own row.
 */
export function renderCwlPanel(cwl, clanTag) {
    if (!cwl || !Array.isArray(cwl.standings) || cwl.standings.length === 0) {
        return `
            <h3 class="medieval text-xs md:text-sm font-bold gold mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Clan War League
            </h3>
            <div class="p-3 bg-card rounded-lg h-[58px] flex flex-col justify-center">
                <p class="stat-label">Season</p>
                <p class="stat-value text-white text-[11px] md:text-xs">Not in a season</p>
            </div>
            <p class="text-[10px] text-gray-500 mt-3 leading-relaxed">
                99N is between war league seasons. The group and table reappear here
                as soon as a season opens.
            </p>`;
    }

    const rows = cwl.standings.map(r => ({ ...r, isUs: r.tag === clanTag }));
    const me = rows.find(r => r.isUs);
    const played = rows.reduce((n, r) => n + (r.wins || 0) + (r.draws || 0) + (r.losses || 0), 0);

    return `
        <h3 class="medieval text-xs md:text-sm font-bold gold mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Clan War League
        </h3>
        <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="p-3 bg-card rounded-lg h-[58px] flex flex-col justify-center">
                <p class="stat-label">Season</p>
                <p class="stat-value text-white text-[11px] md:text-xs">${esc(cwl.season || '—')}</p>
            </div>
            <div class="p-3 bg-card rounded-lg h-[58px] flex flex-col justify-center">
                <p class="stat-label">Status</p>
                <p class="stat-value text-white text-[11px] md:text-xs">${esc(stateLabel(cwl.state))}</p>
            </div>
        </div>
        ${me ? `
        <div class="grid grid-cols-3 gap-2 mb-3">
            <div class="text-center p-2 bg-card rounded-lg h-[58px] flex flex-col justify-center"><p class="stat-label">Position</p><p class="text-gold font-bold text-[11px] md:text-xs">#${me.position}</p></div>
            <div class="text-center p-2 bg-card rounded-lg h-[58px] flex flex-col justify-center"><p class="stat-label">Record</p><p class="text-white font-bold text-[11px] md:text-xs">${me.wins || 0}-${me.draws || 0}-${me.losses || 0}</p></div>
            <div class="text-center p-2 bg-card rounded-lg h-[58px] flex flex-col justify-center"><p class="stat-label">Points</p><p class="text-white font-bold text-[11px] md:text-xs">${points(me)}</p></div>
        </div>` : ''}
        <div class="flex items-center gap-2 py-1 px-2 text-[8px] font-bold uppercase text-gray-500 border-b border-gray-800">
            <span class="w-4"></span><span class="w-5"></span><span class="flex-1">Clan</span>
            <span class="w-6 text-right">W</span><span class="w-5 text-right">D</span><span class="w-5 text-right">L</span><span class="w-8 text-right pr-0">Pts</span>
        </div>
        <div class="max-h-56 overflow-y-auto pr-1">${rows.map(rowHtml).join('')}</div>
        ${played === 0 ? '<p class="text-[10px] text-gray-500 italic mt-2">No war decided yet this season.</p>' : ''}`;
}