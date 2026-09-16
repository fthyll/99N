import requests
import json
import os
from datetime import datetime
from config import BASE_URL, CLAN_TAG, HEADERS, RAW_TAG

# One small "meta" file with slow-changing context the frontend cannot derive
# from the snapshots themselves:
#  - goldpass season window (for a countdown card)
#  - clan position in its country's trophy ranking (paginated top-1000)
#  - CWL league group, when 99N is in a season
# Each block fails independently; partial meta beats no meta.


def _get(url):
    return requests.get(url, headers=HEADERS, timeout=30)


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
    """Current war league group, if any. 404 outside season is normal.
    Cap the member scan: in a live season the first member almost always
    carries the tag; outside one we do not want 50 wasted requests."""
    meta['cwl'] = None
    res = _get(f"{BASE_URL}/clans/{CLAN_TAG}/members?limit=5")
    if res.status_code != 200:
        return
    group = None
    for m in res.json().get('items', []):
        pr = _get(f"{BASE_URL}/players/{m['tag'].replace('#', '%23')}")
        if pr.status_code == 200 and pr.json().get('currentLeagueGroupTag'):
            group = pr.json()['currentLeagueGroupTag']
            break
    if not group:
        return
    gr = _get(f"{BASE_URL}/cwl/{group.replace('#', '%23')}")
    meta['cwl'] = gr.json() if gr.status_code == 200 else None


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
