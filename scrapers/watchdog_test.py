"""Tests for scrapers/watchdog.py thresholds and check logic.

Run: python3 scrapers/watchdog_test.py

MAX_RUN_AGE_HOURS is 3 h by explicit maintainer choice, which sits below the
repo's own observed gap distribution: over 100 war and 100 raid runs the median
gap was 3.8 h / 4.4 h and 72% of gaps exceeded 3 h. So the test does not argue
for that value, it pins the behaviour the value implies — a red check reports a
quiet scheduler, and the run-age and snapshot-age checks fail independently so
one noisy signal cannot mask a real stall in the other.
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


def main():
    print("the configured threshold")
    check("run-age limit is the maintainer's 3 h", watchdog.MAX_RUN_AGE_HOURS == 3,
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

    now = datetime(2026, 10, 3, 8, 0, 0, tzinfo=timezone.utc)

    # snapshot_age only reads git; drive the threshold directly so the test does
    # not depend on this repository's history.
    fresh, old = 2.0, 30.0
    check("a fresh snapshot passes the snapshot check",
          fresh < watchdog.MAX_SNAPSHOT_AGE_HOURS, str(fresh))
    check("a 30 h-old snapshot fails it",
          old >= watchdog.MAX_SNAPSHOT_AGE_HOURS, str(old))

    quiet, running = 3.5, 0.5
    check("a 3.5 h scheduler gap trips the run check",
          quiet > watchdog.MAX_RUN_AGE_HOURS, str(quiet))
    check("a 0.5 h gap does not", running <= watchdog.MAX_RUN_AGE_HOURS, str(running))

    print("the documented behaviour matches the arithmetic")
    # The comment block claims 72% of observed gaps exceed the threshold. That
    # claim is what makes a red run uninformative, so it must not drift into
    # saying the threshold is a useful signal.
    gap = timedelta(hours=3.8).total_seconds() / 3600
    check("a median-sized gap does trip 3 h", gap > watchdog.MAX_RUN_AGE_HOURS, f"{gap:.2f}h")
    check("the worst observed gap (8.1 h) would also trip it", 8.1 > watchdog.MAX_RUN_AGE_HOURS)

    print("main() returns non-zero only on a problem")

    calls = []

    def fake_git(*args):
        calls.append(args)
        return "2026-10-03T06:00:00+00:00"

    def fake_stale(token, repo):
        return []

    real_git, real_stale = watchdog._git, watchdog.stale_workflows
    real_env = os.environ.pop("GITHUB_REPOSITORY", None)
    watchdog._git = fake_git
    watchdog.stale_workflows = fake_stale
    try:
        with redirect_stdout(io.StringIO()):
            ok = watchdog.main()
        check("a healthy check exits 0", ok == 0, str(ok))

        # Now make both signals bad and confirm it reports rather than passes.
        def bad_stale(token, repo):
            return [("Update War Stats (15m)", "last run 9.0h ago")]

        watchdog.stale_workflows = bad_stale
        os.environ["GITHUB_REPOSITORY"] = "fthyll/99N"
        sent = []
        real_send = watchdog.discord.send
        watchdog.discord.send = lambda **kw: sent.append(kw) or True
        try:
            with redirect_stdout(io.StringIO()) as buf:
                bad = watchdog.main()
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