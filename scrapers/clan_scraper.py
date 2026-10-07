import json
import os
from datetime import datetime, timezone
import http_client
from config import BASE_URL, CLAN_TAG, HEADERS

def update_clan_data():
    os.makedirs('data/clan_stats', exist_ok=True)
    url = f"{BASE_URL}/clans/{CLAN_TAG}"
    res = http_client.get(url, HEADERS)

    # Fail loudly, like war_scraper and raid_scraper do. A silent print left the
    # run green, so a dead token or a bad clan tag produced a passing workflow
    # and no snapshot — only the 24h watchdog noticed, a day later. The daily
    # clan snapshot is the one writer that fires in a quiet window, so losing it
    # also means data/ goes untouched entirely.
    if res.status_code != 200:
        raise SystemExit(f"Failed to fetch clan data: HTTP {res.status_code} {res.text[:200]}")

    clan_data = res.json()

    # 1. Save daily snapshot. Use UTC so the filename matches notify.py and
    # the daily cron — a local-time filename at 23:30 local in a UTC-7 zone
    # would land on the next calendar day in GitHub Actions.
    today = datetime.now(timezone.utc).strftime('%Y%m%d')
    filename = f"members_{today}.json"
    snapshot_path = os.path.join('data/clan_stats', filename)

    with open(snapshot_path, 'w') as f:
        json.dump(clan_data, f, indent=4)
    print(f"Saved snapshot to {snapshot_path}")

    # 2. Update clan_stats_index.json
    index_path = 'data/clan_stats_index.json'
    index = []
    if os.path.exists(index_path):
        with open(index_path, 'r') as f:
            try:
                index = json.load(f)
            except json.JSONDecodeError:
                index = []

    if filename not in index:
        index.append(filename)
        index.sort(reverse=True) # Newest first
        with open(index_path, 'w') as f:
            json.dump(index, f, indent=4)
        print(f"Added {filename} to clan stats index.")

if __name__ == "__main__":
    update_clan_data()
