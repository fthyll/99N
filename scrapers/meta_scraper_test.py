"""Tests for scrapers/meta_scraper.py CWL handling.

Run: python3 scrapers/meta_scraper_test.py

The real fetch_cwl used to call /cwl/{tag}, which does not exist in the Clash
of Clans API — every request 404s, so meta.json has carried "cwl": null since
the feature landed. These checks pin the correct endpoint and the standings
arithmetic that turns per-war results into a league table.
"""

import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import meta_scraper

FAILURES = []


def check(name, condition, detail=""):
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        FAILURES.append(name)


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        # fetch_cwl quotes res.text when it logs an unexpected status.
        self.text = json.dumps(payload) if payload is not None else ""

    def json(self):
        return self._payload


def install_fake_http(routes):
    """Replace http_client.get with a router keyed by URL substring."""
    calls = []

    def fake_get(url, headers=None, **kwargs):
        calls.append(url)
        for needle, response in routes.items():
            if needle in url:
                return response() if callable(response) else response
        return FakeResponse(404, {"reason": "notFound", "message": "no route"})

    original = meta_scraper.http_client.get
    meta_scraper.http_client.get = fake_get
    return original, calls


GROUP = {
    "state": "inWar",
    "season": "2026-09",
    "clans": [
        {"tag": "#AAA", "name": "Alpha", "clanLevel": 5,
         "badgeUrls": {"small": "a.png"}, "members": [{"tag": "#P1", "name": "One", "townHallLevel": 15}]},
        {"tag": "#BBB", "name": "Beta", "clanLevel": 4,
         "badgeUrls": {"small": "b.png"}, "members": [{"tag": "#P2", "name": "Two", "townHallLevel": 14}]},
    ],
    "rounds": [{"warTags": ["W1", "W2"]}],
}

# A finished war: whoever scores more stars takes the win.
WAR_WIN = {"state": "warEnded", "clan": {"stars": 30}, "opponent": {"stars": 21}}
WAR_LOSS = {"state": "warEnded", "clan": {"stars": 12}, "opponent": {"stars": 30}}
WAR_TIE = {"state": "warEnded", "clan": {"stars": 20}, "opponent": {"stars": 20}}


def war_payload(clan_tag, opponent_tag, clan_stars, opp_stars):
    """A finished war seen from `clan_tag`'s side."""
    return {
        "state": "warEnded",
        "clan": {"tag": clan_tag, "name": "X", "stars": clan_stars, "destructionPercentage": 50.0,
                 "badgeUrls": {"small": "s.png"}, "members": []},
        "opponent": {"tag": opponent_tag, "name": "Y", "stars": opp_stars, "destructionPercentage": 50.0,
                     "badgeUrls": {"small": "o.png"}, "members": []},
    }


def main():
    print("the endpoint exists")
    original, calls = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(200, GROUP),
        "/clanwarleagues/wars/": lambda: FakeResponse(200, war_payload("#AAA", "#BBB", 30, 21)),
    })
    try:
        meta = {}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original

    used = " ".join(calls)
    check("uses /currentwar/leaguegroup", "currentwar/leaguegroup" in used, used[:160])
    check("no longer calls the nonexistent /cwl/ endpoint", "/cwl/" not in used, used[:160])

    print("no wasted member scans")
    original, calls = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(200, GROUP),
        "/clanwarleagues/wars/": FakeResponse(200, war_payload("#AAA", "#BBB", 30, 21)),
    })
    try:
        meta = {}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original
    check("does not scan members or players to find the group",
          not any("/members" in c or "/players/" in c for c in calls),
          str([c for c in calls if "/members" in c or "/players/" in c])[:160])

    print("standings from finished wars")
    original, calls = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(200, GROUP),
        # War 1: Alpha beats Beta. War 2: Beta beats Alpha. Each clan sees itself as "clan".
        "/clanwarleagues/wars/W1": FakeResponse(200, war_payload("#AAA", "#BBB", 30, 21)),
        "/clanwarleagues/wars/W2": FakeResponse(200, war_payload("#BBB", "#AAA", 30, 21)),
    })
    try:
        meta = {}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original

    cwl = meta.get("cwl")
    check("group is stored", isinstance(cwl, dict) and cwl.get("season") == "2026-09", json.dumps(cwl)[:200] if cwl else "None")
    table = (cwl or {}).get("standings") or []
    check("one row per clan", len(table) == 2, f"rows={len(table)}")
    if len(table) == 2:
        by_tag = {r["tag"]: r for r in table}
        check("both clans end 1-1 after one win each",
              by_tag["#AAA"]["wins"] == 1 and by_tag["#BBB"]["wins"] == 1,
              json.dumps(by_tag))
        check("a draw is recorded as a draw, not a win",
              by_tag["#AAA"]["wins"] + by_tag["#BBB"]["wins"] == 2, json.dumps(by_tag))

    print("star tie goes to destruction, then a draw")
    original, _ = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(200, GROUP),
        "/clanwarleagues/wars/W1": FakeResponse(200, {
            "state": "warEnded",
            "clan": {"tag": "#AAA", "stars": 30, "destructionPercentage": 51.0, "members": []},
            "opponent": {"tag": "#BBB", "stars": 30, "destructionPercentage": 49.0, "members": []},
        }),
    })
    try:
        meta = {}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original
    rows = (meta.get("cwl") or {}).get("standings") or []
    if rows:
        alpha = next(r for r in rows if r["tag"] == "#AAA")
        check("30-30 on stars is settled on destruction", alpha["wins"] == 1, json.dumps(alpha))

    print("outside a season")
    original, calls = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(404, {"reason": "notFound"}),
    })
    try:
        meta = {}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original
    check("reports no season, as a state rather than a bare null",
          meta.get("cwl") == {"state": "notInSeason"}, json.dumps(meta)[:160])
    check("and makes no war requests when there is no group",
          not any("/clanwarleagues/" in c for c in calls), str(calls)[:160])

    print("a league lookup that fails for any other reason")
    original, calls = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(503, {"reason": "unavailable"}),
    })
    try:
        meta = {}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original
    # A 404 is the only expected miss. Anything else is recorded, because a bare
    # null cannot be told apart from a quiet season — which is exactly how the
    # dead /cwl/ endpoint stayed invisible.
    check("is not reported as out of season",
          (meta.get("cwl") or {}).get("state") == "unavailable", json.dumps(meta)[:160])
    check("keeps the status for the UI", (meta.get("cwl") or {}).get("httpStatus") == 503,
          json.dumps(meta)[:160])

    print("a failed lookup when a good table is already held")
    # The live case this exists for: a season was inWar with full standings,
    # then one run hit HTTP 500. Overwriting the table with "unavailable"
    # erased a live league for up to 15 minutes of wall time; the table must
    # survive, marked as held, with the error attached.
    held_group = {
        "state": "inWar", "season": "2026-10-02",
        "standings": [
            {"tag": "#AAA", "name": "Alpha", "wins": 1, "losses": 0, "draws": 0,
             "position": 1, "stars": 60, "destruction": 1.2, "townHallLevels": [15, 14]},
            {"tag": "#BBB", "name": "Beta", "wins": 0, "losses": 1, "draws": 0,
             "position": 2, "stars": 20, "destruction": 0.4, "townHallLevels": [13, 12]},
        ],
    }
    original, calls = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(500, {"reason": "boom"}),
    })
    try:
        meta = {"cwl": json.loads(json.dumps(held_group))}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original
    cwl = meta.get("cwl") or {}
    check("the held table survives the failure",
          len(cwl.get("standings") or []) == 2, json.dumps(cwl)[:200])
    check("it still reads as a live season, not a fault",
          cwl.get("state") == "inWar", json.dumps(cwl)[:120])
    check("it is marked stale", cwl.get("stale") is True, json.dumps(cwl)[:120])
    check("the failure is recorded beside it",
          "HTTP 500" in (cwl.get("error") or ""), json.dumps(cwl)[:160])
    check("and the season is kept", cwl.get("season") == "2026-10-02", json.dumps(cwl)[:120])

    print("a group with no finished wars yet")
    original, calls = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(200, {
            "state": "preparation", "season": "2026-10",
            "clans": [{"tag": "#AAA", "name": "Alpha", "clanLevel": 5, "badgeUrls": {"small": "a.png"}, "members": []}],
            "rounds": [],
        }),
    })
    try:
        meta = {}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original
    cwl = meta.get("cwl") or {}
    check("group still shows before any war is played", cwl.get("season") == "2026-10", json.dumps(cwl)[:160])
    rows = cwl.get("standings") or []
    # The row must exist with a real zero, not be omitted — an absent row would
    # read as "this clan is not in the group".
    check("the clan still gets a row, at 0-0-0",
          len(rows) == 1 and (rows[0]["wins"], rows[0]["losses"], rows[0]["draws"]) == (0, 0, 0),
          json.dumps(rows)[:200])
    check("and it is ranked first by default", rows and rows[0]["position"] == 1, json.dumps(rows)[:120])

    print("a war that never finished")
    original, calls = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(200, GROUP),
        "/clanwarleagues/wars/": FakeResponse(200, {"state": "inWar", "clan": {"stars": 30}, "opponent": {"stars": 10}}),
    })
    try:
        meta = {}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original
    rows = (meta.get("cwl") or {}).get("standings") or []
    total = sum(r["wins"] + r["losses"] + r["draws"] for r in rows)
    check("an unfinished war scores nobody", total == 0, json.dumps(rows)[:200])

    print("a war tag that 404s")
    original, _ = install_fake_http({
        "/currentwar/leaguegroup": FakeResponse(200, GROUP),
        "/clanwarleagues/wars/": FakeResponse(404, {"reason": "notFound"}),
    })
    try:
        meta = {}
        meta_scraper.fetch_cwl(meta)
    finally:
        meta_scraper.http_client.get = original
    rows = (meta.get("cwl") or {}).get("standings") or []
    check("a missing war leaves the table intact and empty of scores",
          len(rows) == 2 and sum(r["wins"] + r["losses"] + r["draws"] for r in rows) == 0,
          json.dumps(rows)[:200])

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}")
        return 1
    print("\nAll meta_scraper CWL checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())