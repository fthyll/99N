/**
 * Picks which wars the Stats tab shows.
 *
 * The dropdown ranges are calendar-based, so "This Month" is empty whenever no
 * war started inside the current month — every war from last month, and on the
 * 1st of a month basically always. Three panels then render blank with nothing
 * but "No attack data", which reads as a broken tab rather than an empty range.
 *
 * So an empty range falls back to the newest range that does have data and
 * says so. Only decided wars count: a war still running holds a partial score
 * that would otherwise be averaged in as if it were final.
 */

import { parseCoCDate } from './constants.js';

// Ordered widest-first so the fallback lands on the closest thing that has data:
// this month, else this week, else the last finished war, else everything.
const FALLBACK_ORDER = ['month', 'week', 'prev'];

const RANGE_LABEL = {
    month: 'This Month',
    week: 'This Week',
    prev: 'Previous War',
    all: 'All Wars',
};

function inRange(war, range, now) {
    if (range === 'month') {
        // startTime is a CoC stamp (20261001T050000.000Z) while toISOString()
        // is dashed, so compare year+month as one bare YYYYMM string.
        return war.startTime.substring(0, 6) === now.toISOString().substring(0, 4) + now.toISOString().substring(5, 7);
    }
    if (range === 'week') {
        return parseCoCDate(war.startTime) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    if (range === 'prev') return false;  // resolved separately: needs ordering
    return true;
}

function selectRange(warHistory, range, now) {
    if (range === 'prev') {
        const finished = warHistory
            .filter(w => parseCoCDate(w.endTime) < now)
            .sort((a, b) => b.startTime.localeCompare(a.startTime));
        return finished.slice(0, 1);
    }
    return warHistory.filter(w => inRange(w, range, now));
}

/**
 * @returns {{wars: Array, range: string, label: string, fallbackFrom: string|null}}
 *   `label` is what the UI should say it is showing; `fallbackFrom` is the
 *   range the user picked when it differs from the one used, else null.
 */
export function resolveStatsRange(warHistory, range, now = new Date()) {
    const wars = (warHistory || []).filter(w => w.state === 'warEnded');
    const picked = selectRange(wars, range, now);
    if (picked.length > 0) {
        return { wars: picked, range, label: RANGE_LABEL[range] || RANGE_LABEL.all, fallbackFrom: null };
    }

    for (const candidate of FALLBACK_ORDER) {
        if (candidate === range) continue;
        const filled = selectRange(wars, candidate, now);
        if (filled.length > 0) {
            return {
                wars: filled,
                range: candidate,
                label: `${RANGE_LABEL[candidate]} — no wars in ${RANGE_LABEL[range].toLowerCase()}`,
                fallbackFrom: range,
            };
        }
    }

    return { wars: [], range, label: RANGE_LABEL[range] || RANGE_LABEL.all, fallbackFrom: range };
}