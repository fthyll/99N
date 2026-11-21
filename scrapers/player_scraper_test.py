"""Run with: python3 scrapers/player_scraper_test.py"""
import json
import os
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault('COC_API_TOKEN', 'test-token-not-used')
os.environ.setdefault('CLAN_TAG', '#2J0YP2LQL')
import player_scraper


class Response:
    def __init__(self, status, payload):
        self.status_code = status
        self.payload = payload
        self.text = json.dumps(payload)

    def json(self):
        return self.payload


state = {
    'log_status': 200,
    'player_status': 200,
    'new_player_status': 200,
    'trophies': 4321,
    'tags': ['#PLAYER1'],
}


def fake_get(url):
    if '/members?' in url:
        return Response(200, {'items': [{'tag': tag} for tag in state['tags']]})
    if '/players/%23NEW' in url and '/battlelog' not in url and '/leaguehistory' not in url:
        status = state['new_player_status']
        payload = {'tag': '#NEW', 'name': 'New', 'townHallLevel': 10, 'trophies': 100}
        return Response(status, payload if status == 200 else {'reason': 'unavailable'})
    if '/battlelog' in url:
        payload = [{'battleType': 'HOME_VILLAGE', 'attack': True, 'stars': 3}]
        return Response(state['log_status'], payload if state['log_status'] == 200 else {'reason': 'accessDenied'})
    if '/leaguehistory' in url:
        payload = [{'leagueSeasonId': '2026-10', 'leagueTrophies': 5000}]
        return Response(state['log_status'], payload if state['log_status'] == 200 else {'reason': 'accessDenied'})
    if '/players/' in url:
        payload = {'tag': '#PLAYER1', 'name': 'Test', 'townHallLevel': 18,
                   'trophies': state['trophies'], 'warPreference': 'in'}
        return Response(state['player_status'], payload if state['player_status'] == 200 else {'reason': 'unavailable'})
    raise AssertionError(f'Unexpected API URL: {url}')


old_get, old_cwd = player_scraper._get, os.getcwd()
try:
    with tempfile.TemporaryDirectory() as temp:
        os.chdir(temp)
        player_scraper._get = fake_get
        player_scraper.update_player_careers()
        profiles_path = pathlib.Path('data/player_profiles.json')
        first = json.loads(profiles_path.read_text())['players']['#PLAYER1']
        assert first['battleLog'][0]['stars'] == 3
        assert first['leagueHistory'][0]['leagueTrophies'] == 5000

        state.update(log_status=403, trophies=4400)
        player_scraper.update_player_careers()
        held = json.loads(profiles_path.read_text())['players']['#PLAYER1']
        assert held['trophies'] == 4400
        assert held['battleLog'][0]['stars'] == 3
        assert held['leagueHistory'][0]['leagueTrophies'] == 5000
        assert held['battleLogStale'] is True
        assert held['leagueHistoryStale'] is True

        snapshot_index = pathlib.Path('data/player_stats_index.json')
        index_before = snapshot_index.read_bytes()
        snapshot = pathlib.Path('data/player_stats') / json.loads(index_before)[0]
        snapshot_before = snapshot.read_bytes()
        profiles_before = profiles_path.read_bytes()
        state.update(tags=['#PLAYER1', '#NEW'], player_status=503, new_player_status=503)
        try:
            player_scraper.update_player_careers()
        except SystemExit:
            pass
        else:
            raise AssertionError('new required profile failure must stop before publishing partial snapshots')
        assert profiles_path.read_bytes() == profiles_before
        assert snapshot_index.read_bytes() == index_before
        assert snapshot.read_bytes() == snapshot_before

        pathlib.Path('fixtures').mkdir()
        for filename, player in [
            ('players_20260101.json', {'trophies': 100, 'warStars': 8}),
            ('players_20260102.json', {'trophies': 120, 'warStars': 10}),
        ]:
            (pathlib.Path('fixtures') / filename).write_text(json.dumps({'players': {'#A': player}}))
        trends = player_scraper.build_player_trends(['players_20260101.json', 'players_20260102.json'], root='fixtures')
        assert trends['#A'][0]['trophies'] == 100
        assert trends['#A'][1]['warStars'] == 10
        print('PASS: archived profile logs survive endpoint failures; new required profile failure publishes no partial snapshots')
finally:
    player_scraper._get = old_get
    os.chdir(old_cwd)
