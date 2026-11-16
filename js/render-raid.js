import { getTHImage, esc } from './constants.js';
import { raidParticipation, raidAbsentees, raidAttendanceSummary, splitAbsentees } from './raidstats.js';
// Raid sorting state
let raidSort = { 
    summary: { col: 'loot', dir: -1 }, 
    attacks: { col: 'index', dir: -1 }, 
    defenses: { col: 'index', dir: -1 } 
};

export function setRaidSort(table, column) {
    if (raidSort[table].col === column) raidSort[table].dir *= -1;
    else { raidSort[table].col = column; raidSort[table].dir = -1; }
    updateSortHeaders(table);
}

export function resetRaidSort(table) {
    if (table === 'summary') raidSort.summary = { col: 'loot', dir: -1 };
    else if (table === 'attacks') raidSort.attacks = { col: 'index', dir: -1 };
    else if (table === 'defenses') raidSort.defenses = { col: 'index', dir: -1 };
    updateSortHeaders(table);
}

function updateSortHeaders(table) {
    const s = raidSort[table];
    document.querySelectorAll(`.raid-sort-btn[data-table="${table}"]`).forEach(th => {
        const isSelected = th.getAttribute('data-sort') === s.col;
        const icon = th.querySelector('svg');
        if (isSelected) {
            th.classList.add('text-gold');
            if (icon) {
                icon.classList.remove('opacity-20');
                icon.classList.add('opacity-100');
            }
        } else {
            th.classList.remove('text-gold');
            if (icon) {
                icon.classList.add('opacity-20');
                icon.classList.remove('opacity-100');
            }
        }
    });
}

/**
 * Renders the Raid Summary table.
 */
export function renderRaidSummary(raidData, membersLookup = []) {
    const tableBody = document.getElementById('raidSummaryTableBody');
    if (!tableBody) return;
    if (!raidData || !raidData.members) { tableBody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-gray-600 italic">No raid data available.</td></tr>`; return; }

    updateSortHeaders('summary');

    const memberMap = {};
    membersLookup.forEach(m => memberMap[m.tag] = m);

    const playerStats = {};
    if (raidData.attackLog) {
        raidData.attackLog.forEach(logEntry => {
            (logEntry.districts || []).forEach(district => {
                (district.attacks || []).forEach(atk => {
                    const tag = atk.attacker.tag;
                    if (!playerStats[tag]) playerStats[tag] = { stars: 0, damage: 0, count: 0 };
                    playerStats[tag].stars += atk.stars;
                    playerStats[tag].damage += atk.destructionPercent;
                    playerStats[tag].count++;
                });
            });
        });
    }

    const members = raidData.members.map(m => {
        const stats = playerStats[m.tag] || { stars: 0, damage: 0, count: 0 };
        return { ...m, ...stats, avgStars: stats.count > 0 ? (stats.stars / stats.count) : 0 };
    });

    const s = raidSort.summary;
    members.sort((a, b) => {
        let valA, valB;
        if (s.col === 'name') { valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); }
        else if (s.col === 'attacks') { valA = a.attacks; valB = b.attacks; }
        else if (s.col === 'loot') { valA = a.capitalResourcesLooted || 0; valB = b.capitalResourcesLooted || 0; }
        else if (s.col === 'stars') { valA = a.stars; valB = b.stars; }
        else if (s.col === 'damage') { valA = a.damage; valB = b.damage; }
        else if (s.col === 'avgStars') { valA = a.avgStars; valB = b.avgStars; }
        return (valA < valB ? -1 : 1) * s.dir;
    });

    tableBody.innerHTML = members.map(member => {
        const totalPossible = member.attackLimit + member.bonusAttackLimit;
        const mInfo = memberMap[member.tag];
        const thLevel = mInfo?.townHallLevel || mInfo?.townhallLevel || 1;

        return `
            <tr class="border-b border-gray-800/50 hover:bg-inset transition-colors">
                <td class="p-3">
                    <div class="flex items-center gap-3">
                        <img src="${getTHImage(thLevel)}" class="w-8 h-8">
                        <div class="min-w-0">
                            <p class="font-bold text-[11px] text-white truncate">${esc(member.name)}</p>
                            <p class="text-[9px] gold font-bold uppercase tracking-tighter">TH${thLevel}</p>
                        </div>
                    </div>
                </td>
                <td class="p-3 text-center text-gray-400 font-mono">${member.attacks}/${totalPossible}</td>
                <td class="p-3 text-center gold font-bold">${(member.capitalResourcesLooted || 0).toLocaleString()}</td>
                <td class="p-3 text-center text-white font-bold">${member.stars}</td>
                <td class="p-3 text-center text-gray-400">${member.damage}%</td>
                <td class="p-3 text-center text-gold font-bold">${member.avgStars.toFixed(2)}</td>
            </tr>`;
    }).join('');
}

/**
 * Renders the Raid Attacks (Log) table.
 */
export function renderRaidAttacks(raidData) {
    const tableBody = document.getElementById('raidAttacksTableBody');
    if (!tableBody) return;
    if (!raidData) return;

    updateSortHeaders('attacks');

    const log = (raidData.attackLog || []).map((r, i) => {
        const isDefeated = r.districtsDestroyed === r.districtCount;
        return { ...r, index: i + 1, status: isDefeated ? 'Defeated' : 'In-Progress' };
    });

    const s = raidSort.attacks;
    log.sort((a, b) => {
        let valA, valB;
        if (s.col === 'index') { valA = a.index; valB = b.index; }
        else if (s.col === 'clan') { valA = a.defender.name.toLowerCase(); valB = b.defender.name.toLowerCase(); }
        else if (s.col === 'status') { valA = a.status; valB = b.status; }
        else if (s.col === 'attacks') { valA = a.attackCount; valB = b.attackCount; }
        else if (s.col === 'districts') { valA = a.districtsDestroyed; valB = b.districtsDestroyed; }
        return (valA < valB ? -1 : 1) * s.dir;
    });

    tableBody.innerHTML = log.map(r => `
        <tr class="border-b border-gray-800/50 hover:bg-inset transition-colors">
            <td class="p-3 text-gray-500 font-mono">#${r.index}</td>
            <td class="p-3"><div class="flex items-center gap-2"><img src="${esc(r.defender.badgeUrls.small)}" class="w-5 h-5"><span class="font-bold text-white">${esc(r.defender.name)}</span></div></td>
            <td class="p-3 text-center"><span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${r.status === 'Defeated' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}">${r.status}</span></td>
            <td class="p-3 text-center text-gray-400">${r.attackCount}</td>
            <td class="p-3 text-center text-gold font-bold">${r.districtsDestroyed} / ${r.districtCount}</td>
        </tr>`).join('');
}

/**
 * Renders the Raid Defenses (Log) table.
 */
export function renderRaidDefenses(raidData) {
    const tableBody = document.getElementById('raidDefensesTableBody');
    if (!tableBody) return;
    if (!raidData) return;

    updateSortHeaders('defenses');

    const log = (raidData.defenseLog || []).map((r, i) => {
        const isDefeated = r.districtsDestroyed === r.districtCount;
        return { ...r, index: i + 1, status: isDefeated ? 'Defeated' : 'In-Progress' };
    });

    const s = raidSort.defenses;
    log.sort((a, b) => {
        let valA, valB;
        if (s.col === 'index') { valA = a.index; valB = b.index; }
        else if (s.col === 'clan') { valA = a.attacker.name.toLowerCase(); valB = b.attacker.name.toLowerCase(); }
        else if (s.col === 'status') { valA = a.status; valB = b.status; }
        else if (s.col === 'attacks') { valA = a.attackCount; valB = b.attackCount; }
        else if (s.col === 'districts') { valA = a.districtsDestroyed; valB = b.districtsDestroyed; }
        return (valA < valB ? -1 : 1) * s.dir;
    });

    tableBody.innerHTML = log.map(r => `
        <tr class="border-b border-gray-800/50 hover:bg-inset transition-colors">
            <td class="p-3 text-gray-500 font-mono">#${r.index}</td>
            <td class="p-3"><div class="flex items-center gap-2"><img src="${esc(r.attacker.badgeUrls.small)}" class="w-5 h-5"><span class="font-bold text-white">${esc(r.attacker.name)}</span></div></td>
            <td class="p-3 text-center"><span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${r.status === 'Defeated' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}">${r.status}</span></td>
            <td class="p-3 text-center text-gray-400">${r.attackCount}</td>
            <td class="p-3 text-center text-red-400 font-bold">${r.districtsDestroyed} / ${r.districtCount}</td>
        </tr>`).join('');
}

/**
 * Renders the Raid Attendance card (inside the Stats tab).
 *
 * Shows two distinct failures side by side, because the raids payload only
 * lists participants: "did not raid at all" comes from diffing against the
 * roster, while "left attacks unused" comes from the raid's own member list.
 * Presenting them as one number would understate the problem — a clan where
 * 34 of 50 raided has 16 members missing entirely, and that is invisible in
 * the participant data.
 */
export function renderRaidAttendance(raids, roster = []) {
    const latest = raids?.[0];
    const summaryEl = document.getElementById('raidAttendanceSummary');
    if (!summaryEl) return;

    if (!latest || !Array.isArray(latest.members) || !latest.members.length) {
        summaryEl.innerHTML = `<p class="col-span-full p-6 text-center text-gray-600 italic text-xs">No raid weekend archived yet.</p>`;
        ['raidAbsentList', 'raidIncompleteList', 'raidWorstAbsentees'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        ['raidAbsentCount', 'raidIncompleteCount'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '';
        });
        const weekend = document.getElementById('raidAttendanceWeekend');
        if (weekend) weekend.textContent = '';
        const note = document.getElementById('raidAttendanceNote');
        if (note) note.textContent = '';
        return;
    }

    const latestPart = raidParticipation(latest);
    const absent = raidAbsentees(latest, roster);
    const summary = raidAttendanceSummary(raids, roster);
    const fmtWeekend = (r) => {
        const from = String(r.startTime || '').slice(0, 8);
        return from.length === 8 ? `${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}` : '—';
    };

    const weekendEl = document.getElementById('raidAttendanceWeekend');
    if (weekendEl) {
        const state = latest.state === 'ended' ? 'final' : 'in progress';
        weekendEl.textContent = `weekend of ${fmtWeekend(latest)} · ${state}`;
    }

    const statCard = (label, value, tone = '') => `
        <div class="bg-gray-900/40 border border-gray-800 rounded-lg p-3">
            <p class="text-[9px] font-bold uppercase tracking-widest text-gray-500">${esc(label)}</p>
            <p class="text-lg font-bold ${tone || 'text-white'}">${esc(value)}</p>
        </div>`;

    const attendancePct = Math.round((latestPart.participants / (roster.length || latestPart.participants)) * 100);

    const split = splitAbsentees(latest, roster);

    summaryEl.innerHTML = [
        statCard('Raided', `${latestPart.participants} / ${roster.length || '?'}`, 'gold'),
        statCard('Missed (active acct)', `${split.neglected.length}`, split.neglected.length > 0 ? 'text-red-400' : ''),
        statCard('Inactive accts', `${split.dormant.length}`, 'text-gray-500'),
        statCard('Attacks left unused', `${latestPart.incomplete.length}`, latestPart.incomplete.length > 0 ? 'text-yellow-500' : ''),
        statCard('Attendance', `${attendancePct}%`),
        summary
            ? statCard('Avg attendance', `${Math.round(summary.avgAttendanceRate * 100)}% across ${summary.weekends}w`)
            : '',
        summary
            ? statCard('Avg did not raid', `${summary.avgAbsent.toFixed(1)} / weekend`, summary.avgAbsent > 0 ? 'text-red-400' : '')
            : '',
    ].join('');

    const absentCount = document.getElementById('raidAbsentCount');
    if (absentCount) {
        // Only the actionable group is highlighted gold; dormant accounts are
        // shown for completeness but must not read as an accusation.
        absentCount.textContent = split.neglected.length
            ? `(${split.neglected.length} active)`
            : '';
    }

    const absentRow = (m, tone) => `
        <div class="flex items-center gap-2 bg-gray-900/40 border border-gray-800 rounded-lg px-2.5 py-1.5">
            <img src="${getTHImage(m.townHallLevel)}" class="w-5 h-5 object-contain ${tone || ''}">
            <span class="text-[11px] font-bold ${tone ? 'text-gray-500' : 'text-white'} truncate">${esc(m.name)}</span>
            <span class="ml-auto text-[9px] uppercase tracking-wider text-gray-500">${tone ? 'inactive' : `TH${m.townHallLevel || '?'}`}</span>
        </div>`;

    const absentList = document.getElementById('raidAbsentList');
    if (absentList) {
        const blocks = [];
        if (split.neglected.length) {
            blocks.push(`<p class="text-[9px] font-bold uppercase tracking-widest text-red-400 mb-1">Active but did not raid (${split.neglected.length})</p>`);
            blocks.push(split.neglected.map(m => absentRow(m)).join(''));
        }
        if (split.dormant.length) {
            blocks.push(`<p class="text-[9px] font-bold uppercase tracking-widest text-gray-600 mt-3 mb-1">Dormant accounts, not raiding (${split.dormant.length})</p>`);
            blocks.push(split.dormant.map(m => absentRow(m, 'opacity-60')).join(''));
        }
        absentList.innerHTML = blocks.length
            ? blocks.join('')
            : `<p class="text-[11px] text-green-500 italic">Everyone on the roster raided. 🎉</p>`;
    }

    const incompleteCount = document.getElementById('raidIncompleteCount');
    if (incompleteCount) incompleteCount.textContent = latestPart.incomplete.length ? `(${latestPart.incomplete.length})` : '';

    const incompleteList = document.getElementById('raidIncompleteList');
    if (incompleteList) {
        incompleteList.innerHTML = latestPart.incomplete.length === 0
            ? `<p class="text-[11px] text-green-500 italic">Every participant used all attacks.</p>`
            : latestPart.incomplete.map(m => `
                <div class="flex items-center gap-2 bg-gray-900/40 border border-gray-800 rounded-lg px-2.5 py-1.5">
                    <span class="text-[11px] font-bold text-white truncate">${esc(m.name)}</span>
                    <span class="ml-auto text-[10px] font-mono text-yellow-500">${m.attacks}/${m.allowance}</span>
                    <span class="text-[9px] text-gray-500">${m.attacksRemaining} left</span>
                </div>`).join('');
    }

    const worstEl = document.getElementById('raidWorstAbsentees');
    if (worstEl) {
        // Dormant alts would otherwise dominate this list forever, burying the
        // members who are actually active and skipping weekends.
        const worst = (summary?.worstAbsentees || []).filter(m => !m.inactive);
        worstEl.innerHTML = worst.length === 0
            ? `<p class="text-[11px] text-green-500 italic">No active member has missed a weekend.</p>`
            : worst.map(m => `
                <div class="flex items-center gap-2 bg-gray-900/40 border border-gray-800 rounded-lg px-2.5 py-1.5">
                    <span class="text-[11px] font-bold text-white truncate">${esc(m.name)}</span>
                    <span class="ml-auto text-[10px] text-red-400 font-bold">${m.missed}×</span>
                </div>`).join('');
    }

    const note = document.getElementById('raidAttendanceNote');
    if (note) {
        const joinedLater = absent.length > 0
            ? ' "Did not raid" compares the latest weekend against the current roster, so members who joined after that weekend appear here.'
            : '';
        note.textContent = `Attendance is measured against the ${roster.length}-member roster, not against the ${latestPart.participants} who took part — that is why a weekend everyone attacked can still show a lower attendance figure. The raid API only lists participants, so absence is inferred from the roster diff. Accounts shown as dormant have zero trophies and zero donations, which in this clan marks unused alts rather than members who skipped — they are listed for completeness, not as a warning.${joinedLater}`;
    }
}
