import { roleMap, getTHImage, esc } from './constants.js';
/**
 * Renders the member roster list with league icons and donation stats.
 */
export function renderMembers(list, careers = {}) {
    const container = document.getElementById('memberList');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-600 py-10 italic">No members found.</p>`;
        return;
    }
    container.innerHTML = list.map(m => {
        const leagueIcon = m.leagueTier?.iconUrls?.small || m.league?.iconUrls?.small || '';
        const net = (m.donations || 0) - (m.donationsReceived || 0);
        const netCls = net > 0 ? 'text-green-500' : net < 0 ? 'text-red-400' : 'text-gray-500';
        const bbLeague = m.builderBaseLeague?.name || '';
        return `
        <div class="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-card border border-transparent rounded-lg">
            <img src="${getTHImage(m.townHallLevel)}" class="th-icon">
            <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-1 md:gap-2 truncate">
                    <span class="font-bold text-[11px] md:text-xs text-white">${esc(m.name)}</span>
                    <span class="text-[7px] md:text-[8px] text-gray-500 font-mono">XP ${m.expLevel}</span>
                    ${careers[m.tag]?.warStars != null ? `<span class="text-[7px] md:text-[8px] gold font-mono" title="Career war stars · best trophies ${careers[m.tag].bestTrophies?.toLocaleString() ?? '—'}">★${careers[m.tag].warStars.toLocaleString()}</span>` : ''}
                </div>
                <span class="text-[7px] md:text-[8px] gold font-bold uppercase block">${roleMap[m.role]}</span>
                <div class="flex gap-3 md:gap-4 mt-1 md:mt-1.5">
                    <div><p class="stat-label">Donated</p><p class="stat-value text-green-500 text-[8px] md:text-[9px]">${m.donations}</p></div>
                    <div><p class="stat-label">Received</p><p class="stat-value text-red-400 text-[8px] md:text-[9px]">${m.donationsReceived}</p></div>
                    <div><p class="stat-label">Net</p><p class="stat-value ${netCls} text-[8px] md:text-[9px]">${net > 0 ? '+' : ''}${net}</p></div>
                </div>
            </div>
            <div class="flex flex-col items-center justify-center min-w-[50px] md:min-w-[60px]">
                ${leagueIcon ? `<img src="${esc(leagueIcon)}" class="w-5 h-5 md:w-6 md:h-6 object-contain mb-1" title="${esc(m.leagueTier?.name || m.league?.name || 'Unranked')}">` : ''}
                <p class="text-[11px] md:text-xs font-bold text-gold">${m.trophies.toLocaleString()}</p>
                <p class="text-[7px] md:text-[8px] text-gray-600 uppercase font-bold tracking-tighter">Trophies</p>
            </div>
            <div class="flex flex-col items-center justify-center min-w-[50px] md:min-w-[60px]" title="${esc(bbLeague || 'Builder Base')}">
                <p class="text-[11px] md:text-xs font-bold text-gray-300">${(m.builderBaseTrophies || 0).toLocaleString()}</p>
                <p class="text-[7px] md:text-[8px] text-gray-600 uppercase font-bold tracking-tighter">BB</p>
            </div>
        </div>`;
    }).join('');
}
