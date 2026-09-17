import json
import os
from datetime import datetime
import http_client
from config import BASE_URL, CLAN_TAG, HEADERS, RAW_TAG

# Career stats per member. The clan payload only has current trophies and
# weekly donations; /players/{tag} adds lifetime warStars, best trophies,
# capital contributions, attack/defense wins. 50 requests, once a day.

CAREER_FIELDS = (
    "tag", "name", "townHallLevel", "expLevel", "trophies", "bestTrophies",
    "warStars", "attackWins", "defenseWins", "builderBaseTrophies",
    "bestBuilderBaseTrophies", "donations", "donationsReceived",
    "clanCapitalContributions", "role", "currentLeagueGroupTag",
)


def _get(url):
    # 50 sequential requests a day: without retries one transient 429 in the
    # middle would discard the whole roster fetch.
    return http_client.get(url, HEADERS)


def update_player_careers():
    os.makedirs('data/player_stats', exist_ok=True)

    # Roster via members endpoint (paginated, lighter than full clan payload).
    tags = []
    after = None
    while True:
        url = f"{BASE_URL}/clans/{CLAN_TAG}/members?limit=100"
        if after:
            url += f"&after={after}"
        res = _get(url)
        if res.status_code != 200:
            raise SystemExit(f"Failed to fetch members: HTTP {res.status_code} {res.text[:200]}")
        data = res.json()
        tags += [m['tag'] for m in data.get('items', [])]
        after = data.get('paging', {}).get('after')
        if not after:
            break

    players = {}
    for i, tag in enumerate(tags):
        res = _get(f"{BASE_URL}/players/{tag.replace('#', '%23')}")
        if res.status_code != 200:
            print(f"WARN {tag}: HTTP {res.status_code}, skipping")
            continue
        p = res.json()
        players[tag] = {k: p.get(k) for k in CAREER_FIELDS}
        # Be polite to the 10 req/s limit even though we are far under it.
        if i % 8 == 7:
            import time; time.sleep(1)

    if not players:
        raise SystemExit("No player data fetched; aborting so we do not overwrite a good file with an empty one.")

    today = datetime.now().strftime('%Y%m%d')
    filename = f"players_{today}.json"
    payload = json.dumps({'fetchedAt': datetime.utcnow().isoformat() + 'Z', 'players': players}, indent=4)
    path = os.path.join('data/player_stats', filename)
    if os.path.exists(path):
        with open(path, 'r') as f:
            if f.read() == payload:
                print("No change to player careers; leaving data untouched.")
                return
    with open(path, 'w') as f:
        f.write(payload)

    index_path = 'data/player_stats_index.json'
    index = []
    if os.path.exists(index_path):
        with open(index_path, 'r') as f:
            try:
                index = json.load(f)
            except json.JSONDecodeError:
                index = []
    if filename not in index:
        index.append(filename)
        index.sort(reverse=True)  # newest first, like clan_stats_index
        with open(index_path, 'w') as f:
            json.dump(index, f, indent=4)
    print(f"Saved career stats for {len(players)} players -> {filename}")


if __name__ == "__main__":
    update_player_careers()
