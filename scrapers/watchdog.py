"""Alert when the scrapers have gone quiet.

Every failure mode of this project is silent. The workflows run on a schedule,
commit snapshots, and render a static page; if the token expires, the clan tag
changes, an IP whitelist lapses, or Actions simply stops firing, the dashboard
keeps serving the last snapshot and looks perfectly healthy. Nothing tells the
maintainer until someone notices the numbers are stale.

Two independent checks:
  1. Snapshot age   — how old is the newest committed JSON, from git history.
  2. Workflow runs  — did the scheduled runs actually execute, via the API.

Either one firing is enough; they fail differently (a run can succeed while
writing nothing, and a snapshot can be recent while runs are broken).
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from notifier import discord, embeds

# A war snapshot is written every 15 minutes while a war is live, and the clan
# wars back to back, so an hour of silence means something is wrong rather
# than "the clan is resting".
MAX_SNAPSHOT_AGE_HOURS = 3
# The war/raid workflows are scheduled every 15 minutes; allow for queueing.
MAX_RUN_AGE_HOURS = 2
WATCHED_WORKFLOWS = ("Update War Stats (15m)", "Update Raid Stats (15m)")


def _git(*args):
    res = subprocess.run(["git", *args], capture_output=True, text=True)
    if res.returncode != 0:
        return None
    return res.stdout.strip()


def _parse_timestamp(value):
    """Parse an ISO-8601 stamp, tolerating the 'Z' suffix on Python < 3.11."""
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def newest_snapshot_age_hours():
    """Age of the most recently committed data file, in hours."""
    out = _git("log", "-1", "--format=%cI", "--", "data/")
    if not out:
        return None, None
    committed = _parse_timestamp(out)
    age = (datetime.now(timezone.utc) - committed).total_seconds() / 3600
    return age, out


def stale_workflows(token, repo):
    """Names of watched workflows whose latest run is too old (or absent)."""
    stale = []
    for name in WATCHED_WORKFLOWS:
        res = subprocess.run(
            ["gh", "run", "list", "-R", repo, "--workflow", name, "-L", "1",
             "--json", "createdAt,conclusion,status"],
            capture_output=True, text=True,
        )
        if res.returncode != 0:
            print(f"watchdog: could not query {name}: {res.stderr.strip()[:120]}")
            continue
        try:
            runs = json.loads(res.stdout or "[]")
        except json.JSONDecodeError:
            continue
        if not runs:
            stale.append((name, "never ran"))
            continue
        created = datetime.fromisoformat(runs[0]["createdAt"].replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - created).total_seconds() / 3600
        if age > MAX_RUN_AGE_HOURS:
            stale.append((name, f"last run {age:.1f}h ago"))
    return stale


def main():
    problems = []

    age, when = newest_snapshot_age_hours()
    if age is None:
        problems.append("no dated commit found under data/ (git history unreadable?)")
        print("watchdog: could not determine snapshot age")
    else:
        print(f"watchdog: newest data commit {age:.1f}h old ({when})")
        if age > MAX_SNAPSHOT_AGE_HOURS:
            problems.append(
                f"no data written for {age:.1f}h (limit {MAX_SNAPSHOT_AGE_HOURS}h)"
            )

    repo = os.getenv("GITHUB_REPOSITORY")
    if repo:
        for name, why in stale_workflows(None, repo):
            problems.append(f"{name}: {why}")
    else:
        print("watchdog: GITHUB_REPOSITORY unset, skipping run-age check")

    if not problems:
        print("watchdog: all healthy.")
        return 0

    summary = "\n".join(f"- {p}" for p in problems)
    print("watchdog: PROBLEMS DETECTED\n" + summary)

    sent = discord.send(embed={
        'title': '⚠️ 99N scrapers look stalled',
        'description': (
            'The dashboard is serving stale data — scheduled updates are not '
            'landing.\n\n' + summary
        ),
        'color': embeds.RED,
        'footer': {'text': '99N War Room · watchdog'},
    })
    print(f"watchdog: alert sent={sent}")
    # Exit non-zero so the Actions run goes red too: Discord is best-effort,
    # the red run is the record that survives.
    return 1


if __name__ == "__main__":
    sys.exit(main())
