/**
 * Reconciles the two war sources.
 *
 * /currentwar only carries per-player attack data, and only while a war is
 * live — the moment the next war starts the endpoint stops returning the
 * finished one, so its last snapshot stays frozen at 'inWar' with a partial
 * score. /warlog carries the authoritative final result but no roster.
 *
 * So a frozen snapshot is promoted in place: the warlog result is copied over
 * the partial score and the roster is kept. That way the war stops reading as
 * "Incomplete" without losing the attack data only /currentwar ever had.
 *
 * The two endpoints stamp endTime independently and land a second or two
 * apart, so pairing is by nearest endTime within a window rather than exact
 * equality — an exact match never fires and every finished war stays stuck.
 */

import { parseCoCDate } from './constants.js';

// Same war day, same war: endTime differs by at most a couple of seconds.
// Wars are a day apart, so a minute of slack cannot pair two different wars.
const MATCH_WINDOW_MS = 60 * 1000;

// Date.parse cannot read the CoC stamp (20260921T073745.000Z), so reuse the
// project's own parser. Returns null rather than NaN so a bad entry is skipped.
const endMs = (war) => {
    const d = parseCoCDate(war?.endTime);
    return d ? d.getTime() : null;
};
const hasResult = (entry) => typeof entry.result === 'string' && endMs(entry) !== null;
const withinWindow = (a, b) => Math.abs(endMs(a) - endMs(b)) <= MATCH_WINDOW_MS;

/**
 * Promotes finished snapshots in `wars` using `warlog`, and returns the
 * warlog wars that no snapshot covers, as summary-only pseudo-wars.
 */
export function mergeWarLog(wars, warlogItems) {
    const unpaired = (warlogItems || []).filter(hasResult);
    const leftovers = [];

    for (const war of wars) {
        const idx = unpaired.findIndex((it) => withinWindow(it, war));
        if (war.state === 'warEnded') {
            // The archive already decided this one; its snapshot is richer than
            // anything warlog holds, so just drop the redundant warlog entry.
            if (idx !== -1) unpaired.splice(idx, 1);
            continue;
        }
        if (idx === -1) continue;  // still live, or older than the warlog window
        applyResult(war, unpaired.splice(idx, 1)[0]);
    }

    for (const item of unpaired) {
        leftovers.push({
            ...item,
            state: 'warEnded',
            startTime: item.startTime || item.endTime,  // API gives only endTime
            summaryOnly: true,
            filename: 'warlog_' + item.endTime,
        });
    }
    return leftovers;
}

// The roster stays — it is the only record of who attacked. The war-level
// totals are overwritten wholesale: a frozen snapshot's attack count is the
// count at the last poll, so leaving it would under-report the attacks behind
// the final score and skew avg-stars/attack in the detail view.
function applyResult(war, { result, clan, opponent }) {
    war.state = 'warEnded';
    war.result = result;
    war.finalised = true;
    for (const side of ['clan', 'opponent']) {
        const final = side === 'clan' ? clan : opponent;
        if (!final) continue;
        war[side].stars = final.stars ?? war[side].stars;
        war[side].destructionPercentage = final.destructionPercentage ?? war[side].destructionPercentage;
        war[side].attacks = final.attacks ?? war[side].attacks;
    }
}