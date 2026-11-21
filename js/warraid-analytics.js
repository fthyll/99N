import { esc } from './constants.js';

const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const pct = value => `${(value * 100).toFixed(1)}%`;
const fmt = value => Number(value || 0).toLocaleString();

function resultOf(war) {
    const clanStars = numeric(war.clan?.stars), rivalStars = numeric(war.opponent?.stars);
    if (clanStars !== rivalStars) return clanStars > rivalStars ? 'win' : 'loss';
    const clanDestruction = numeric(war.clan?.destructionPercentage);
    const rivalDestruction = numeric(war.opponent?.destructionPercentage);
    if (clanDestruction !== rivalDestruction) return clanDestruction > rivalDestruction ? 'win' : 'loss';
    return 'draw';
}

export function summarizeWars(wars = []) {
    return (wars || []).filter(war => war?.state === 'warEnded' && Array.isArray(war.clan?.members)).map(war => {
        const members = war.clan.members;
        const attacksUsed = members.reduce((sum, member) => sum + (member.attacks || []).length, 0);
        const attacksPossible = numeric(war.teamSize) * numeric(war.attacksPerMember);
        const players = new Map();
        for (const member of members) {
            const score = players.get(member.tag) || { name: member.name || 'Unknown', stars: 0, attacks: 0 };
            for (const attack of member.attacks || []) {
                score.stars += numeric(attack.stars);
                score.attacks++;
            }
            players.set(member.tag, score);
        }
        const playerScores = [...players.entries()].map(([tag, score]) => ({ tag, ...score }));
        const topPlayer = playerScores.filter(player => player.attacks)
            .sort((a, b) => b.stars - a.stars || b.attacks - a.attacks || a.name.localeCompare(b.name))[0] || null;
        const result = resultOf(war);
        return {
            startTime: war.startTime,
            result,
            players: playerScores,
            clanStars: numeric(war.clan.stars),
            rivalStars: numeric(war.opponent?.stars),
            clanDestruction: numeric(war.clan.destructionPercentage),
            rivalDestruction: numeric(war.opponent?.destructionPercentage),
            attacksUsed,
            attacksPossible,
            attackRate: attacksPossible ? attacksUsed / attacksPossible : null,
            topPlayer,
        };
    });
}

export function summarizeRaids(raids = []) {
    return (raids || []).filter(Boolean).map(raid => {
        const participants = Array.isArray(raid.members) ? raid.members : [];
        const attacksUsed = numeric(raid.totalAttacks) || participants.reduce((sum, member) => sum + numeric(member.attacks), 0);
        const attacksPossible = participants.reduce((sum, member) =>
            sum + numeric(member.attackLimit) + numeric(member.bonusAttackLimit), 0);
        const districtsDestroyed = numeric(raid.enemyDistrictsDestroyed);
        return {
            startTime: raid.startTime,
            state: raid.state,
            participants: participants.length,
            attacksUsed,
            attacksPossible,
            attacksRemaining: Math.max(0, attacksPossible - attacksUsed),
            totalLoot: numeric(raid.capitalTotalLoot),
            districtsDestroyed,
            districtsDestroyedPerAttack: attacksUsed ? districtsDestroyed / attacksUsed : null,
        };
    });
}

function stat(label, value, detail) {
    return `<div class="warraid-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`;
}

export function renderWarRaidAnalytics(wars, raids) {
    const warHost = document.getElementById('warAnalytics');
    const raidHost = document.getElementById('raidAnalytics');
    if (warHost) {
        const summaries = summarizeWars(wars);
        if (!summaries.length) {
            warHost.innerHTML = '<p class="text-sm text-gray-500">No finished wars with attack snapshots are archived.</p>';
        } else {
            const results = summaries.reduce((counts, war) => ({ ...counts, [war.result]: counts[war.result] + 1 }), { win: 0, loss: 0, draw: 0 });
            const used = summaries.reduce((sum, war) => sum + war.attacksUsed, 0);
            const possible = summaries.reduce((sum, war) => sum + war.attacksPossible, 0);
            const winRate = results.win + results.loss ? results.win / (results.win + results.loss) : null;
            const players = new Map();
            for (const war of summaries) {
                for (const player of war.players) {
                    const score = players.get(player.tag) || { ...player, wars: 0 };
                    score.stars += player.stars;
                    score.attacks += player.attacks;
                    score.wars++;
                    players.set(player.tag, score);
                }
            }
            const top = [...players.values()].sort((a, b) => b.stars - a.stars || b.attacks - a.attacks || a.name.localeCompare(b.name))[0];
            warHost.innerHTML = `<div class="warraid-stats">${stat('Finished wars', fmt(summaries.length), `${results.win} wins · ${results.loss} losses · ${results.draw} draws`)}${stat('Win rate', winRate == null ? '—' : pct(winRate), 'Draws excluded')}${stat('Attack use', possible ? pct(used / possible) : '—', `${fmt(used)} of ${fmt(possible)} available attacks`)}${stat('Top war stars', top ? `${esc(top.name)} · ${fmt(top.stars)}★` : '—', top ? `${fmt(top.attacks)} attacks across ${fmt(top.wars)} wars` : 'No attack records')}</div><p class="text-xs text-gray-500 mt-2">Only ended wars with archived member attacks are included. Warlog-only summaries and partial wars are excluded.</p>`;
        }
    }
    if (raidHost) {
        const summaries = summarizeRaids(raids);
        if (!summaries.length) {
            raidHost.innerHTML = '<p class="text-sm text-gray-500">No raid snapshots are archived.</p>';
        } else {
            const used = summaries.reduce((sum, raid) => sum + raid.attacksUsed, 0);
            const possible = summaries.reduce((sum, raid) => sum + raid.attacksPossible, 0);
            const destroyed = summaries.reduce((sum, raid) => sum + raid.districtsDestroyed, 0);
            const loot = summaries.reduce((sum, raid) => sum + raid.totalLoot, 0);
            raidHost.innerHTML = `<div class="warraid-stats">${stat('Raid weekends', fmt(summaries.length), `${fmt(summaries[0].participants)} participants in the newest snapshot`)}${stat('Attack completion', possible ? pct(used / possible) : '—', `${fmt(used)} of ${fmt(possible)} attacks for listed participants`)}${stat('Districts per attack', used ? (destroyed / used).toFixed(2) : '—', `${fmt(destroyed)} districts across archived raids`)}${stat('Capital gold looted', fmt(loot), 'Sum of archived raid-season snapshots')}</div><p class="text-xs text-gray-500 mt-2">Raid snapshots use API totals; available attacks count only members listed as participants.</p>`;
        }
    }
}
