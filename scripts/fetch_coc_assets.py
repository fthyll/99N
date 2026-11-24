#!/usr/bin/env python3
"""Download Clash of Clans item icons into assets/coc/.

Primary source is coc.guide, which publishes one PNG per game item under
/static/imgs/<category>/<slug>.png and keeps the game data as JSON under
/static/json/. The name the game shows (what the Supercell API returns in a
player profile) is the English string of the item's TID, so the JSON plus the
English text file is what turns "Barbarian King" into hero/barbarian-king.png.

coc.guide has not published icons for the newest content yet, so anything it
does not serve falls back to the Clash of Clans wiki (Fandom) media API.

This script:
  1. reads coc.guide's game data and resolves every display name to the image
     path the site would use (its slug lower-cases the data key and turns
     spaces into dashes; underscores are kept),
  2. keeps only paths the server actually serves (HTTP 200),
  3. falls back to the wiki for the names coc.guide does not have,
  4. downloads the icons the archived clan profiles reference, converts them
     to WebP and writes js/coc-assets.js (item name -> local file).

Run it after the clan data changes to pick up new items:

    python3 scripts/fetch_coc_assets.py
"""

import concurrent.futures
import json
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "coc"
OUT_MODULE = ROOT / "js" / "coc-assets.js"
PROFILES = ROOT / "data" / "player_profiles.json"

BASE = "https://coc.guide/static/json/"
IMG = "https://coc.guide/static/imgs/"
WIKI_API = "https://clashofclans.fandom.com/api.php"
UA = "Mozilla/5.0 (99N dashboard asset fetcher)"

# category -> (data file, image folder)
CATEGORIES = {
    "troop": ("characters.json", "troop"),
    "spell": ("spells.json", "spell"),
    "hero": ("heroes.json", "hero"),
    "pet": ("pets.json", "pet"),
    "equipment": ("character_items.json", "equipment"),
}

# The Supercell API and coc.guide do not always use the same wording for the
# same item: "API name": "coc.guide data key".
ALIASES = {
    # Supers are "Super X" in the API and "Elite X"/"Super X" in the wiki.
    "Super Archer": "EliteArcher",
    "Super Barbarian": "EliteBarbarian",
    "Super Giant": "EliteGiant",
    "Super Valkyrie": "EliteValkyrie",
    "Super Wall Breaker": "EliteWallBreaker",
    "Super Goblin": "EliteGoblin",
    "Super Witch": "Head Witch",
    # Heroes.
    "Battle Machine": "Warmachine",
    # Pets travel under their own ids.
    "L.A.S.S.I": "Barky",
    "Electro Owl": "Electrowl",
    "Spirit Fox": "Phase Fennec",
    "Unicorn": "Unipony",
    # Hero equipment: the API reports the old display names, coc.guide the
    # renamed "Hero Gear" ids.
    "Spiky Ball": "Football",
    "Giant Arrow": "Piercing Arrow",
    "Archer Puppet": "Archer Crown",
    "Barbarian Puppet": "Barbarian Crown",
    "Rage Gem": "Angry Tome",
    "Rage Vial": "Iron Fist",
    "Healer Puppet": "Healer Jar",
    "Henchmen Puppet": "MP Minion Bros",
    "Lavaloon Puppet": "GW Lavaloon Puppet",
    "Invisibility Vial": "Royal Cloak",
    "Royal Gem": "Protective Cloak",
    "Snake Bracelet": "Snake Armor",
    "Fireball": "Fire in a Can",
    "Dark Orb": "MP Dark Orb",
}


def fetch(url, timeout=40):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_json(url):
    return json.loads(fetch(url))


def slugify(key):
    """The slug coc.guide uses for a data key: lower case, spaces to dashes,
    underscores kept."""
    return re.sub(r"\s+", "-", key.strip()).lower()


def english_texts():
    """TID -> English string, the same way coc.guide resolves names."""
    resolved = {}
    for filename in ("texts_EN.json", "secondary_texts_EN.json"):
        for tid, value in fetch_json(BASE + "lang/" + filename).items():
            if isinstance(value, list) and value:
                resolved[tid] = value[0]
            elif isinstance(value, str):
                resolved[tid] = value
    return resolved


def display_name(entry, texts):
    tid = entry.get("TID")
    if isinstance(tid, list):
        tid = tid[0] if tid else None
    if not tid:
        return None
    name = texts.get(tid)
    if not name:
        return None
    return name.replace("<name>", "").strip()


def build_candidates():
    """display name -> candidate image paths on coc.guide.

    The image path is derived from the game's data key, not from the name the
    API shows: "Barbarian King" is stored as "Barbarian King" but "Hog Rider"
    is "Boar Rider" and "Lava Hound" is "AirDefenceSeeker".  Several keys can
    share one display name (the football barbarian and the wizard both answer
    to "Wizard"), so the candidate whose slug is the display name itself wins.
    """
    texts = english_texts()
    candidates = {}
    for folder, (filename, category) in CATEGORIES.items():
        for key, entry in fetch_json(BASE + filename).items():
            name = display_name(entry, texts)
            if not name:
                continue
            slug = slugify(key)
            paths = candidates.setdefault(name, [])
            for path in (
                f"{category}/{slug}.png",
                f"{category}/{slug}-18.png",
                f"{category}/{slug}-27.png",
                f"{category}/cc/{slug}.png",
            ):
                if path not in paths:
                    paths.append(path)
    return candidates


def candidate_paths(name, candidates, categories):
    """The image paths to try for a name, most likely first.

    The game's data key is the best guess, but coc.guide publishes the newest
    items under a slug of their own name before the JSON catches up, and a
    couple of display names are shared by several keys."""
    own = f"/{slugify(name)}.png"
    paths = []

    def rank(path):
        category = path.split("/")[0]
        return (0 if category in categories else 1, 0 if path.endswith(own) else 1)

    for path in sorted(candidates.get(name, []), key=rank):
        if path not in paths:
            paths.append(path)
    for path in slug_candidates(name, categories):
        if path not in paths:
            paths.append(path)
    return paths


def slug_candidates(name, categories):
    """candidates built from the display name instead of a game data key."""
    slug = slugify(name)
    paths = []
    for category in categories:
        for path in (
            f"{category}/{slug}.png",
            f"{category}/{slug}-18.png",
            f"{category}/{slug}-27.png",
            f"{category}/cc/{slug}.png",
        ):
            if path not in paths:
                paths.append(path)
    return paths


def head_ok(path):
    request = urllib.request.Request(IMG + path, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status == 200
    except (urllib.error.HTTPError, urllib.error.URLError, OSError):
        return False


def referenced_items():
    """The item names the archived clan profiles actually mention."""
    if not PROFILES.exists():
        return set(), set(), set(), set()
    payload = json.loads(PROFILES.read_text())
    troops, spells, heroes, equipment = set(), set(), set(), set()
    for profile in (payload.get("players") or {}).values():
        for troop in profile.get("troops") or []:
            troops.add(troop.get("name"))
        for spell in profile.get("spells") or []:
            spells.add(spell.get("name"))
        for hero in profile.get("heroes") or []:
            heroes.add(hero.get("name"))
            for item in hero.get("equipment") or []:
                equipment.add(item.get("name"))
        for item in profile.get("heroEquipment") or []:
            equipment.add(item.get("name"))
    return troops, spells, heroes, equipment


def item_categories():
    """name -> the categories the profiles list it under."""
    if not PROFILES.exists():
        return {}
    payload = json.loads(PROFILES.read_text())
    categories = {}
    for profile in (payload.get("players") or {}).values():
        for troop in profile.get("troops") or []:
            categories.setdefault(troop.get("name"), set()).add("troop")
        for spell in profile.get("spells") or []:
            categories.setdefault(spell.get("name"), set()).add("spell")
        for hero in profile.get("heroes") or []:
            categories.setdefault(hero.get("name"), set()).add("hero")
            for item in hero.get("equipment") or []:
                categories.setdefault(item.get("name"), set()).add("equipment")
        for item in profile.get("heroEquipment") or []:
            categories.setdefault(item.get("name"), set()).add("equipment")
    return {name: sorted(folders) for name, folders in categories.items()}


def wiki_images(names):
    """name -> wiki image URL, for the names coc.guide does not publish.

    The wiki names a file after the item ("Rocket Spear.png"), and for the
    newest troops after the item plus " info" ("Furnace info.png")."""
    wanted = []
    for name in names:
        wanted.append(f"{name}.png")
        wanted.append(f"{name} info.png")
    if not wanted:
        return {}

    def query(titles):
        url = WIKI_API + "?" + urllib.parse.urlencode({
            "action": "query",
            "titles": "|".join("File:" + title for title in titles),
            "prop": "imageinfo",
            "iiprop": "url|size",
            "format": "json",
        })
        try:
            payload = fetch_json(url)
        except (urllib.error.URLError, OSError, json.JSONDecodeError):
            return {}
        pages = (payload.get("query") or {}).get("pages") or {}
        found = {}
        for page in pages.values():
            info = page.get("imageinfo")
            if info and "missing" not in page:
                found[page["title"][len("File:"):]] = info[0]["url"]
        return found

    found = {}
    # The API accepts many titles at once; keep the batches small.
    for start in range(0, len(wanted), 40):
        found.update(query(wanted[start:start + 40]))

    resolved = {}
    for name in names:
        for candidate in (f"{name}.png", f"{name} info.png"):
            if candidate in found:
                resolved[name] = found[candidate]
                break
    return resolved


def to_webp(image_bytes, dest):
    with tempfile.NamedTemporaryFile(suffix=".img", delete=False) as handle:
        handle.write(image_bytes)
        temp = handle.name
    try:
        subprocess.run(
            ["cwebp", "-quiet", "-q", "82", "-resize", "128", "0", temp, "-o", str(dest)],
            check=True,
        )
    finally:
        Path(temp).unlink(missing_ok=True)


def main():
    troops, spells, heroes, equipment = referenced_items()
    if not (troops or spells or heroes or equipment):
        print("No player profiles found; nothing to download.", file=sys.stderr)
        return 1

    print("Reading coc.guide game data ...")
    candidates = build_candidates()
    print(f"  {len(candidates)} distinct display names known")

    wanted = troops | spells | heroes | equipment
    categories = item_categories()
    paths = set()
    for name in wanted:
        paths.update(candidate_paths(name, candidates, categories.get(name, [])))
    print(f"Checking {len(paths)} candidate images ...")
    with concurrent.futures.ThreadPoolExecutor(20) as pool:
        live = {
            path for path, ok in zip(sorted(paths), pool.map(head_ok, sorted(paths))) if ok
        }

    resolved = {}
    for name in sorted(wanted):
        for path in candidate_paths(name, candidates, categories.get(name, [])):
            if path in live:
                resolved[name] = ("coc.guide", IMG + path)
                break

    missing = sorted(wanted - set(resolved))
    if missing:
        print(f"Falling back to the wiki for {len(missing)} item(s) ...")
        resolved.update(
            (name, ("wiki", url)) for name, url in wiki_images(missing).items()
        )

    ASSETS.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {len(resolved)} icons ...")
    manifest = {}
    with concurrent.futures.ThreadPoolExecutor(12) as pool:
        jobs = {name: pool.submit(fetch, url) for name, (_, url) in resolved.items()}
        for name, job in jobs.items():
            data = job.result()
            filename = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") + ".webp"
            to_webp(data, ASSETS / filename)
            manifest[name] = f"assets/coc/{filename}"

    lines = [
        "// Generated by scripts/fetch_coc_assets.py - do not edit by hand.",
        "// Item icons from coc.guide, with the Clash of Clans wiki as fallback.",
        "",
        "export const COC_ITEM_IMAGES = {",
    ]
    for name in sorted(manifest):
        lines.append(f"    {json.dumps(name)}: {json.dumps(manifest[name])},")
    lines += ["};", "", ""]
    OUT_MODULE.write_text("\n".join(lines))

    still_missing = sorted(wanted - set(manifest))
    print(f"Wrote {OUT_MODULE.relative_to(ROOT)} ({len(manifest)} entries)")
    if still_missing:
        print(f"No icon for {len(still_missing)} item(s): {', '.join(still_missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
