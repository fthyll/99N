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
 *
 * A stale group — the scraper's last refresh failed but it is holding the
 * previous table — also renders the table, with the failure attached. Hiding
 * a league that very likely still exists behind "Lookup failed" is how a
 * single 500 used to read as a dead season.
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
        // Three different situations, three different sentences. Collapsing them
        // into one "not in a season" is what let a dead endpoint read as a quiet
        // league for as long as the panel existed.
        const failed = cwl && cwl.state === 'unavailable';
        return `
            <h3 class="medieval text-xs md:text-sm font-bold gold mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Clan War League
            </h3>
            <div class="p-3 bg-card rounded-lg h-[58px] flex flex-col justify-center">
                <p class="stat-label">Season</p>
                <p class="stat-value text-white text-[11px] md:text-xs">${failed ? 'Lookup failed' : 'Not in a season'}</p>
            </div>
            <p class="text-[10px] text-gray-500 mt-3 leading-relaxed">
                ${failed
                    ? `The league group could not be read (HTTP ${esc(String(cwl.httpStatus || '?'))}). This is a scraper fault, not a quiet season.`
                    : '99N is between war league seasons. The group and table reappear here as soon as a season opens.'}
            </p>`;
    }

    const rows = cwl.standings.map(r => ({ ...r, isUs: r.tag === clanTag }));
    const me = rows.find(r => r.isUs);
    const played = rows.reduce((n, r) => n + (r.wins || 0) + (r.draws || 0) + (r.losses || 0), 0);
    // stale: the scraper's last refresh failed but it held this table. The
    // numbers are the last *known* good ones, so say that plainly rather than
    // silently presenting them as live.
    const staleNote = cwl.stale ? `
        <p class="text-[10px] font-bold text-yellow-500/90 mb-3 flex items-center gap-1.5" role="status">
            <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
            ${esc(cwl.error || 'Last refresh failed')} — showing the last good standings.
        </p>` : '';

    return `
        <h3 class="medieval text-xs md:text-sm font-bold gold mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Clan War League
        </h3>
        ${staleNote}
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