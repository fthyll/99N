/**
 * Raid attendance analysis.
 *
 * Kept separate from rendering so the counting rules can be unit-tested: the
 * "who missed the raid" question has two different answers and conflating them
 * produces a misleading number.
 *
 *   incomplete  — took part in the raid but left attacks unused
 *   absent      — on the clan roster but absent from the raid's member list
 *
 * The raid payload only lists players who took part, so absence can only be
 * detected by diffing against the current roster. That also means a member who
 * joined after the raid weekend looks absent — callers label it accordingly.
 */

/**
 * Attacks each member is allowed, including the bonus attack.
 */
function allowance(member) {
    return (member.attackLimit || 0) + (member.bonusAttackLimit || 0);
}

/**
 * Split a raid's participants into complete / incomplete / untouched.
 */
export function raidParticipation(raid) {
    const members = raid?.members || [];
    const complete = [];
    const incomplete = [];
    const untouched = [];

    members.forEach(member => {
        const used = member.attacks || 0;
        const allowed = allowance(member);
        const row = { ...member, allowance: allowed, attacksRemaining: Math.max(allowed - used, 0) };
        if (used === 0) untouched.push(row);
        else if (used >= allowed) complete.push(row);
        else incomplete.push(row);
    });

    // Worst offenders first: most unused attacks, then least looted.
    incomplete.sort((a, b) =>
        b.attacksRemaining - a.attacksRemaining ||
        (a.capitalResourcesLooted || 0) - (b.capitalResourcesLooted || 0));

    return {
        complete,
        incomplete,
        untouched,
        participants: members.length,
        attacksUsed: members.reduce((sum, m) => sum + (m.attacks || 0), 0),
        attacksPossible: members.reduce((sum, m) => sum + allowance(m), 0),
    };
}

/**
 * Members on the roster with no entry in the raid's participant list.
 *
 * @param {object} raid
 * @param {Array} roster - current clan memberList
 */
export function raidAbsentees(raid, roster = []) {
    const participants = new Set((raid?.members || []).map(m => m.tag));
    return roster
        .filter(member => !participants.has(member.tag))
        .map(member => ({
            tag: member.tag,
            name: member.name,
            townHallLevel: member.townHallLevel || member.townhallLevel || 0,
            role: member.role || 'member',
            // Carried through so callers can tell a dormant account from a
            // member who simply did not show up.
            trophies: member.trophies || 0,
            donations: member.donations || 0,
            expLevel: member.expLevel || 0,
            inactive: isDormant(member),
        }));
}

/**
 * Whether a roster entry looks like an unused account rather than a player.
 *
 * Reasoning about a real clan's data: accounts with zero trophies AND zero
 * donations are not merely quiet that week — they are not being played. In
 * 99N's archive every such member was also a low-experience TH8 with no other
 * activity, while every raider with zero trophies had non-zero donations.
 * Using both signals together avoids flagging an active player who happens to
 * sit at 0 trophies between seasons.
 *
 * This only ever *labels* a member; it never removes them from a count.
 */
export function isDormant(member) {
    const trophies = member?.trophies || 0;
    const donations = member?.donations || 0;
    return trophies === 0 && donations === 0;
}

/**
 * Split absentees into dormant accounts and members who are active but did
 * not raid. The second group is the one worth acting on.
 */
export function splitAbsentees(raid, roster = []) {
    const absent = raidAbsentees(raid, roster);
    return {
        dormant: absent.filter(m => m.inactive),
        neglected: absent.filter(m => !m.inactive),
        all: absent,
    };
}

/**
 * Attendance across several raid weekends, newest first.
 *
 * Attendance rate is measured against the roster, not against each weekend's
 * participant count: a clan of 50 where 34 raided has 68% attendance even
 * though everyone who showed up attacked.
 */
export function raidAttendanceHistory(raids = [], roster = []) {
    const rosterSize = roster.length;
    return raids
        .filter(raid => raid && Array.isArray(raid.members))
        .map(raid => {
            const part = raidParticipation(raid);
            const absent = raidAbsentees(raid, roster);
            return {
                startTime: raid.startTime,
                endTime: raid.endTime,
                state: raid.state,
                participants: part.participants,
                complete: part.complete.length,
                incomplete: part.incomplete.length,
                untouched: part.untouched.length,
                absent: absent.length,
                attacksUsed: part.attacksUsed,
                attacksPossible: part.attacksPossible,
                rosterSize,
                attendanceRate: rosterSize > 0 ? part.participants / rosterSize : 0,
                completionRate: part.participants > 0 ? part.complete.length / part.participants : 0,
            };
        });
}

/**
 * Average attendance across the given raids, plus the worst regular absentee.
 *
 * Returns null when there is no usable history so callers can hide the card
 * instead of rendering "NaN%".
 */
export function raidAttendanceSummary(raids = [], roster = []) {
    const history = raidAttendanceHistory(raids, roster).filter(r => r.participants > 0);
    if (history.length === 0) return null;

    const avg = key => history.reduce((sum, r) => sum + r[key], 0) / history.length;

    // Who missed the most weekends across the whole window.
    const misses = new Map();
    history.forEach(raid => {
        // Recompute per raid: raidAttendanceHistory returns counts, not names.
        const source = raids.find(r => r.startTime === raid.startTime);
        raidAbsentees(source, roster).forEach(m => {
            const entry = misses.get(m.tag) || { name: m.name, tag: m.tag, missed: 0, inactive: m.inactive };
            entry.missed += 1;
            misses.set(m.tag, entry);
        });
    });
    const worstAbsentees = [...misses.values()]
        .sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name))
        .slice(0, 5);

    return {
        weekends: history.length,
        avgParticipants: avg('participants'),
        avgAttendanceRate: avg('attendanceRate'),
        avgCompletionRate: avg('completionRate'),
        avgIncomplete: avg('incomplete'),
        avgAbsent: avg('absent'),
        worstAbsentees,
        history,
    };
}
