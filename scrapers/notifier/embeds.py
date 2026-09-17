"""Discord embed builders — one function per notification type.

Kept free of network and filesystem access so the shapes can be unit-tested and
reused by the manual broadcast page (which posts the same JSON through the
browser). Colours are decimal RGB.
"""

GOLD = 0xF5B942
GREEN = 0x3BA55D
RED = 0xED4245
BLUE = 0x5865F2
GREY = 0x95A5A6


def _date(coc_time):
    """'20260916T041524.000Z' -> '2026-09-16 04:15 UTC'"""
    if not coc_time or len(coc_time) < 13:
        return coc_time or '—'
    return f"{coc_time[0:4]}-{coc_time[4:6]}-{coc_time[6:8]} {coc_time[9:11]}:{coc_time[11:13]} UTC"


def war_preview(war):
    clan = war.get('clan', {})
    opp = war.get('opponent', {})
    return {
        'title': f"⚔️ War preparation — {clan.get('name', 'Clan')} vs {opp.get('name', '?')}",
        'description': f"**{war.get('teamSize', '?')}v{war.get('teamSize', '?')}** · "
                       f"{war.get('attacksPerMember', 2)} attacks each\n"
                       f"Battle day starts **{_date(war.get('startTime'))}**",
        'color': BLUE,
        'fields': [
            {'name': 'Opponent', 'value': f"{opp.get('name', '?')} (Lv {opp.get('clanLevel', '?')})", 'inline': True},
            {'name': 'Attacks/member', 'value': str(war.get('attacksPerMember', 2)), 'inline': True},
            {'name': 'Battle modifier', 'value': str(war.get('battleModifier', 'none')).title(), 'inline': True},
        ],
        'footer': {'text': '99N War Room · preparation'},
    }


def war_result(war):
    clan = war.get('clan', {})
    opp = war.get('opponent', {})
    cs, os_ = clan.get('stars', 0), opp.get('stars', 0)
    cd, od = clan.get('destructionPercentage', 0), opp.get('destructionPercentage', 0)
    if cs > os_ or (cs == os_ and cd > od):
        label, color = 'VICTORY', GREEN
    elif cs < os_ or (cs == os_ and cd < od):
        label, color = 'DEFEAT', RED
    else:
        label, color = 'DRAW', GREY
    return {
        'title': f"{'🏆' if label == 'VICTORY' else '💀' if label == 'DEFEAT' else '🤝'} {label} — "
                 f"{cs}–{os_} stars",
        'description': f"**{clan.get('name', 'Clan')}** vs **{opp.get('name', '?')}**\n"
                       f"Destruction {cd:.1f}% vs {od:.1f}%\n"
                       f"Attacks used {clan.get('attacks', 0)} vs {opp.get('attacks', 0)}"
                       f" of {war.get('teamSize', 0) * war.get('attacksPerMember', 2)}",
        'color': color,
        'footer': {'text': f"99N War Room · ended {_date(war.get('endTime'))}"},
    }


def raid_start(raid):
    return {
        'title': '🏰 Raid weekend started',
        'description': f"Capitol raid weekend began **{_date(raid.get('startTime'))}**.\n"
                       f"Ends **{_date(raid.get('endTime'))}** — go raid!",
        'color': GOLD,
        'footer': {'text': '99N War Room · capital raids'},
    }


def raid_summary(raid):
    members = raid.get('members', [])
    top = sorted(members, key=lambda m: m.get('capitalResourcesLooted') or 0, reverse=True)[:3]
    top_txt = '\n'.join(
        f"{i + 1}. **{m.get('name', '?')}** — {m.get('capitalResourcesLooted', 0):,} loot, "
        f"{m.get('attacks', 0)} atk"
        for i, m in enumerate(top)) or '—'
    return {
        'title': '🏁 Raid weekend finished',
        'description': f"**{raid.get('capitalTotalLoot', 0):,}** capital gold looted · "
                       f"{raid.get('enemyDistrictsDestroyed', 0)} districts destroyed\n"
                       f"{raid.get('totalAttacks', 0)} attacks · {raid.get('raidsCompleted', 0)} raids completed",
        'color': GOLD,
        'fields': [
            {'name': 'Top looters', 'value': top_txt, 'inline': False},
            {'name': 'Offensive reward', 'value': f"{raid.get('offensiveReward', 0)}", 'inline': True},
            {'name': 'Defensive reward', 'value': f"{raid.get('defensiveReward', 0)}", 'inline': True},
        ],
        'footer': {'text': f"99N War Room · weekend {_date(raid.get('startTime'))}"},
    }


def membership_change(joined, left, total):
    lines = []
    if joined:
        lines.append('**Joined:** ' + ', '.join(joined))
    if left:
        lines.append('**Left:** ' + ', '.join(left))
    return {
        'title': '👥 Roster changed',
        'description': '\n'.join(lines) + f"\nNow **{total}/50** members.",
        'color': BLUE,
        'footer': {'text': '99N War Room · membership'},
    }


def donation_week(prev_totals, totals, top):
    delta = totals['donations'] - (prev_totals.get('total') or 0)
    top_txt = '\n'.join(
        f"{i + 1}. **{m.get('name', '?')}** — {m.get('donations', 0):,}"
        for i, m in enumerate(top)) or '—'
    return {
        'title': '🎁 Weekly donations reset',
        'description': f"Last week the clan donated **{prev_totals.get('total', 0):,}** "
                       f"(received {prev_totals.get('received', 0):,}).\n"
                       f"The counters have reset — a new week starts now "
                       f"({delta:+,} vs last close).",
        'color': GREEN,
        'fields': [{'name': 'Early leaders', 'value': top_txt, 'inline': False}],
        'footer': {'text': '99N War Room · donations'},
    }
