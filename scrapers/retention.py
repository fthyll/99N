"""Retention for the archived snapshots.

War and raid snapshots are only ever appended, so the repositories that run
this workflow every 15 minutes grow without bound. Pruning keeps a rolling
window of the most recent entries and drops both the data file and its index
entry together, so the index can never point at a file that is gone.

Deliberately NOT applied to clan_stats or player_stats: the clan index feeds
the "history date" picker in the dashboard, so pruning it would silently
remove dates the user can currently select.
"""

import json
import os


def _load_index(index_path):
    if not os.path.exists(index_path):
        return []
    try:
        with open(index_path, "r") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"Retention: could not read {index_path} ({exc}); skipping prune.")
        return []
    return data if isinstance(data, list) else []


def prune(data_dir, index_path, keep, label):
    """Keep the newest ``keep`` snapshots; delete the rest and their index rows.

    Returns the list of pruned filenames. Index entries are sorted by name,
    which for these timestamp-based filenames is also chronological order, and
    matches how the scrapers maintain the index (oldest first).
    """
    index = _load_index(index_path)
    if not index:
        return []

    sorted_names = sorted(index)
    if len(sorted_names) <= keep:
        return []

    stale = sorted_names[: len(sorted_names) - keep]
    removed = []

    for filename in stale:
        path = os.path.join(data_dir, filename)
        if os.path.exists(path):
            try:
                os.remove(path)
            except OSError as exc:
                # Keep the index row: a file we could not delete must stay
                # reachable rather than become an orphan.
                print(f"Retention: could not delete {path} ({exc}); keeping its index entry.")
                continue
        removed.append(filename)

    if not removed:
        return []

    kept = [name for name in sorted_names if name not in removed]
    with open(index_path, "w") as f:
        json.dump(kept, f, indent=4)

    print(f"Retention: pruned {len(removed)} {label} snapshot(s), kept {len(kept)}.")
    return removed


def prune_war():
    """Keep roughly the last two months of wars (8 wars/month at most)."""
    from config import WAR_KEEP

    return prune("data/war_stats", "data/war_stats_index.json", WAR_KEEP, "war")


def prune_raid():
    """Raid weekends run weekly, so a year of history is cheap."""
    from config import RAID_KEEP

    return prune("data/raid_stats", "data/raid_stats_index.json", RAID_KEEP, "raid")


if __name__ == "__main__":
    import sys

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    removed = prune_war() + prune_raid()
    print(f"Pruned {len(removed)} snapshot(s) total.")
