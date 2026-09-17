"""Tests for scrapers/retention.py.

Uses a throwaway temp directory so the real snapshot archive is never touched.

Run: python3 scrapers/retention_test.py
"""

import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import retention

FAILURES = []


def check(name, condition, detail=""):
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        FAILURES.append(name)


def setup(names, index=None):
    """Create a temp archive with the given filenames and index."""
    root = tempfile.mkdtemp(prefix="retention-test-")
    data_dir = os.path.join(root, "data")
    os.makedirs(data_dir, exist_ok=True)
    for n in names:
        with open(os.path.join(data_dir, n), "w") as f:
            f.write("{}")
    index_path = os.path.join(root, "index.json")
    with open(index_path, "w") as f:
        json.dump(names if index is None else index, f)
    return root, data_dir, index_path


def leftovers(data_dir):
    return sorted(os.listdir(data_dir))


def read_index(index_path):
    with open(index_path) as f:
        return json.load(f)


def main():
    print("under the limit")

    root, d, i = setup([f"war_{n}.json" for n in range(5)])
    removed = retention.prune(d, i, keep=10, label="test")
    check("nothing pruned when below keep", removed == [] and len(leftovers(d)) == 5,
          f"(removed={removed})")
    shutil.rmtree(root)

    root, d, i = setup([f"war_{n}.json" for n in range(5)])
    removed = retention.prune(d, i, keep=5, label="test")
    check("exactly keep survives untouched", removed == [] and len(leftovers(d)) == 5)
    shutil.rmtree(root)

    print("pruning")

    names = [f"war_2026{i:02d}.json" for i in range(1, 13)]  # 12 snapshots
    root, d, i = setup(names)
    removed = retention.prune(d, i, keep=4, label="test")
    check("prunes the oldest, keeps the newest",
          removed == names[:8] and leftovers(d) == names[8:],
          f"(removed={len(removed)} kept={leftovers(d)})")
    check("index matches surviving files", read_index(i) == names[8:],
          f"(index={read_index(i)})")
    shutil.rmtree(root)

    print("index integrity")

    names = ["a.json", "b.json", "c.json"]
    root, d, i = setup(names, index=["a.json", "c.json"])  # b never indexed
    removed = retention.prune(d, i, keep=1, label="test")
    check("only indexed files are considered",
          removed == ["a.json"] and leftovers(d) == ["b.json", "c.json"],
          f"(removed={removed} left={leftovers(d)})")
    check("no index row points at a deleted file",
          all(os.path.exists(os.path.join(d, n)) for n in read_index(i)),
          f"(index={read_index(i)})")
    shutil.rmtree(root)

    root, d, i = setup(["x.json", "y.json"], index=["x.json", "y.json"])
    os.remove(os.path.join(d, "x.json"))  # file vanished, index still lists it
    removed = retention.prune(d, i, keep=1, label="test")
    check("stale index row is dropped even without a file",
          removed == ["x.json"] and read_index(i) == ["y.json"],
          f"(removed={removed} index={read_index(i)})")
    shutil.rmtree(root)

    print("degenerate inputs")

    root, d, i = setup(["only.json"])
    check("single entry with keep=1 is a no-op",
          retention.prune(d, i, keep=1, label="test") == [])
    shutil.rmtree(root)

    root = tempfile.mkdtemp(prefix="retention-test-")
    d = os.path.join(root, "data")
    os.makedirs(d)
    missing_index = os.path.join(root, "nope.json")
    check("missing index is a safe no-op",
          retention.prune(d, missing_index, keep=1, label="test") == [])
    shutil.rmtree(root)

    root, d, i = setup(["a.json"])
    with open(i, "w") as f:
        f.write("{ not json")
    check("corrupt index is a safe no-op",
          retention.prune(d, i, keep=1, label="test") == [] and leftovers(d) == ["a.json"])
    shutil.rmtree(root)

    root, d, i = setup([])
    check("empty archive is a no-op", retention.prune(d, i, keep=5, label="test") == [])
    shutil.rmtree(root)

    print("config wiring")
    import config
    check("WAR_KEEP is a positive int", isinstance(config.WAR_KEEP, int) and config.WAR_KEEP > 0)
    check("RAID_KEEP is a positive int", isinstance(config.RAID_KEEP, int) and config.RAID_KEEP > 0)

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}")
        return 1
    print("\nAll retention checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
