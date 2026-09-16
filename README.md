# 99N — Clan War Stats

Clash of Clans clan dashboard for **99N (#2J0YP2LQL)**. A Python scraper runs on GitHub Actions, commits JSON snapshots to this repo, and the static frontend (GitHub Pages) renders them — no backend needed.

Fork of [cstreit03/CoC-Stats](https://github.com/cstreit03/CoC-Stats) (live demo of the original: https://clash.kenaz.dev), with these changes:

- **State-aware war data**: only `warEnded` snapshots are scored, charted, or used for win-probability averages. `preparation`/stale snapshots show as *Incomplete* instead of fake draws (see `docs` note in `js/app.js:isWarDecided`).
- **Escaped rendering**: player/clan names, descriptions, tags, and badge URLs go through `esc()` before reaching `innerHTML` (`js/xss.test.mjs` proves it).
- **Smarter scraper**: skips unarchivable war states, skips no-change writes (no empty commits every 15 min), exits non-zero on API errors so Actions turns red instead of failing silently.
- **Local run support**: `COC_API_BASE_URL` env override (`.env`), useful when your token is whitelisted to your own IP.
- **"War Room" UI remake**: sidebar dashboard (desktop) / top bar (mobile) with a KPI strip on Overview — win rate, trophies, donations, raid efficiency, TH spread. Dark navy + Clash-gold night theme and a cool-paper day theme; see [Theme system](#theme-system).
- **Roster insight columns**: net donations (donated − received, signed & colored) and Builder Base trophies/league per member, with matching sort options.
- Regression harnesses for all of the above.

## Tabs

| Tab | What it shows | Data source |
|---|---|---|
| Overview | KPI strip + clan card, war/capital league, join requirements | latest member snapshot + indices |
| Members | Roster with donations, trophies, role filters, **any historical date** | daily snapshots |
| Wars | War list + per-player attack/defense breakdown, win probability, cleanup needed | war snapshots |
| Raids | Capital raid weekends: attacks, defenses, loot per player | raid logs |
| Stats | Stars-trend line, top-25 star breakdown, conversion-rate bars (finished wars only) | war snapshots |

## Screenshots (War Room, night theme)

| Overview — KPI strip + clan card | Members — roster with Net & Builder Base |
|---|---|
| ![Overview](demo-images/warroom_overview.png) | ![Members](demo-images/warroom_members.png) |
| **Wars — history & results** | **Stats — trend & conversion** |
| ![Wars](demo-images/warroom_wars.png) | ![Stats](demo-images/warroom_stats.png) |

> War screenshots use a synthetic war-history fixture (the archive was empty
> when they were captured) — the real site fills from actual 99N wars.

## How it works

```
Supercell API ──(proxy)──► GitHub Actions (cron) ──► commit JSON to data/ ──► Pages serves js/ + data/
```

The browser never calls the API — it only reads committed JSON. That's why the API token lives solely in Actions secrets.

### Data layout

```
data/
  clan_stats/members_YYYYMMDD.json   + clan_stats_index.json   # daily roster
  war_stats/war_<startTime>.json     + war_stats_index.json    # live war, finalised on warEnded
  raid_stats/raid_<startTime>.json   + raid_stats_index.json   # per raid weekend
```

**War history starts from the day you install this** — the CoC API only exposes full per-player attack data on the `currentwar` endpoint while a war is live; `warlog` has results but no attacks, so older wars cannot be backfilled.

## Theme system

The UI ("War Room") is one palette contract with two value sets, selected by `<html data-theme="night|day">`:

- Every color is a CSS custom property in `css/style.css` (night = navy onyx + Clash gold, day = cool paper + bronze). Token *names* are stable; only values swap, so no `dark:` variants exist anywhere in the markup.
- Tailwind utilities (`text-gold`, `bg-gray-800`, even `text-white`) resolve to those vars through `tailwind.config` in `index.html`; Chart.js resolves them at draw time via `chartTheme()` in `js/charts.js` and re-renders when you toggle.
- The toggle (sidebar/top bar) persists to `localStorage.coc-theme`; a boot script in `<head>` applies the stored theme — or the OS `prefers-color-scheme` — before first paint, so there is no flash.
- Contrast is WCAG-checked per theme (≥4.5:1 for all text pairs).

**Layout**: 236px sticky sidebar ≥1024px, collapsing to a scrollable top bar on mobile. The Overview KPI strip (`renderKpis` in `js/app.js`) is derived entirely from data the app already fetched — nothing extra hits the network; the win-rate card is governed by the same `warEnded` guard as the Wars tab.

## Setup

### 1. API token

Register at [developer.clashofclans.com](https://developer.clashofclans.com) and create a key. One key = one allowed IP:

| Where scrapers run | Base URL | IP to **include** when creating the key |
|---|---|---|
| GitHub Actions | `https://cocproxy.royaleapi.dev/v1` (default) | `45.79.218.79` (the RoyaleAPI proxy) |
| Your laptop | `COC_API_BASE_URL=https://api.clashofclans.com/v1` | your own IP ([ifconfig.me](https://ifconfig.me)) |

These can be two separate keys; the proxy key is only for Actions.

### 2. GitHub secrets

Settings → Secrets and variables → Actions:

- `COC_API_TOKEN` — the proxy-whitelisted key
- `CLAN_TAG` — e.g. `#2J0YP2LQL`

### 3. Permissions & Pages

- Settings → Actions → General → Workflow permissions → **Read and write** (the bots commit back).
- Settings → Pages → Deploy from a branch → `main`, root folder. This repo is public, so Pages is free; a private repo needs GitHub Premium, or a separate public repo for the rendered site (never commit `.env` or tokens there).
- Live here: https://fthyll.github.io/99N/
- `CNAME` (optional): put your own domain there and point DNS at GitHub Pages.

### 4. Automation

| Workflow | Schedule | What |
|---|---|---|
| `update_war.yml` | every 15 min | live war snapshots; finalises each war once |
| `update_raid.yml` | every 15 min | current raid weekend; new file each weekend |
| `update_clan.yml` | daily 09:00 UTC | roster snapshot for the Members history |

Manual trigger: Actions tab → *Run workflow*.

### Local run (optional)

```bash
cd scrapers && pip install requests python-dotenv
cp ../.env.example ../.env   # fill COC_API_TOKEN, CLAN_TAG (+COC_API_BASE_URL)
PYTHONPATH=$PWD python3 ../scrapers/clan_scraper.py
```

Files land in `scrapers/data/` when run from that directory — run them from the repo root (like the workflows do) to write `data/` directly.

## Tests

No dependencies beyond Node and Python; run from the repo root:

```bash
node js/xss.test.mjs            # 24 checks: weaponised names render inert in every view
node js/warstate.test.mjs       # only warEnded wars get a Victory/Loss/Draw label
node js/importsmoke.test.mjs    # all modules parse without a DOM
python3 scrapers/war_scraper_test.py   # 9 scenarios against a stubbed HTTP layer
```

## Win probability — what it actually is

`calculateWinProbability` in `js/render.js` projects the remaining attacks of both sides from each attacker's month-to-date star average, with town-hall gap caps (4+ TH levels below target ≈ 1–2 stars max), a defense-insurance bonus when ahead, and volatility that grows as attacks run out. It uses finished wars only for the MTD input. Treat it as a weighted heuristic, not a calibrated model — no backtest exists.
