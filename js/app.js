/**
 * Main Application Module
 * Orchestrates the data loading flow, global event listeners, and view switching.
 */
import { roleWeight, parseCoCDate, esc } from './constants.js';
import { 
    fetchClanData, 
    fetchMembersIndex, 
    fetchHistoricalMembers, 
    fetchWarIndex, 
    fetchWarData,
    fetchRaidIndex,
    fetchRaidData,
    fetchWarLog,
    fetchPlayerCareers,
    fetchMeta
} from './api.js';
import { 
    renderMembers, 
    renderWarHistory, 
    renderWarDetail, 
    renderAbout,
    renderRaidSummary,
    renderRaidAttacks,
    renderRaidDefenses,
    setRaidSort,
    resetRaidSort
} from './render.js';
import { renderCharts } from './charts.js';
import { initBroadcast } from './broadcast.js';

// Global state variables
let allMembers = [];
let playerCareers = {};        // tag -> career fields from /players
let clanMeta = null;           // goldpass / country rank / CWL group
let warLogHistory = [];        // summary-only pseudo-wars from /warlog           
let latestClanData = null;     
let currentRoleFilter = 'all'; 
let currentWarFilter = 'all';  
let fullWarHistory = [];       
let fullRaidHistory = [];      
let availableMemberDates = []; 
let fp = null;                 
let raidFp = null;             
let activeWarFilename = null;  
let warHistoryPickers = []; 
let currentRaidIndex = 0;      

/**
 * UI View Controllers
 */
function switchView(viewId, updateHash = true) {
    document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden-section'));
    const target = document.getElementById(`section-${viewId}`);
    if (target) target.classList.remove('hidden-section');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const activeTab = document.getElementById(`tab-${viewId}`);
    if (activeTab) activeTab.classList.add('active');
    if (updateHash) window.location.hash = viewId;
}

function switchRaidSubView(subviewId, updateHash = true) {
    document.getElementById('raidSummaryView')?.classList.toggle('hidden', subviewId !== 'summary');
    document.getElementById('raidAttacksView')?.classList.toggle('hidden', subviewId !== 'attacks');
    document.getElementById('raidDefensesView')?.classList.toggle('hidden', subviewId !== 'defenses');
    document.querySelectorAll('#section-raids .sub-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`raid-subtab-${subviewId}`)?.classList.add('active');
    const raid = fullRaidHistory[currentRaidIndex];
    if (raid) {
        if (subviewId === 'summary') renderRaidSummary(raid, allMembers);
        else if (subviewId === 'attacks') renderRaidAttacks(raid);
        else if (subviewId === 'defenses') renderRaidDefenses(raid);
    }
    if (updateHash) window.location.hash = `raids/${subviewId}`;
}

function updateMemberCount(count) {
    const el = document.getElementById('memberCount');
    if (el) el.innerText = `${count} / 50`;
}

function updateWarCount(filtered, total) {
    const el = document.getElementById('warCount');
    if (el) el.innerText = `${filtered} / ${total}`;
}

/**
 * A war result is only authoritative once the API has archived it as
 * 'warEnded'. Files frozen at 'inWar'/'preparation' are stale partial
 * snapshots from the old scraper and must never be scored or aggregated.
 * ponytail: read-only guard; upgrade path is a one-off purge of dead files.
 */
function isWarDecided(w) {
    return w.state === 'warEnded';
}

/*
 * KPI strip on Overview — the dashboard's focal numbers. Every value is
 * derived from data already fetched by init(); nothing here hits the network.
 * ponytail: donations are the API's weekly-reset totals; upgrade path is a
 * diff against the 7-day-old snapshot for a real delta.
 */
function renderKpis(clan) {
    const host = document.getElementById('aboutContent');
    if (!host || !clan) return;
    // Idempotent: init, repaint and the Overview tab click all call this;
    // drop any previously rendered strip so exactly one exists.
    host.querySelector('.kpi-grid')?.remove();
    const members = clan.memberList || clan.members || [];
    const totalTrophies = members.reduce((s, m) => s + (m.trophies || 0), 0);
    const avgTrophy = members.length ? Math.round(totalTrophies / members.length) : 0;
    const donations = members.reduce((s, m) => s + (m.donations || 0), 0);
    const decided = fullWarHistory.filter(isWarDecided);
    const wins = decided.filter(w => {
        const cs = w.clan.stars || 0, os = w.opponent.stars || 0;
        return cs > os || (cs === os && (w.clan.destructionPercentage || 0) > (w.opponent.destructionPercentage || 0));
    }).length;
    const winRate = decided.length ? Math.round((wins / decided.length) * 100) : null;
    const raid = fullRaidHistory[0];
    // #4 — raid efficiency: districts per attack + best attacker, straight
    // from the weekend's attackLog (stars credited per district attack).
    let ra = 0; const byTag = {};
    (raid?.attackLog || []).forEach(e => (e.districts || []).forEach(d => (d.attacks || []).forEach(a => {
        ra++;
        byTag[a.attacker.tag] = byTag[a.attacker.tag] || { name: a.attacker.name, stars: 0, n: 0 };
        byTag[a.attacker.tag].stars += a.stars; byTag[a.attacker.tag].n++;
    })));
    const destroyed = (raid?.attackLog || []).reduce((s, e) => s + (e.districtsDestroyed || 0), 0);
    const best = Object.values(byTag).sort((a, b) => b.stars - a.stars || b.n - a.n)[0];
    const dpa = ra ? (destroyed / ra).toFixed(2) : null;

    // #3 — town hall spread: counts per TH, rendered as a mini bar chart.
    const thCount = {};
    members.forEach(m => { const t = m.townHallLevel || 0; thCount[t] = (thCount[t] || 0) + 1; });
    const thMax = Math.max(1, ...Object.values(thCount));
    const spread = Object.entries(thCount).sort((a, b) => a[0] - b[0])
        .map(([t, c]) => `<i style="height:${Math.max(8, c / thMax * 100)}%" title="TH${t}: ${c}"></i>`).join('');

    const kpis = [
        ['Members', `${members.length} / 50`, clan.clanLevel ? `Clan level ${clan.clanLevel}` : ''],
        ['War Win Rate', winRate === null ? '—' : `${winRate}%`, decided.length ? `${wins}W of ${decided.length} decided wars` : 'no decided wars yet'],
        ['Total Trophies', totalTrophies.toLocaleString(), `avg ${avgTrophy.toLocaleString()}`],
        ['Donations', donations.toLocaleString(), 'this week (API reset weekly)'],
        ['Last Raid', destroyed ? `${destroyed} districts` : (raid?.raidsCompleted ?? '—'), raid ? `${(raid.capitalTotalLoot ?? 0).toLocaleString()} gold looted` : 'no raids logged'],
        ['Raid Efficiency', dpa === null ? '—' : `${dpa} d/a`, best ? `top: ${best.name} (${best.stars}★)` : 'attack log empty'],
    ];
    // Career totals from /players — lifetime, unlike the weekly donation reset.
    const careers = Object.values(playerCareers);
    if (careers.length) {
        const stars = careers.reduce((s, p) => s + (p.warStars || 0), 0);
        const cap = careers.reduce((s, p) => s + (p.clanCapitalContributions || 0), 0);
        kpis.push(['War Stars (career)', stars.toLocaleString(), `${careers.length} members tracked`]);
        kpis.push(['Capital Contrib.', cap.toLocaleString()], );
        kpis[kpis.length-1].push('lifetime, per roster');
    }
    if (clanMeta?.countryRank?.rank) {
        kpis.push(['National Rank', `#${clanMeta.countryRank.rank}`, clanMeta.countryRank.locationName || '']);
    }
    if (clanMeta?.goldpass?.endTime) {
        const end = new Date(`${clanMeta.goldpass.endTime.slice(0,4)}-${clanMeta.goldpass.endTime.slice(4,6)}-${clanMeta.goldpass.endTime.slice(6,8)}`);
        const days = Math.max(0, Math.ceil((end - new Date()) / 86400000));
        kpis.push(['Goldpass Ends', `${days}d`, end.toISOString().slice(0,10)]);
    }
    const grid = document.createElement('div');
    grid.className = 'kpi-grid';
    grid.innerHTML = kpis.map(([label, value, sub]) => `
        <div class="kpi">
            <p class="kpi-label">${esc(label)}</p>
            <p class="kpi-value">${esc(String(value))}</p>
            <p class="kpi-sub">${esc(sub)}</p>
        </div>`).join('') + `
        <div class="kpi">
            <p class="kpi-label">TH Spread</p>
            <div class="kpi-bars" aria-label="town hall distribution">${spread}</div>
            <p class="kpi-sub">avg ${(members.length ? members.reduce((s, m) => s + (m.townHallLevel || 0), 0) / members.length : 0).toFixed(1)} · max TH${Math.max(0, ...members.map(m => m.townHallLevel || 0))}</p>
        </div>`;
    host.insertBefore(grid, host.firstChild);
}

function updateHeader(name, badgeUrl) {
    const title = document.getElementById('pageTitle');
    const badge = document.getElementById('clanBadge');
    if (title) title.innerText = name;
    if (badge && badgeUrl) {
        badge.src = badgeUrl;
        badge.classList.remove('hidden');
    }
}

window.syncData = async () => {
    const btns = document.querySelectorAll('.sync-btn');
    btns.forEach(b => b.classList.add('syncing'));
    try {
        await init();
        if (activeWarFilename) {
            const warData = fullWarHistory.find(w => w.filename === activeWarFilename);
            if (warData) renderWarDetail(warData, fullWarHistory);
        }
    } catch (e) { console.error("Sync failed", e); } finally {
        setTimeout(() => btns.forEach(b => b.classList.remove('syncing')), 500);
    }
};

function preRoute() {
    const hash = window.location.hash.replace('#', '');
    const tabAbout = document.getElementById('tab-about');
    const tabMembers = document.getElementById('tab-members');
    const tabWar = document.getElementById('tab-war');
    const tabStats = document.getElementById('tab-stats');
    const tabRaids = document.getElementById('tab-raids');
    const tabBroadcast = document.getElementById('tab-broadcast');
    if (!tabAbout || !tabMembers || !tabWar || !tabStats || !tabRaids) return;
    [tabAbout, tabMembers, tabWar, tabStats, tabRaids, tabBroadcast].forEach(t => t?.classList.remove('active'));
    if (!hash || hash === 'about') tabAbout.classList.add('active');
    else if (hash === 'members') tabMembers.classList.add('active');
    else if (hash.startsWith('war')) tabWar.classList.add('active');
    else if (hash === 'stats') tabStats.classList.add('active');
    else if (hash.startsWith('raids')) tabRaids.classList.add('active');
    else if (hash === 'broadcast') tabBroadcast?.classList.add('active');
}

async function init() {
    try {
        const clanData = await fetchClanData();
        latestClanData = clanData;
        allMembers = clanData.memberList || clanData.members || [];
        updateDisplay();
        renderAbout(latestClanData);
        bindAboutPageEvents();
        updateHeader(clanData.name, clanData.badgeUrls?.medium || clanData.badgeUrls?.small);
    } catch (e) { console.error("Could not load latest clan data.", e); }

    try {
        const memberIndex = await fetchMembersIndex();
        const todayStr = new Date().toISOString().split('T')[0];
        availableMemberDates = memberIndex.map(f => {
            const dateStr = f.replace('members_', '').replace('.json', '');
            return `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
        });
        let bestDefaultDate = availableMemberDates[0] || todayStr;
        if (!availableMemberDates.includes(todayStr)) availableMemberDates.push(todayStr);
        if (fp) fp.destroy();
        fp = flatpickr("#memberDate", {
            defaultDate: bestDefaultDate, enable: availableMemberDates, dateFormat: "Y-m-d",
            disableMobile: true,
            onChange: function(selectedDates, dateStr) { handleMemberDateChange(dateStr); }
        });
    } catch (e) { console.warn("Could not setup member date filters.", e); }

    try {
        const warIndex = await fetchWarIndex();
        const warDataPromises = warIndex.reverse().map(async (filename) => {
            try {
                const data = await fetchWarData(filename);
                return { ...data, filename };
            } catch (e) { return null; }
        });
        fullWarHistory = (await Promise.all(warDataPromises)).filter(w => w !== null);

        // Optional enrichments — every one tolerates a missing file.
        const [careers, meta, warlog] = await Promise.all([
            fetchPlayerCareers(), fetchMeta(), fetchWarLog()]);
        playerCareers = careers?.players || {};
        clanMeta = meta;

        // Warlog = last ~50 finished wars with results but no per-player data.
        // Merge as summary-only pseudo-wars; skip any already covered by a
        // real currentwar snapshot (same endTime), which is richer.
        const realEnds = new Set(fullWarHistory.map(w => w.endTime));
        warLogHistory = (warlog?.items || [])
            .filter(it => !realEnds.has(it.endTime))
            .map(it => ({
                ...it,
                state: 'warEnded',
                startTime: it.startTime || it.endTime,  // API gives only endTime
                summaryOnly: true,
                filename: 'warlog_' + it.endTime,
            }));
        fullWarHistory = [...fullWarHistory, ...warLogHistory];
        filterWarHistory();
        // Clan/KPI pass ran before these arrived — repaint members & KPIs.
        updateDisplay();
        if (latestClanData) { const g = document.querySelector('#aboutContent .kpi-grid'); g?.remove(); renderKpis(latestClanData); }
        setupWarHistoryPickers();
    } catch (e) { console.error("Could not load war history.", e); }

    try {
        const raidIndex = await fetchRaidIndex();
        const raidDataPromises = raidIndex.reverse().map(async (filename) => {
            try {
                const data = await fetchRaidData(filename);
                const items = data.items || [data];
                return items.map(item => ({ ...item, filename }));
            } catch (e) { return null; }
        });
        const raidResults = await Promise.all(raidDataPromises);
        fullRaidHistory = raidResults.flat().filter(r => r !== null);
        setupRaidCalendar();
        handleInitialRoute();
    } catch (e) { console.error("Could not load raid history.", e); handleInitialRoute(); }
}

function setupRaidCalendar() {
    const calendarEl = document.getElementById('raidWeekendCalendar');
    if (!calendarEl || fullRaidHistory.length === 0) return;

    const getDateStr = (d) => {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const enabledDates = [];
    fullRaidHistory.forEach(r => {
        let current = parseCoCDate(r.startTime);
        const end = parseCoCDate(r.endTime);
        while (current <= end) {
            enabledDates.push(getDateStr(current));
            current.setUTCDate(current.getUTCDate() + 1);
        }
    });

    if (raidFp) raidFp.destroy();
    raidFp = flatpickr(calendarEl, {
        enable: enabledDates,
        dateFormat: "Y-m-d",
        defaultDate: enabledDates[0],
        disableMobile: true,
        onChange: (selectedDates) => {
            if (selectedDates.length === 0) return;
            const sel = selectedDates[0];
            const selectedStr = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}`;
            
            const idx = fullRaidHistory.findIndex(r => {
                let check = parseCoCDate(r.startTime);
                const rEnd = parseCoCDate(r.endTime);
                while (check <= rEnd) {
                    if (getDateStr(check) === selectedStr) return true;
                    check.setUTCDate(check.getUTCDate() + 1);
                }
                return false;
            });

            if (idx !== -1) {
                currentRaidIndex = idx;
                const activeSubTab = document.querySelector('#section-raids .sub-tab-btn.active')?.id.replace('raid-subtab-', '') || 'summary';
                switchRaidSubView(activeSubTab);
            }
        }
    });

    currentRaidIndex = 0;
    switchRaidSubView('summary', false);
}

function setupWarHistoryPickers() {
    warHistoryPickers.forEach(p => p.destroy());
    const startEl = document.getElementById('warStartDate');
    const endEl = document.getElementById('warEndDate');
    if (!startEl || !endEl) return;
    const sP = flatpickr(startEl, { 
        dateFormat: "Y-m-d", 
        disableMobile: true,
        onChange: (selectedDates) => {
            if (selectedDates.length > 0) eP.set('minDate', selectedDates[0]);
            filterWarHistory(); 
        } 
    });
    const eP = flatpickr(endEl, { 
        dateFormat: "Y-m-d", 
        disableMobile: true,
        onChange: (selectedDates) => {
            if (selectedDates.length > 0) sP.set('maxDate', selectedDates[0]);
            filterWarHistory(); 
        } 
    });
    warHistoryPickers = [sP, eP];
}

function handleInitialRoute() {
    if (latestClanData) renderKpis(latestClanData);
    const hash = window.location.hash.replace('#', '');
    if (!hash || hash === 'about') { switchView('about', false); return; }
    if (hash === 'members') { switchView(hash, false); }
    else if (hash === 'stats') {
        switchView('stats', false);
        renderCharts(fullWarHistory, document.getElementById('statsTimeRange')?.value || 'month');
    }
    else if (hash === 'broadcast') {
        switchView('broadcast', false);
        initBroadcast();
    }
    else if (hash.startsWith('raids')) {
        const parts = hash.split('/');
        const subview = parts[1] || 'summary';
        switchView('raids', false);
        switchRaidSubView(subview, false);
    }
    else if (hash.startsWith('war/')) {
        const parts = hash.split('/');
        let detailFile = parts[2];
        if (detailFile && !detailFile.endsWith('.json')) detailFile += '.json';
        switchView('war', false);
        if (detailFile) loadWarDetail(detailFile, false); 
    } else if (hash === 'war') { switchView('war', false); }
}

function bindAboutPageEvents() {
    const btn = document.getElementById('viewWarHistoryBtn');
    if (btn) btn.onclick = () => { switchView('war'); };
}

async function handleMemberDateChange(dateValue, shouldFetch = true) {
    if (!dateValue) return;
    const snapshotName = `members_${dateValue.replace(/-/g, '')}.json`;
    try {
        let data = await fetchHistoricalMembers(snapshotName);
        allMembers = data.memberList || data.members || [];
        updateDisplay();
    } catch (e) {
        const fb = await fetchClanData(); allMembers = fb.memberList || fb.members || []; updateDisplay();
    }
}

function filterWarHistory() {
    const startVal = document.getElementById('warStartDate')?.value.replace(/-/g, '') || '';
    const endVal = document.getElementById('warEndDate')?.value.replace(/-/g, '') || '';
    let filtered = fullWarHistory.filter(w => {
        const warDate = w.startTime.substring(0, 8);
        if (startVal && warDate < startVal) return false;
        if (endVal && warDate > endVal) return false;
        
        if (currentWarFilter !== 'all') {
            // Victory/Defeat/Draw filters describe outcomes; an undecided
            // snapshot has no outcome and must not appear under any of them.
            if (!isWarDecided(w)) return false;
            const clanStars = w.clan.stars || 0;
            const oppStars = w.opponent.stars || 0;
            const clanDest = w.clan.destructionPercentage || 0;
            const oppDest = w.opponent.destructionPercentage || 0;
            
            let result = 'draw';
            if (clanStars > oppStars) result = 'victory';
            else if (clanStars < oppStars) result = 'loss';
            else {
                if (clanDest > oppDest) result = 'victory';
                else if (clanDest < oppDest) result = 'loss';
            }
            
            if (result !== currentWarFilter) return false;
        }
        
        return true;
    });
    updateWarCount(filtered.length, fullWarHistory.length);
    renderWarHistory(filtered);
}

function updateDisplay() {
    const sortKey = document.getElementById('sortBy')?.value || 'league';
    let filtered = allMembers.filter(m => currentRoleFilter === 'all' || m.role === currentRoleFilter);
    updateMemberCount(filtered.length);
    filtered.sort((a, b) => {
        if (sortKey === 'role') return (roleWeight[b.role] || 0) - (roleWeight[a.role] || 0);
        if (sortKey === 'net') return ((b.donations||0)-(b.donationsReceived||0)) - ((a.donations||0)-(a.donationsReceived||0));
        // /players fields live outside the clan snapshot; join via careers map.
        if (sortKey === 'warStars') return (playerCareers[b.tag]?.warStars || 0) - (playerCareers[a.tag]?.warStars || 0);
        if (sortKey === 'bestTrophies') return (playerCareers[b.tag]?.bestTrophies || 0) - (playerCareers[a.tag]?.bestTrophies || 0);
        if (sortKey === 'league') {
            const lA = a.leagueTier?.id || a.league?.id || 0; const lB = b.leagueTier?.id || b.league?.id || 0;
            return lA !== lB ? lB - lA : (b.trophies || 0) - (a.trophies || 0);
        }
        return (b[sortKey] || 0) - (a[sortKey] || 0);
    });
    renderMembers(filtered, playerCareers);
}

function setRoleFilter(role, btn) {
    currentRoleFilter = role;
    document.querySelectorAll('#section-members .sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); updateDisplay();
}

function setWarResultFilter(filter, btn) {
    currentWarFilter = filter;
    document.querySelectorAll('#section-war .sub-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterWarHistory();
}

async function loadWarDetail(filename, updateHash = true) {
    const warData = fullWarHistory.find(w => w.filename === filename);
    if (warData) {
        activeWarFilename = filename;
        document.getElementById('warMainHeader')?.classList.add('hidden');
        document.getElementById('warListView')?.classList.add('hidden');
        document.getElementById('warDetailView')?.classList.remove('hidden');
        document.getElementById('warHistoryControls')?.classList.add('hidden');
        renderWarDetail(warData, fullWarHistory);
        if (updateHash) window.location.hash = `war/details/${filename.replace('.json', '')}`;
    }
}

function showWarList() {
    activeWarFilename = null;
    switchView('war', false);
    document.getElementById('warMainHeader')?.classList.remove('hidden');
    document.getElementById('warListView')?.classList.remove('hidden');
    document.getElementById('warDetailView')?.classList.add('hidden');
    document.getElementById('warHistoryControls')?.classList.remove('hidden');
    window.location.hash = `war`;
}

window.loadWarDetail = loadWarDetail;

document.addEventListener('DOMContentLoaded', () => {
    preRoute(); init();
    document.getElementById('tab-about')?.addEventListener('click', () => { switchView('about'); if (latestClanData) { renderAbout(latestClanData); renderKpis(latestClanData); } bindAboutPageEvents(); });
    document.getElementById('tab-members')?.addEventListener('click', () => {
        switchView('members');
        currentRoleFilter = 'all';
        document.querySelectorAll('#section-members .sub-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('#section-members [data-role="all"]')?.classList.add('active');
        updateDisplay();
    });
    document.getElementById('tab-war')?.addEventListener('click', () => { 
        showWarList();
        currentWarFilter = 'all';
        document.querySelectorAll('#section-war .sub-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('#section-war [data-war-filter="all"]')?.classList.add('active');
        filterWarHistory();
    });
    document.getElementById('tab-stats')?.addEventListener('click', () => { 
        switchView('stats'); 
        renderCharts(fullWarHistory, document.getElementById('statsTimeRange')?.value || 'month');
    });
    document.getElementById('tab-raids')?.addEventListener('click', () => { switchView('raids'); switchRaidSubView('summary'); });
    document.getElementById('tab-broadcast')?.addEventListener('click', () => { switchView('broadcast'); initBroadcast(); });
    document.getElementById('raid-subtab-summary')?.addEventListener('click', () => switchRaidSubView('summary'));
    document.getElementById('raid-subtab-attacks')?.addEventListener('click', () => switchRaidSubView('attacks'));
    document.getElementById('raid-subtab-defenses')?.addEventListener('click', () => switchRaidSubView('defenses'));
    
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.raid-sort-btn');
        if (btn) {
            const table = btn.getAttribute('data-table');
            const sortKey = btn.getAttribute('data-sort');
            setRaidSort(table, sortKey);
            switchRaidSubView(table, false);
        }
    });

    document.getElementById('resetRaidSort')?.addEventListener('click', () => {
        const activeSubTab = document.querySelector('#section-raids .sub-tab-btn.active')?.id.replace('raid-subtab-', '') || 'summary';
        resetRaidSort(activeSubTab);
        switchRaidSubView(activeSubTab, false);
    });

    document.getElementById('statsTimeRange')?.addEventListener('change', (e) => { renderCharts(fullWarHistory, e.target.value); });
    document.getElementById('sortBy')?.addEventListener('change', updateDisplay);
    document.getElementById('backToWarList')?.addEventListener('click', showWarList);
    document.getElementById('resetMembersFilters')?.addEventListener('click', () => {
        currentRoleFilter = 'all'; 
        document.querySelectorAll('#section-members .sub-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('#section-members [data-role="all"]')?.classList.add('active');
        document.getElementById('sortBy').value = 'league';
        updateDisplay();
    });
    document.getElementById('resetWarFilters')?.addEventListener('click', () => {
        const start = document.getElementById('warStartDate');
        const end = document.getElementById('warEndDate');
        if (start) start.value = '';
        if (end) end.value = '';
        warHistoryPickers.forEach(p => { p.clear(); p.set('minDate', null); p.set('maxDate', null); });
        currentWarFilter = 'all';
        document.querySelectorAll('#section-war .sub-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('#section-war [data-war-filter="all"]')?.classList.add('active');
        filterWarHistory();
    });
    document.querySelectorAll('#section-members .sub-tab-btn').forEach(btn => { 
        if (btn.hasAttribute('data-role')) {
            btn.addEventListener('click', () => setRoleFilter(btn.getAttribute('data-role'), btn)); 
        }
    });
    document.querySelectorAll('#section-war .sub-tab-btn').forEach(btn => {
        if (btn.hasAttribute('data-war-filter')) {
            btn.addEventListener('click', () => setWarResultFilter(btn.getAttribute('data-war-filter'), btn));
        }
    });
    document.addEventListener('click', () => { document.querySelectorAll('.info-tooltip').forEach(t => t.classList.remove('active')); });

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const html = document.documentElement;
        const next = html.dataset.theme === 'day' ? 'night' : 'day';
        html.dataset.theme = next;
        localStorage.setItem('coc-theme', next);
        // Chart.js colors are computed once at build time — re-render them.
        renderCharts(fullWarHistory, document.getElementById('statsTimeRange')?.value || 'month');
    });
});
