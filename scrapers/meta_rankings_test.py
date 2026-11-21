"""Run with: python3 scrapers/meta_rankings_test.py"""
import json
import os
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
os.environ.setdefault('COC_API_TOKEN', 'test-token-not-used')
os.environ.setdefault('CLAN_TAG', '#2J0YP2LQL')
import meta_scraper


class Response:
    def __init__(self, status, payload):
        self.status_code = status
        self.payload = payload
    def json(self):
        return self.payload


old_get, old_cwd = meta_scraper._get, os.getcwd()
try:
    with tempfile.TemporaryDirectory() as temp:
        os.chdir(temp)
        pathlib.Path('data').mkdir()
        previous = {'rankings': {
            'players': {'global': {'items': [{'name': 'old-player'}], 'fetchedAt': 'old'}},
            'builderBasePlayers': {'global': {'items': [{'name': 'last-good'}], 'fetchedAt': 'old'}},
            'capitalClans': {'global': {'items': [{'name': 'old-capital'}], 'fetchedAt': 'old'}},
            'clans': {
                'global': {'items': [{'name': 'old-clan'}], 'fetchedAt': 'old'},
                'clanLocation': {'items': [{'name': 'old-local-clan'}], 'fetchedAt': 'old'},
            },
        }}
        pathlib.Path('data/rankings.json').write_text(json.dumps(previous))
        def partial_get(url):
            endpoint = url.split('/rankings/')[-1].split('?')[0]
            if endpoint in ('players', 'clans-builder-base'):
                return Response(200, {'items': [{'name': endpoint, 'rank': 1, 'previousRank': 2}]})
            return Response(403, {'reason': 'accessDenied'})
        meta_scraper._get = partial_get
        meta_scraper.fetch_rankings({'countryRank': {'locationId': 1, 'locationName': 'Test'}})
        saved = json.loads(pathlib.Path('data/rankings.json').read_text())['rankings']
        assert saved['players']['global']['items'][0]['name'] == 'players'
        assert saved['players']['clanLocation']['items'][0]['rank'] == 1
        assert saved['clans']['global']['items'][0]['name'] == 'old-clan'
        assert saved['clans']['global']['stale'] is True
        assert saved['builderBaseClans']['global']['items'][0]['name'] == 'clans-builder-base'
        assert saved['builderBasePlayers']['global']['items'][0]['name'] == 'last-good'
        assert saved['builderBasePlayers']['global']['stale'] is True
        assert saved['clans']['clanLocation']['items'][0]['name'] == 'old-local-clan'
        assert saved['clans']['clanLocation']['stale'] is True
        assert saved['builderBaseClans']['clanLocation']['items'][0]['rank'] == 1
        assert saved['capitalClans']['global']['stale'] is True
        assert saved['capitalClans']['global']['items'][0]['name'] == 'old-capital'
        assert 'clanLocation' not in saved['capitalClans'] or saved['capitalClans']['clanLocation']['stale'] is True
        print('PASS: ranking fetch keeps last-known category/scope on failure and refreshes successful scopes')
finally:
    meta_scraper._get = old_get
    os.chdir(old_cwd)
