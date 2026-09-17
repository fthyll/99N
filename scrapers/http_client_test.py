"""Tests for scrapers/http_client.py.

Run: python3 scrapers/http_client_test.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests

import http_client

FAILURES = []


class FakeResponse:
    def __init__(self, status_code, headers=None, text=""):
        self.status_code = status_code
        self.headers = headers or {}
        self.text = text

    def json(self):
        return {}


class FakeSession:
    """Returns each queued response in turn; records how many calls were made."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0

    def get(self, url, headers=None, timeout=None):
        self.calls += 1
        item = self._responses[min(self.calls - 1, len(self._responses) - 1)]
        if isinstance(item, Exception):
            raise item
        return item


def check(name, condition, detail=""):
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        FAILURES.append(name)


def main():
    # Backoff sleeps must not make the suite slow.
    http_client.time.sleep = lambda _s: None

    print("retry behaviour")

    s = FakeSession([FakeResponse(200), FakeResponse(200)])
    res = http_client.get("http://x", {}, session=s)
    check("2xx returns immediately without retrying", res.status_code == 200 and s.calls == 1,
          f"(status={res.status_code} calls={s.calls})")

    s = FakeSession([FakeResponse(429), FakeResponse(200)])
    res = http_client.get("http://x", {}, session=s)
    check("429 then 200 retries once and succeeds", res.status_code == 200 and s.calls == 2,
          f"(status={res.status_code} calls={s.calls})")

    s = FakeSession([FakeResponse(503), FakeResponse(502), FakeResponse(200)])
    res = http_client.get("http://x", {}, session=s)
    check("5xx chain retries until success", res.status_code == 200 and s.calls == 3,
          f"(status={res.status_code} calls={s.calls})")

    s = FakeSession([FakeResponse(429)])
    res = http_client.get("http://x", {}, attempts=3, session=s)
    check("exhausted retries return the last response, not an exception",
          res.status_code == 429 and s.calls == 3, f"(status={res.status_code} calls={s.calls})")

    print("non-retryable statuses")

    s = FakeSession([FakeResponse(403)])
    res = http_client.get("http://x", {}, session=s)
    check("403 is returned without retrying", res.status_code == 403 and s.calls == 1,
          f"(calls={s.calls})")

    s = FakeSession([FakeResponse(404)])
    res = http_client.get("http://x", {}, session=s)
    check("404 is returned without retrying (notInWar path)", res.status_code == 404 and s.calls == 1,
          f"(calls={s.calls})")

    print("transport errors")

    s = FakeSession([requests.ConnectionError("boom"), FakeResponse(200)])
    res = http_client.get("http://x", {}, session=s)
    check("connection error is retried", res.status_code == 200 and s.calls == 2,
          f"(calls={s.calls})")

    s = FakeSession([requests.ConnectionError("boom")])
    raised = False
    try:
        http_client.get("http://x", {}, attempts=2, session=s)
    except requests.ConnectionError:
        raised = True
    check("persistent connection error raises", raised and s.calls == 2, f"(calls={s.calls})")

    print("Retry-After header")

    delays = []
    http_client.time.sleep = lambda s_: delays.append(s_)
    s = FakeSession([FakeResponse(429, headers={"Retry-After": "7"}), FakeResponse(200)])
    http_client.get("http://x", {}, session=s)
    check("honours Retry-After seconds", delays == [7.0], f"(delays={delays})")

    delays.clear()
    s = FakeSession([FakeResponse(429, headers={"Retry-After": "not-a-number"}), FakeResponse(200)])
    http_client.get("http://x", {}, session=s)
    check("malformed Retry-After falls back to backoff", delays == [2], f"(delays={delays})")

    print("pass-through")
    check("timeout is forwarded to requests", http_client.REQUEST_TIMEOUT == 30)

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}")
        return 1
    print("\nAll http_client checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
