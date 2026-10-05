import json
import os
from datetime import datetime
import http_client
from config import BASE_URL, CLAN_TAG, HEADERS, RAW_TAG

# One small "meta" file with slow-changing context the frontend cannot derive
# from the snapshots themselves:
#  - goldpass season window (for a countdown card)
#  - clan position in its country's trophy ranking (paginated top-1000)
#  - CWL league group, when 99N is in a season
# Each block fails independently; partial meta beats no meta.


def _get(url):
    return http_client.get(url, HEADERS)


def fetch_goldpass(meta):
    res = _get(f"{BASE_URL}/goldpass/seasons/current")
    if res.status_code == 200:
        meta['goldpass'] = res.json()


def fetch_country_rank(meta):
    res = _get(f"{BASE_URL}/clans/{CLAN_TAG}")
    if res.status_code != 200:
        return
    clan = res.json()
    loc = clan.get('location') or {}
    loc_id = loc.get('id')
    if not loc_id:
        return
    rank = None
    total = 0
    after = None
    while True:
        url = f"{BASE_URL}/locations/{loc_id}/rankings/clans?limit=200"
        if after:
            url += f"&after={after}"
        rr = _get(url)
        if rr.status_code != 200:
            break
        page = rr.json()
        items = page.get('items', [])
        total += len(items)
        for i, c in enumerate(items):
            if c.get('tag') == RAW_TAG:
                rank = total - len(items) + i + 1
                break
        if rank is not None:
            break
        after = page.get('paging', {}).get('after')
        if not after or total >= 1000:
            break
    meta['countryRank'] = {
        'locationId': loc_id,
        'locationName': loc.get('name'),
        'rank': rank,               # None = outside the visible ranking
        'scanned': total,
        'trophies': clan.get('type') and clan.get('requiredTrophies'),
        'warLeague': clan.get('warLeague'),
        'capitalLeague': clan.get('capitalLeague'),
    }


def fetch_cwl(meta):
    """Current war league group plus the league table, if 99N is in a season.

    The endpoint is /clans/{tag}/currentwar/leaguegroup. It returns state,
    season, the clans in the group (name, tag, level, badge, member THs) and
    rounds[].warTags — but no scores: standings have to be derived by fetching
    each finished war. Outside a season the endpoint 404s, which is normal.

    This used to call /cwl/{tag}, which does not exist, so every request 404'd
    and meta.json has always carried "cwl": null.

    A 404 is the *only* expected non-200, and it is recorded as a state rather
    than a bare null: a null cannot tell "not in a season" apart from "the
    endpoint broke again", which is precisely how the dead /cwl/ call went
    unnoticed. Any other status is kept in the file so the frontend can say the
    league lookup failed instead of claiming the clan is out of season.
    """
    res = _get(f"{BASE_URL}/clans/{CLAN_TAG}/currentwar/leaguegroup")
    if res.status_code == 404:
        meta['cwl'] = {'state': 'notInSeason'}
        return
    if res.status_code != 200:
        # A held group is a *stale but real* view of a season that is, very
        # likely, still in progress. Overwriting it with "unavailable" made
        # one 500 from the proxy erase a live league table; the next 15-minute
        # run might not be the one that restores it. Keep the last good group
        # and record the error beside it, so the panel can show the table with
        # a visible warning instead of a dead end.
        previous = meta.get('cwl') or {}
        if previous.get('standings'):
            meta['cwl'] = {
                **previous,
                'stale': True,
                'error': f"last refresh failed: HTTP {res.status_code}",
            }
            print(f"WARNING league group lookup failed: HTTP {res.status_code} "
                  f"{res.text[:200]}; holding the last {len(previous['standings'])}-row table.")
            return
        meta['cwl'] = {'state': 'unavailable', 'httpStatus': res.status_code}
        print(f"WARNING league group lookup failed: HTTP {res.status_code} "
              f"{res.text[:200]}")
        return
    group = res.json() or {}
    meta['cwl'] = {
        'state': group.get('state'),
        'season': group.get('season'),
        'standings': _league_standings(group),
    }


def _league_standings(group):
    """One row per clan: wins/losses/draws and stars, from the finished wars.

    Every clan sees the same war from its own side, so a war is counted once
    per clan by reading the result from that clan's perspective rather than
    counting war tags globally.
    """
    teams = {c.get('tag'): c for c in (group.get('clans') or []) if c.get('tag')}
    rows = {tag: _empty_row(c) for tag, c in teams.items()}

    for war_tag in _war_tags(group):
        war = _get(f"{BASE_URL}/clanwarleagues/wars/{war_tag}")
        if war.status_code != 200:
            continue  # a round that never happened; the table stands as-is
        war = war.json() or {}
        if war.get('state') != 'warEnded':
            continue  # partial score, not a result
        # A war resolves to exactly one outcome for each side: a true tie is
        # counted as a draw only, never win+draw together (which would
        # inflate points via wins*3 + draws).
        clan_stars, clan_dest = _tally(war, 'clan')
        opp_stars, opp_dest = _tally(war, 'opponent')
        clan_outcome = _outcome(clan_stars, clan_dest, opp_stars, opp_dest)
        opp_outcome = {'win': 'loss', 'loss': 'win', 'draw': 'draw'}[clan_outcome]
        sides = (
            ('clan', clan_outcome, clan_stars, clan_dest),
            ('opponent', opp_outcome, opp_stars, opp_dest),
        )
        for side, outcome, stars, _dest in sides:
            row = rows.get((war.get(side) or {}).get('tag'))
            if row is None:
                continue
            row['stars'] += stars
            row[{'win': 'wins', 'loss': 'losses', 'draw': 'draws'}[outcome]] += 1
    return _ranked(rows)


def _empty_row(clan):
    return {
        'tag': clan.get('tag'),
        'name': clan.get('name') or '',
        'clanLevel': clan.get('clanLevel'),
        'badgeUrls': clan.get('badgeUrls') or {},
        'townHallLevels': sorted({m.get('townHallLevel') for m in (clan.get('members') or [])
                                  if m.get('townHallLevel')}, reverse=True),
        'wins': 0, 'losses': 0, 'draws': 0, 'stars': 0,
    }


def _war_tags(group):
    return [t for r in (group.get('rounds') or []) for t in (r.get('warTags') or [])]


def _tally(war, side):
    entry = war.get(side) or {}
    return entry.get('stars') or 0, entry.get('destructionPercentage') or 0


def _lost(side, war):
    """A side lost unless it also won: a war resolved on stars, else on destruction."""
    my_stars, my_dest = _tally(war, side)
    opp_stars, opp_dest = _tally(war, 'opponent' if side == 'clan' else 'clan')
    return _outcome(my_stars, my_dest, opp_stars, opp_dest) == 'loss'


def _drawn(war):
    return _outcome(*_tally(war, 'clan'), *_tally(war, 'opponent')) == 'draw'


def _outcome(clan_stars, clan_dest, opp_stars, opp_dest):
    if clan_stars != opp_stars:
        return 'win' if clan_stars > opp_stars else 'loss'
    if clan_dest != opp_dest:
        return 'win' if clan_dest > opp_dest else 'loss'
    return 'draw'


def _ranked(rows):
    """Sorted like a league table: points first, then stars, then name."""
    ordered = sorted(rows.values(),
                     key=lambda r: (-(r['wins'] * 3 + r['draws']), -r['stars'], r['name']))
    for i, row in enumerate(ordered, start=1):
        row['position'] = i
    return ordered


def update_meta():
    os.makedirs('data', exist_ok=True)
    meta = {'fetchedAt': datetime.utcnow().isoformat() + 'Z'}
    fetch_goldpass(meta)
    fetch_country_rank(meta)
    fetch_cwl(meta)

    path = 'data/meta.json'
    new_payload = json.dumps(meta, indent=4)
    if os.path.exists(path):
        with open(path, 'r') as f:
            if f.read() == new_payload:
                print("No change to meta; leaving data untouched.")
                return
    with open(path, 'w') as f:
        f.write(new_payload)
    print("Updated data/meta.json:",
          'goldpass' in meta, 'countryRank' in meta, 'cwl=', bool(meta.get('cwl')))


if __name__ == "__main__":
    update_meta()
