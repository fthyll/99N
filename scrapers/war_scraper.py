import requests
import json
import os
from config import BASE_URL, CLAN_TAG, HEADERS

# Only these states carry per-player attack data worth archiving.
# 'preparation' = 0 attacks (would pollute history as a fake draw),
# 'notInWar'    = nothing to save.
SAVABLE_STATES = ("inWar", "warEnded")


def update_war_data():
    os.makedirs('data/war_stats', exist_ok=True)
    url = f"{BASE_URL}/clans/{CLAN_TAG}/currentwar"
    res = requests.get(url, headers=HEADERS)
    if res.status_code == 404 and res.json().get("reason") == "notInWar":
        print("Clan is not in war; nothing to update.")
        return
    if res.status_code != 200:
        # Fail loudly so the Actions run goes red instead of silently no-oping.
        raise SystemExit(f"Failed to fetch war data: HTTP {res.status_code} {res.text[:200]}")

    war_data = res.json()
    state = war_data.get("state")
    if state not in SAVABLE_STATES:
        print(f"Skipping war snapshot: state={state!r} is not archivable.")
        return

    filename = f"war_{war_data['startTime']}.json"
    file_path = f'data/war_stats/{filename}'

    # The live war is re-fetched every 15 minutes. Once it ends the payload stops
    # changing, so an unchanged write would only produce an empty git commit.
    new_payload = json.dumps(war_data, indent=4)
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            if f.read() == new_payload:
                print(f"No change to {filename}; leaving data untouched.")
                return
    with open(file_path, 'w') as f:
        f.write(new_payload)

    index_path = 'data/war_stats_index.json'
    index = []
    if os.path.exists(index_path):
        with open(index_path, 'r') as f:
            try:
                index = json.load(f)
            except json.JSONDecodeError:
                index = []

    if filename not in index:
        index.append(filename)
        index.sort()  # oldest first; app.js .reverse()s it
        with open(index_path, 'w') as f:
            json.dump(index, f, indent=4)
        print(f"Added {filename} to war stats index.")
    else:
        print(f"Updated {filename} (state={state}).")


if __name__ == "__main__":
    update_war_data()
