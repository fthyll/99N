"""Shared HTTP layer for the scrapers.

The CoC API enforces a per-token quota and returns 429 when it is exhausted;
the RoyaleAPI proxy in front of it also emits 502/503/504 when upstream is
unhappy. A single unlucky run used to abort the whole scrape and lose that
period's snapshot permanently, because the next run only ever fetches the
*current* war. Retrying transient failures is therefore about data integrity,
not politeness.

Only 429 and 5xx responses are retried. 403 (bad token or IP not whitelisted)
and 404 (genuinely absent resource) are reported immediately: retrying them
just burns quota to reach the same answer.
"""

import time

import requests

# Total attempts, not retries: 3 means one initial call plus two more.
DEFAULT_ATTEMPTS = 3
# Exponential backoff, kept short because the workflow runs every 15 minutes
# and a long sleep delays the commit that the next run depends on.
BACKOFF_SECONDS = (2, 5)
REQUEST_TIMEOUT = 30

RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


def get(url, headers, attempts=DEFAULT_ATTEMPTS, timeout=REQUEST_TIMEOUT, session=None):
    """GET ``url``, retrying transient failures with exponential backoff.

    Returns the final ``requests.Response`` whatever its status, so callers
    keep their existing status-code branching (a 404 ``notInWar`` is a normal
    outcome, not an error). Raises only when every attempt failed at the
    transport level, e.g. DNS or connection errors.
    """
    requester = session.get if session is not None else requests.get
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            res = requester(url, headers=headers, timeout=timeout)
        except requests.RequestException as exc:
            last_error = exc
            if attempt == attempts:
                raise
            _sleep(attempt, f"transport error ({type(exc).__name__})")
            continue

        if res.status_code not in RETRYABLE_STATUS or attempt == attempts:
            if res.status_code in RETRYABLE_STATUS:
                print(f"HTTP {res.status_code} persisted after {attempts} attempts; giving up.")
            return res

        # Discord's API sends Retry-After; the CoC API does not, but honour it
        # when present rather than guessing.
        retry_after = res.headers.get("Retry-After")
        delay = None
        if retry_after:
            try:
                delay = float(retry_after)
            except ValueError:
                delay = None
        _sleep(attempt, f"HTTP {res.status_code}", delay)

    if last_error is not None:  # pragma: no cover - loop always returns or raises
        raise last_error
    raise RuntimeError("unreachable")  # pragma: no cover


def _sleep(attempt, reason, delay=None):
    if delay is None:
        index = min(attempt - 1, len(BACKOFF_SECONDS) - 1)
        delay = BACKOFF_SECONDS[index]
    print(f"Request failed ({reason}); retrying in {delay:g}s (attempt {attempt}).")
    time.sleep(delay)
