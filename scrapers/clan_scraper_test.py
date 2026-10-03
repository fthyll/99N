"""Tests for the failure-handling conventions the scrapers must share.

Run: python3 scrapers/clan_scraper_test.py

A scraper that prints and exits 0 on an API failure leaves the workflow green
and the data stale, which is the one failure mode this project exists to avoid:
clan_scraper did exactly that, so a dead token produced a passing run and no
snapshot, noticed only by the 24h watchdog a day later.
"""

import io
import json
import os
import sys
import tempfile
from contextlib import redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import clan_scraper

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("PASS  " if cond else "FAIL  ") + name + (("   [" + detail + "]") if (detail and not cond) else ""))


class FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text or json.dumps(payload or {})

    def json(self):
        return self._payload if self._payload is not None else {}


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.calls = 0

    def get(self, url, headers=None, **kwargs):
        self.calls += 1
        return self.response


def with_fake_response(response):
    original = clan_scraper.http_client.get
    calls = []
    clan_scraper.http_client.get = lambda url, headers=None, **kw: (
        calls.append(url) or response)
    return original, calls


def main():
    tmp = tempfile.mkdtemp()
    cwd = os.getcwd()
    os.chdir(tmp)
    try:
        print("a clan fetch that fails")
        for status in (401, 403, 404, 500, 503):
            original, _ = with_fake_response(FakeResponse(status, {"reason": "nope"}))
            failed = False
            buf = io.StringIO()
            try:
                with redirect_stdout(buf):
                    clan_scraper.update_clan_data()
            except SystemExit:
                failed = True
            finally:
                clan_scraper.http_client.get = original
            check(f"HTTP {status} exits non-zero instead of passing quietly", failed,
                  buf.getvalue()[:120])
            # The directory is created before the request, so the assertion is on
            # the snapshot itself: a failed fetch must not leave a file behind.
            snap_dir = os.path.join("data", "clan_stats")
            wrote = os.listdir(snap_dir) if os.path.isdir(snap_dir) else []
            check(f"HTTP {status} writes no snapshot", wrote == [], str(wrote)[:120])
            check(f"HTTP {status} writes no index entry",
                  not os.path.exists("data/clan_stats_index.json"),
                  str(os.listdir("data"))[:120])

        print("a clan fetch that works")
        original, calls = with_fake_response(
            FakeResponse(200, {"name": "99N", "members": 50, "memberList": []}))
        try:
            with redirect_stdout(io.StringIO()):
                clan_scraper.update_clan_data()
        finally:
            clan_scraper.http_client.get = original
        check("writes a snapshot", os.path.isdir("data/clan_stats"))
        check("indexes it", os.path.exists("data/clan_stats_index.json"))

        print("an unreadable index is rebuilt, not trusted")
        with open("data/clan_stats_index.json", "w") as f:
            f.write("{not json")
        original, _ = with_fake_response(FakeResponse(200, {"name": "99N"}))
        try:
            with redirect_stdout(io.StringIO()):
                clan_scraper.update_clan_data()
        finally:
            clan_scraper.http_client.get = original
        with open("data/clan_stats_index.json") as f:
            idx = json.load(f)
        check("index parses again", isinstance(idx, list) and idx, json.dumps(idx)[:120])
    finally:
        os.chdir(cwd)

    print()
    print(f"{len(PASS)} passed, {len(FAIL)} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
