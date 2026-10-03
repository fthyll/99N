/**
 * Why the last refresh found nothing new.
 *
 * The refresh button re-fetches the committed JSON, but a static page cannot
 * know whether the scrapers have run since. Pressing it on a stale dashboard
 * re-downloads the same files and gives no signal at all — which is exactly
 * the case that matters, because the fix is never on the page.
 *
 * So a refresh reports what it actually saw: the newest timestamp across the
 * sync heartbeats, compared against what the previous load reported. That
 * distinguishes three outcomes that look identical on screen without it:
 *
 *   changed  — the data moved; the timestamp proves a scraper committed
 *   same     — nothing changed, and the age says how long that has been true
 *   no stamp — no heartbeat files at all, so there is nothing to compare
 *
 * The timestamp is the honest signal: it is written by the workflow only when
 * real data changed, so it cannot advance without a commit.
 */

/** Newest parseable ISO stamp, or null. Mirrors freshness.newestTimestamp. */
const newest = (...stamps) => {
    let best = null;
    for (const s of stamps) {
        if (!s) continue;
        const t = new Date(s);
        if (!isNaN(t.getTime()) && (best === null || t > best)) best = t;
    }
    return best;
};

/**
 * @param {{fetchedAt?:string}|null} meta   clan meta payload
 * @param {{fetchedAt?:string}|null} war    war sync heartbeat
 * @param {{fetchedAt?:string}|null} raid   raid sync heartbeat
 * @param {string|null} previous            newest stamp from the prior load
 * @returns {{changed:boolean, latest:Date|null, ageHours:number|null}}
 */
export function refreshOutcome(meta, war, raid, previous) {
    const latest = newest(meta?.fetchedAt, war?.fetchedAt, raid?.fetchedAt);
    if (!latest) {
        return { changed: false, latest: null, ageHours: null };
    }
    const prevMs = previous ? new Date(previous).getTime() : NaN;
    return {
        // No prior stamp is not "changed": the first load has nothing to compare
        // against, and claiming an update would be a lie on first paint.
        changed: !isNaN(prevMs) && latest.getTime() > prevMs,
        latest,
        ageHours: (Date.now() - latest.getTime()) / 3.6e6,
    };
}

/**
 * One line of feedback, phrased for what the reader can act on. A refresh that
 * found nothing has to say so: silence is what made this worth adding.
 * @param {{changed:boolean, latest:Date|null, ageHours:number|null}} outcome
 * @param {boolean} failed  the load threw, so nothing could be compared
 */
export function refreshMessage(outcome, failed = false) {
    if (failed) {
        return { tone: 'error', text: 'Refresh failed to load — the committed data could not be read.' };
    }
    if (!outcome.latest) {
        return { tone: 'warn', text: 'No sync heartbeat found, so there is nothing to compare against.' };
    }
    if (outcome.changed) {
        return { tone: 'good', text: 'Updated — the scrapers committed new data since the last check.' };
    }
    const h = Math.floor(outcome.ageHours);
    const waited = h >= 1 ? `${h}h` : `${Math.max(1, Math.round(outcome.ageHours * 60))}m`;
    return {
        tone: 'warn',
        text: `No change — the last scraper commit was ${waited} ago. Nothing on this page can update until one lands.`,
    };
}