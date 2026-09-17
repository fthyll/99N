import json
import os
import http_client
from config import BASE_URL, CLAN_TAG, HEADERS

# warlog returns the clan's finished wars (max 50) with results but WITHOUT
# per-player attack data — that only lives on /currentwar while a war is live.
# Archiving it gives the dashboard war history from day one instead of waiting
# for currentwar snapshots to accumulate.

def update_war_log():
    os.makedirs('data/warlog_stats', exist_ok=True)
    url = f"{BASE_URL}/clans/{CLAN_TAG}/warlog?limit=50"
    res = http_client.get(url, HEADERS)
    if res.status_code != 200:
        raise SystemExit(f"Failed to fetch war log: HTTP {res.status_code} {res.text[:200]}")

    payload = json.dumps(res.json(), indent=4)
    path = 'data/warlog_stats/warlog.json'
    if os.path.exists(path):
        with open(path, 'r') as f:
            if f.read() == payload:
                print("No change to war log; leaving data untouched.")
                return
    with open(path, 'w') as f:
        f.write(payload)
    print(f"Updated war log ({len(res.json().get('items', []))} wars).")

if __name__ == "__main__":
    update_war_log()
