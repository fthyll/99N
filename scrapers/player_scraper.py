import json
import os
import time
from datetime import datetime, timezone

import http_client
from config import BASE_URL, CLAN_TAG, HEADERS

CAREER_FIELDS = (
    "tag", "name", "townHallLevel", "expLevel", "trophies", "bestTrophies",
    "warStars", "attackWins", "defenseWins", "builderBaseTrophies",
    "bestBuilderBaseTrophies", "donations", "donationsReceived",
    "clanCapitalContributions", "role", "currentLeagueGroupTag",
)
PROFILE_FIELDS = (
    "tag", "name", "clan", "league", "leagueTier", "builderBaseLeague",
    "role", "warPreference", "expLevel", "townHallLevel", "townHallWeaponLevel",
    "legendStatistics", "troops", "heroes", "heroEquipment", "spells",
    "labels", "achievements", "playerHouse", "currentLeagueGroupTag",
    "currentLeagueSeasonId", "previousLeagueGroupTag", "previousLeagueSeasonId",
    "attackWins", "defenseWins", "trophies", "bestTrophies", "warStars",
    "builderHallLevel", "builderBaseTrophies", "bestBuilderBaseTrophies",
    "donations", "donationsReceived", "clanCapitalContributions",
)
TREND_FIELDS = (
    "trophies", "donations", "warStars", "clanCapitalContributions",
    "builderBaseTrophies", "townHallLevel",
)


def _get(url):
    return http_client.get(url, HEADERS)


def _read_json(path, fallback):
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return fallback


def _atomic_json(path, payload, indent=None):
    temp_path = path + '.tmp'
    with open(temp_path, 'w') as f:
        json.dump(payload, f, indent=indent, separators=None if indent else (',', ':'))
    os.replace(temp_path, path)


def _atomic_text(path, payload):
    temp_path = path + '.tmp'
    with open(temp_path, 'w') as f:
        f.write(payload)
    os.replace(temp_path, path)


def _items(payload):
    if isinstance(payload, list):
        return payload
    return payload.get('items', []) if isinstance(payload, dict) else []


def _load_previous():
    index = _read_json('data/player_stats_index.json', [])
    previous_careers = {}
    if index:
        newest = _read_json(os.path.join('data/player_stats', index[0]), {})
        previous_careers = newest.get('players', {}) if isinstance(newest, dict) else {}
    old_profiles = _read_json('data/player_profiles.json', {})
    return index, previous_careers, old_profiles.get('players', {}) if isinstance(old_profiles, dict) else {}


def build_player_trends(index, root='data/player_stats'):
    trends = {}
    for filename in sorted(index):
        snapshot = _read_json(os.path.join(root, filename), {})
        date = filename.removeprefix('players_').removesuffix('.json')
        for tag, player in (snapshot.get('players') or {}).items():
            point = {'date': f"{date[:4]}-{date[4:6]}-{date[6:8]}"}
            point.update({field: player.get(field) for field in TREND_FIELDS})
            trends.setdefault(tag, []).append(point)
    return trends


def update_player_careers():
    os.makedirs('data/player_stats', exist_ok=True)
    os.makedirs('data', exist_ok=True)

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
        tags.extend(m['tag'] for m in data.get('items', []))
        after = data.get('paging', {}).get('after')
        if not after:
            break

    index, previous_careers, previous_profiles = _load_previous()
    requests_made = 0

    def paced_get(url):
        nonlocal requests_made
        response = _get(url)
        requests_made += 1
        if requests_made % 8 == 0:
            time.sleep(1)
        return response

    players, profiles = {}, {}
    held_profiles = optional_failures = 0
    for tag in tags:
        encoded_tag = tag.replace('#', '%23')
        player_response = paced_get(f"{BASE_URL}/players/{encoded_tag}")
        old_career = previous_careers.get(tag)
        old_profile = previous_profiles.get(tag)
        if player_response.status_code != 200:
            if not old_career or not old_profile:
                raise SystemExit(f"Required profile request failed for {tag}: HTTP {player_response.status_code}; no complete last-known snapshot. Nothing published.")
            players[tag] = old_career
            profiles[tag] = {**old_profile, 'stale': True}
            held_profiles += 1
            continue
        player = player_response.json()
        career = {field: player.get(field) for field in CAREER_FIELDS}
        profile = {field: player.get(field) for field in PROFILE_FIELDS}
        profile['profileArchiveAvailable'] = True
        battle_response = paced_get(f"{BASE_URL}/players/{encoded_tag}/battlelog")
        league_response = paced_get(f"{BASE_URL}/players/{encoded_tag}/leaguehistory")
        for key, response in [('battleLog', battle_response), ('leagueHistory', league_response)]:
            available_key = key + 'Available'
            stale_key = key + 'Stale'
            if response.status_code == 200:
                profile[key] = _items(response.json())
                profile[available_key], profile[stale_key] = True, False
            else:
                profile[key] = old_profile.get(key)
                profile[available_key] = old_profile.get(available_key, False)
                profile[stale_key] = bool(old_profile.get(available_key, False))
                optional_failures += 1
        players[tag], profiles[tag] = career, profile

    if not players:
        raise SystemExit("No player data fetched; preserving existing snapshots.")

    now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    filename = f"players_{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    payload = json.dumps({'fetchedAt': now, 'players': players}, indent=4)
    snapshot_path = os.path.join('data/player_stats', filename)
    _atomic_text(snapshot_path, payload)
    if filename not in index:
        index.append(filename)
        index.sort(reverse=True)
        _atomic_json('data/player_stats_index.json', index, indent=4)

    # Publish auxiliary snapshots only after every required player has a good
    # response or a last-known complete snapshot.
    _atomic_json('data/player_profiles.json', {'fetchedAt': now, 'players': profiles}, indent=4)
    trends = build_player_trends(index)
    _atomic_json('data/player_trends.json', {'fetchedAt': now, 'players': trends})
    print(f"Saved career stats for {len(players)} players -> {filename}")
    print(f"Saved {sum(map(len, trends.values()))} archived trend points.")
    if held_profiles:
        print(f"WARN: held last-known profiles for {held_profiles} player(s).")
    if optional_failures:
        print(f"WARN: optional battle-log or league-history request failed {optional_failures} time(s).")


if __name__ == "__main__":
    update_player_careers()
