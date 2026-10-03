"""Refresh only the league group inside data/meta.json.

The daily meta_scraper also fetches goldpass, country rank and the league group.
Country rank alone can walk a thousand ranking rows, and none of that moves on
battle day. So the league group — the only meta block that changes during a
season — gets its own 15-minute job, and this script writes nothing but that
one key.

Writing the whole file is not an option: a run holding yesterday's view of
goldpass and countryRank would overwrite fresher values committed by the daily
job in the meantime. So meta.json is read, one key is replaced, and the write
happens only if that key actually differs — which also keeps the 15-minute job
from minting an empty commit every tick.
"""

import json
import os
from datetime import datetime

import http_client
from config import BASE_URL, CLAN_TAG, HEADERS

from meta_scraper import fetch_cwl

META_PATH = 'data/meta.json'


def _get(url):
    return http_client.get(url, HEADERS)


def update_cwl():
    meta = {}
    if os.path.exists(META_PATH):
        with open(META_PATH, 'r') as f:
            try:
                meta = json.load(f)
            except json.JSONDecodeError:
                # A corrupt file must not be silently preserved: rebuild rather
                # than carry on top of unreadable JSON.
                print("meta.json is unreadable; rebuilding from the league lookup.")
                meta = {}

    before = meta.get('cwl')
    fetch_cwl(meta)
    if meta.get('cwl') == before:
        print("No change to league group; leaving meta.json untouched.")
        return

    meta['fetchedAt'] = datetime.utcnow().isoformat() + 'Z'
    os.makedirs('data', exist_ok=True)
    with open(META_PATH, 'w') as f:
        json.dump(meta, f, indent=4)
    state = (meta.get('cwl') or {}).get('state')
    print(f"Updated {META_PATH}: cwl state={state!r}")


if __name__ == "__main__":
    update_cwl()