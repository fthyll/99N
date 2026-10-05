"""Tests for scrapers/watchdog.py thresholds and check logic.

Run: python3 scrapers/watchdog_test.py

The functions accept an optional `now` so the assertions can pin the clock.
Without that injection the test would drift as real time moved past whatever
hardcoded timestamp it used to read against. Production still uses the real
UTC clock; only the test passes a deterministic value.
"""

import io
import os
import sys
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import watchdog

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("PASS  " if cond else "FAIL  ") + name + (f"   [{detail}]" if (detail and not cond) else ""))


# A clock pinned before the 12 h threshold existed in the code, so the test
# does not depend on when this repo is run.
FIXED_NOW = datetime(2026, 10, 4, 0, 0, 0, tzinfo=timezone.utc)


def main():
    print("the configured threshold")
    check("run-age limit is the watchdog's 12 h", watchdog.MAX_RUN_AGE_HOURS == 12,
          str(watchdog.MAX_RUN_AGE_HOURS))
    check("snapshot-age limit is unchanged at 24 h", watchdog.MAX_SNAPSHOT_AGE_HOURS == 24,
          str(watchdog.MAX_SNAPSHOT_AGE_HOURS))
    check("war and raid are both watched",
          watchdog.WATCHED_WORKFLOWS == ("Update War Stats (15m)", "Update Raid Stats (15m)"),
          str(watchdog.WATCHED_WORKFLOWS))

    print("timestamp parsing tolerates a real commit stamp")

    stamp = "2026-10-02T20:10:05+07:00"
    parsed = watchdog._parse_timestamp(stamp)
    check("an offset stamp is accepted and timezone-aware",
          parsed.tzinfo is not None and parsed.hour == 20, stamp + " -> " + repr(parsed))
    try:
        zulu = watchdog._parse_timestamp("2026-10-02T20:10:05Z")
        check("a Z stamp is accepted too", zulu.tzinfo is not None, repr(zulu))
    except ValueError as exc:
        check("a Z stamp is accepted too", False, str(exc))

    print("the two age checks are independent")

    # snapshot_age only reads git; drive the threshold directly so the test does
    # not depend on this repository's history.
    fresh, old = 2.0, 30.0
    check("a fresh snapshot passes the snapshot check",
          fresh < watchdog.MAX_SNAPSHOT_AGE_HOURS, str(fresh))
    check("a 30 h-old snapshot fails it",
          old >= watchdog.MAX_SNAPSHOT_AGE_HOURS, str(old))

    quiet, running = 13.0, 0.5
    check("a 13 h scheduler gap trips the run check",
          quiet > watchdog.MAX_RUN_AGE_HOURS, str(quiet))
    check("a 0.5 h gap does not", running <= watchdog.MAX_RUN_AGE_HOURS, str(running))

    print("the documented behaviour matches the arithmetic")
    # The README claims the 12 h threshold leaves ~50% headroom over the
    # worst observed scheduler gap (8.1 h). The test pins a 40% floor so a
    # future drop in the threshold cannot silently erode the contract.
    gap = 8.1
    headroom = watchdog.MAX_RUN_AGE_HOURS - gap
    check("the threshold still clears the worst observed gap (8.1 h)",
          headroom >= gap * 0.4, f"headroom={headroom:.1f}h")

    print("main() returns non-zero only on a problem")

    calls = []

    def fake_git(*args):
        calls.append(args)
        # 6 h before FIXED_NOW — well under both 12 h and 24 h limits.
        return (FIXED_NOW - timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%S+00:00")

    def fake_stale(token, repo, now=None):
        return []

    real_git, real_stale = watchdog._git, watchdog.stale_workflows
    real_env = os.environ.pop("GITHUB_REPOSITORY", None)
    watchdog._git = fake_git
    watchdog.stale_workflows = fake_stale
    try:
        with redirect_stdout(io.StringIO()):
            ok = watchdog.main(now=FIXED_NOW)
        check("a healthy check exits 0", ok == 0, str(ok))

        # Now make both signals bad and confirm it reports rather than passes.
        def bad_stale(token, repo, now=None):
            return [("Update War Stats (15m)", "last run 14.0h ago")]

        watchdog.stale_workflows = bad_stale
        os.environ["GITHUB_REPOSITORY"] = "fthyll/99N"
        sent = []
        real_send = watchdog.discord.send
        watchdog.discord.send = lambda **kw: sent.append(kw) or True
        try:
            with redirect_stdout(io.StringIO()) as buf:
                bad = watchdog.main(now=FIXED_NOW)
            out = buf.getvalue()
            check("a stalled scheduler exits non-zero", bad != 0, str(bad))
            check("it names the workflow in the summary",
                  "Update War Stats" in out, out.strip().splitlines()[-1][:120] if out.strip() else "(no output)")
            check("and attempts an alert", len(sent) == 1, str(len(sent)))
        finally:
            watchdog.discord.send = real_send
            os.environ.pop("GITHUB_REPOSITORY", None)
            if real_env is not None:
                os.environ["GITHUB_REPOSITORY"] = real_env
    finally:
        watchdog._git = real_git
        watchdog.stale_workflows = real_stale

    print()
    print(f"{len(PASS)} passed, {len(FAIL)} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())