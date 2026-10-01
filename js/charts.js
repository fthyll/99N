/**
 * Analytics & Charts Module
 * Handles all MTD statistical aggregations and Chart.js rendering.
 */
import { parseCoCDate, esc } from './constants.js';
import { resolveStatsRange } from './statsrange.js';

// Resolve theme tokens (css/style.css) at draw time so charts flip with
// day/night. Triplet vars need rgb(); --ink etc. are ready-made colors.
const tok = (n) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return v.includes(' ') ? `rgb(${v})` : v;
};
const chartTheme = () => ({
    gold: tok('--gold'), line: tok('--g800'), tick: tok('--muted'), name: tok('--g300'),
    bar3: tok('--bar3'), bar2: tok('--bar2'), bar1: tok('--bar1'), bar0: tok('--bar0'),
});

let starsChart = null;      
let efficiencyChart = null; 

/**
 * Main entry point for rendering the Stats tab.
 * @param {Array} warHistory - Full list of war data.
 * @param {string} range - Filter type ('month', 'week', 'prev').
 */
export function renderCharts(warHistory, range = 'month') {
    if (!warHistory || warHistory.length === 0) return;

    // An empty calendar range falls back to the nearest range that has data,
    // and reports it, so three blank panels never read as a broken tab.
    const { wars: filteredHistory, label } = resolveStatsRange(warHistory, range);
    paintStatsRangeNote(label);

    renderStarsTrend(filteredHistory);
    renderTopPerformers(filteredHistory);
    renderEfficiencyChart(filteredHistory);
}

// The note doubles as the empty state: when nothing resolves at all it is the
// only thing in the three panels, so it has to explain rather than sit silent.
function paintStatsRangeNote(label) {
    const note = document.getElementById('statsRangeNote');
    if (!note) return;
    note.textContent = label;
    note.classList.toggle('hidden-section', !/no wars in/i.test(label));
}

function renderStarsTrend(warHistory) {
    const canvas = document.getElementById('starsTrendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const now = new Date();

    const finishedWars = warHistory.filter(w => parseCoCDate(w.endTime) < now);
    if (finishedWars.length === 0) {
        if (starsChart) starsChart.destroy();
        return;
    }

    const sortedHistory = finishedWars.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const labels = sortedHistory.map(w => w.startTime.substring(4, 6) + '/' + w.startTime.substring(6, 8));
    const data = sortedHistory.map(w => {
        const totalPossibleStars = (w.teamSize || 0) * 3;
        return totalPossibleStars === 0 ? 0 : ((w.clan.stars / totalPossibleStars) * 100).toFixed(1);
    });

    const th = chartTheme();
    if (starsChart) starsChart.destroy();
    starsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Stars Won (%)',
                data: data,
                borderColor: th.gold,
                backgroundColor: 'rgba(224, 189, 99, 0.10)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: th.line }, ticks: { color: th.tick, font: { size: 9 } } },
                x: { grid: { color: th.line }, ticks: { color: th.tick, font: { size: 9 } } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderTopPerformers(warHistory) {
    const container = document.getElementById('topPerformersContainer');
    if (!container) return;
    
    const statsMap = {}; 
    warHistory.forEach(war => {
        if (!war.clan || !war.clan.members) return;
        war.clan.members.forEach(m => {
            if (!statsMap[m.tag]) statsMap[m.tag] = { name: m.name, s3: 0, s2: 0, s1: 0, s0: 0, totalStars: 0 };
            (m.attacks || []).forEach(atk => {
                statsMap[m.tag].totalStars += atk.stars;
                if (atk.stars === 3) statsMap[m.tag].s3++;
                else if (atk.stars === 2) statsMap[m.tag].s2++;
                else if (atk.stars === 1) statsMap[m.tag].s1++;
                else statsMap[m.tag].s0++;
            });
        });
    });

    const topPerformers = Object.values(statsMap)
        .filter(p => (p.s3 + p.s2 + p.s1 + p.s0) > 0)
        .sort((a, b) => b.totalStars - a.totalStars || b.s3 - a.s3)
        .slice(0, 25);

    if (topPerformers.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-600 py-10 text-[10px]">No attack data for this range.</p>`;
        return;
    }

    let html = `<table class="w-full text-[10px] text-left border-collapse"><thead><tr class="border-b border-gray-800 text-gray-500 uppercase font-black"><th class="py-2 pl-1">Player</th><th class="py-2 text-center text-green-500">3★</th><th class="py-2 text-center text-yellow-500">2★</th><th class="py-2 text-center text-red-500">1★</th><th class="py-2 text-center text-gray-500">0★</th><th class="py-2 text-right pr-1 gold">Total</th></tr></thead><tbody class="divide-y divide-gray-800/30">`;
    topPerformers.forEach(p => {
        html += `<tr class="hover:bg-white/5 transition-colors"><td class="py-2 pl-1 font-bold text-gray-300">${esc(p.name)}</td><td class="py-2 text-center font-mono">${p.s3}</td><td class="py-2 text-center font-mono">${p.s2}</td><td class="py-2 text-center font-mono">${p.s1}</td><td class="py-2 text-center font-mono">${p.s0}</td><td class="py-2 text-right pr-1 font-bold gold">${p.totalStars}</td></tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderEfficiencyChart(warHistory) {
    const canvas = document.getElementById('efficiencyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const statsMap = {}; 

    warHistory.forEach(war => {
        if (!war.clan || !war.clan.members) return;
        war.clan.members.forEach(m => {
            if (!statsMap[m.tag]) statsMap[m.tag] = { name: m.name, s3: 0, s2: 0, s1: 0, s0: 0, total: 0 };
            (m.attacks || []).forEach(atk => {
                statsMap[m.tag].total++;
                if (atk.stars === 3) statsMap[m.tag].s3++;
                else if (atk.stars === 2) statsMap[m.tag].s2++;
                else if (atk.stars === 1) statsMap[m.tag].s1++;
                else statsMap[m.tag].s0++;
            });
        });
    });

    const top25 = Object.values(statsMap).filter(p => p.total > 0).sort((a, b) => (b.s3/b.total) - (a.s3/a.total) || b.total - a.total).slice(0, 25);
    if (top25.length === 0) { if (efficiencyChart) efficiencyChart.destroy(); return; }

    const th = chartTheme();
    const labels = top25.map(p => p.name);
    const datasets = [
        { label: '3-Star %', data: top25.map(p => (p.s3/p.total*100).toFixed(1)), backgroundColor: th.bar3 },
        { label: '2-Star %', data: top25.map(p => (p.s2/p.total*100).toFixed(1)), backgroundColor: th.bar2 },
        { label: '1-Star %', data: top25.map(p => (p.s1/p.total*100).toFixed(1)), backgroundColor: th.bar1 },
        { label: 'Fail %', data: top25.map(p => (p.s0/p.total*100).toFixed(1)), backgroundColor: th.bar0 }
    ];

    if (efficiencyChart) efficiencyChart.destroy();
    efficiencyChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            scales: {
                x: { stacked: true, beginAtZero: true, max: 100, grid: { color: th.line }, ticks: { color: th.tick, font: { size: 9 }, callback: (v) => v + '%' } },
                y: { stacked: true, grid: { display: false }, ticks: { color: th.name, font: { size: 10, weight: 'bold' } } }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: th.tick, font: { size: 9 }, boxWidth: 10, padding: 15 } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}%` } }
            }
        }
    });
    const container = document.getElementById('efficiencyContainer');
    if (container) container.style.height = `${top25.length * 28 + 60}px`;
}
