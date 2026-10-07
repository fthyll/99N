/**
 * API Service Module
 * Handles all data fetching with cache-busting and index-aware fallback logic.
 */

/**
 * Generic fetcher with cache-busting
 */
export async function fetchData(path) {
    const res = await fetch(`${path}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to fetch ${path}`);
    return await res.json();
}

/**
 * Fetches the latest available clan data by scanning the index.
 */
export async function fetchClanData() {
    const index = await fetchData('data/clan_stats_index.json');
    if (!index || index.length === 0) throw new Error("Clan index is empty");
    
    for (const filename of index) {
        try {
            return await fetchData(`data/clan_stats/${filename}`);
        } catch (e) {
            console.warn(`Could not load indexed file: ${filename}, trying next...`);
        }
    }
    throw new Error("No available clan data files found in index.");
}

export async function fetchMembersIndex() {
    return await fetchData('data/clan_stats_index.json');
}

export async function fetchHistoricalMembers(filename) {
    return await fetchData(`data/clan_stats/${filename}`);
}

export async function fetchWarIndex() {
    return await fetchData('data/war_stats_index.json');
}

export async function fetchWarData(filename) {
    return await fetchData(`data/war_stats/${filename}`);
}

export async function fetchRaidIndex() {
    return await fetchData('data/raid_stats_index.json');
}

export async function fetchRaidData(filename) {
    return await fetchData(`data/raid_stats/${filename}`);
}

// New sources are strictly optional: an absent file means an older archive,
// not a broken dashboard. Callers must handle null.
export async function fetchWarLog() {
    try { return await fetchData('data/warlog_stats/warlog.json'); }
    catch (e) { console.warn('No war log available.', e); return null; }
}

// Fetch a specific dated player snapshot (players_YYYYMMDD.json). Falls back
// to the newest snapshot only when `filename` is omitted; a named snapshot
// that is not in the index returns null so the Members UI hides career-only
// fields rather than silently using today's career values for a historical
// roster.
export async function fetchPlayerCareers(filename) {
    try {
        const index = await fetchData('data/player_stats_index.json');
        if (!index || index.length === 0) return null;
        if (filename) {
            if (!index.includes(filename)) return null;
            return await fetchData(`data/player_stats/${filename}`);
        }
        return await fetchData(`data/player_stats/${index[0]}`);
    } catch (e) { console.warn('No player career data.', e); return null; }
}

// Map a clan roster date (YYYY-MM-DD) to its matching player snapshot, if one
// exists. Returns null for dates that predate player_stats — the Members UI
// then hides career-only fields for the historical view rather than silently
// using today's career values.
export async function fetchPlayerCareersForDate(dateYmd) {
    if (!dateYmd) return null;
    const snapshot = `players_${dateYmd.replace(/-/g, '')}.json`;
    return await fetchPlayerCareers(snapshot);
}

export async function fetchSync(name) {
    // Heartbeat files written by the 15m war/raid jobs (spec §10). Absent until
    // the first data-changing run, so a miss is normal, not an error.
    try { return await fetchData(`data/sync_${name}.json`); }
    catch (e) { return null; }
}

export async function fetchMeta() {
    try { return await fetchData('data/meta.json'); }
    catch (e) { console.warn('No meta data.', e); return null; }
}
