/*
 * Data-freshness indicator (spec §10).
 *
 * The only real "when did we last talk to the API" timestamp in the static
 * payloads is meta.fetchedAt, written by the daily clan job (update_clan.yml,
 * cron 0 9 * * * = 16:00 WIB). War/raid snapshots hold game times, not fetch
 * times, so this is the honest single signal for "last successful sync".
 *
 * Times are shown in WIB (Asia/Jakarta) per spec §9's default timezone.
 *
 * STALE threshold defaults to 30h: an on-time daily refresh keeps the age in
 * the 0-24h band (always "live"); a fully skipped day pushes past 30h and
 * flips "stale". We intentionally do NOT claim a "failed" state — a static
 * page cannot know the last workflow run errored, only how old the data is.
 */

function relAge(ms) {
    const m = Math.round(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

/** Format an instant as "19 Sep, 19:59 WIB". */
export function formatWIB(date) {
    return date.toLocaleString('en-GB', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }) + ' WIB';
}

/**
 * Newest valid ISO timestamp among the candidates, or undefined if none parse.
 * The freshness chip tracks whichever pipeline synced last: the daily clan job
 * (meta.fetchedAt) or the 15m war/raid heartbeats, whichever is fresher.
 */
export function newestTimestamp(...isoStrings) {
    let best = null;
    for (const s of isoStrings) {
        if (!s) continue;
        const t = new Date(s);
        if (!isNaN(t.getTime()) && (best === null || t > best)) best = t;
    }
    return best ? best.toISOString() : undefined;
}

/**
 * @param {string|undefined} fetchedAt  ISO string (use newestTimestamp() to combine sources)
 * @param {Date} now
 * @param {number} staleHours  age at which data is considered stale
 * @returns {{state:'live'|'stale'|'unknown', label:string, sub:string, ageHours:number|null}}
 */
export function freshness(fetchedAt, now = new Date(), staleHours = 30) {
    if (!fetchedAt) return { state: 'unknown', label: 'Sync unknown', sub: 'no timestamp in data', ageHours: null };
    const t = new Date(fetchedAt);
    if (isNaN(t.getTime())) return { state: 'unknown', label: 'Sync unknown', sub: 'bad timestamp', ageHours: null };

    const ageMs = now.getTime() - t.getTime();
    const ageHours = ageMs / 3.6e6;
    const state = ageHours < staleHours ? 'live' : 'stale';
    return {
        state,
        label: state === 'live' ? 'Data live' : 'Data stale',
        sub: `${formatWIB(t)} · ${relAge(ageMs)}`,
        ageHours,
    };
}
