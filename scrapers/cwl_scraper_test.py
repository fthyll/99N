"""Tests for scrapers/cwl_scraper.py — the 15-minute league-group writer.

Run: python3 scrapers/cwl_scraper_test.py

The hazard this guards is overwriting fresher data: the daily job writes
goldpass and countryRank into the same meta.json, so a 15-minute run that
rewrote the whole file from its own older view of those keys would roll them
back. The script must touch the league group only.
"""

import io
import json
import os
import sys
import tempfile
from contextlib import redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cwl_scraper
import meta_scraper

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("PASS  " if cond else "FAIL  ") + name + (("   [" + detail + "]") if (detail and not cond) else ""))


class FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = json.dumps(self._payload)

    def json(self):
        return self._payload


GROUP = {
    "state": "inWar",
    "season": "2026-10",
    "clans": [
        {"tag": "#AAA", "name": "Alpha", "clanLevel": 5,
         "badgeUrls": {}, "members": [{"townHallLevel": 15}]},
    ],
    "rounds": [{"warTags": ["CWL-2026-10-01"]}],
}

WIRED = {
    "fetchedAt": "2026-10-03T00:00:00Z",
    "goldpass": {"seasonWindow": {"month": 10}},
    "countryRank": {"rank": 12, "locationId": 7, "locationName": "Indonesia",
                    "scanned": 400},
    "cwl": {"state": "notInSeason"},
}


def fake_group(response):
    """Point meta_scraper's HTTP layer at a canned league-group response."""
    original = meta_scraper.http_client.get
    meta_scraper.http_client.get = lambda url, headers=None, **kw: response
    return original


def main():
    tmp = tempfile.mkdtemp()
    cwd = os.getcwd()
    os.chdir(tmp)
    try:
        path = "data/meta.json"
        os.makedirs("data", exist_ok=True)

        print("a live season leaves the other keys alone")
        with open(path, "w") as f:
            json.dump(WIRED, f)
        original = fake_group(FakeResponse(200, GROUP))
        try:
            with redirect_stdout(io.StringIO()):
                cwl_scraper.update_cwl()
        finally:
            meta_scraper.http_client.get = original

        with open(path) as f:
            meta = json.load(f)
        check("writes the league group", (meta.get("cwl") or {}).get("season") == "2026-10",
              json.dumps(meta.get("cwl"))[:140])
        check("keeps goldpass from the daily job", meta.get("goldpass") == WIRED["goldpass"],
              json.dumps(meta.get("goldpass"))[:120])
        check("keeps countryRank from the daily job", meta.get("countryRank") == WIRED["countryRank"],
              json.dumps(meta.get("countryRank"))[:120])
        check("advances fetchedAt", meta["fetchedAt"] != WIRED["fetchedAt"])

        print("an unchanged league group writes nothing")
        with open(path) as f:
            before = f.read()
        original = fake_group(FakeResponse(200, GROUP))
        try:
            buf = io.StringIO()
            with redirect_stdout(buf):
                cwl_scraper.update_cwl()
        finally:
            meta_scraper.http_client.get = original
        with open(path) as f:
            after = f.read()
        check("file is byte-identical, so no empty commit", before == after,
              buf.getvalue()[:140])

        print("out of season is recorded, not left null")
        with open(path, "w") as f:
            json.dump(WIRED, f)
        original = fake_group(FakeResponse(404, {"reason": "notFound"}))
        try:
            with redirect_stdout(io.StringIO()):
                cwl_scraper.update_cwl()
        finally:
            meta_scraper.http_client.get = original
        with open(path) as f:
            meta = json.load(f)
        check("states notInSeason", meta.get("cwl") == {"state": "notInSeason"},
              json.dumps(meta.get("cwl"))[:140])
        check("still keeps the other keys", meta.get("countryRank") == WIRED["countryRank"])

        print("a corrupt meta.json is rebuilt rather than trusted")
        with open(path, "w") as f:
            f.write("{ broken")
        original = fake_group(FakeResponse(200, GROUP))
        try:
            with redirect_stdout(io.StringIO()):
                cwl_scraper.update_cwl()
        finally:
            meta_scraper.http_client.get = original
        with open(path) as f:
            meta = json.load(f)
        check("file is valid JSON again", (meta.get("cwl") or {}).get("season") == "2026-10",
              json.dumps(meta)[:140])
    finally:
        os.chdir(cwd)

    print()
    print(f"{len(PASS)} passed, {len(FAIL)} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())