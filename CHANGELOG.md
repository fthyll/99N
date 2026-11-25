# Changelog

## Unreleased — 2026-11-24

### Added

- Small item icons in the player profile: 22×22 WebP art beside every troop,
  spell, hero and hero-equipment name. `js/coc-assets.js` maps 160 display
  names to files in `assets/coc/`, covering the whole current roster snapshot
  including the Miner Squad and Healer Squad pets.
- `scripts/fetch_coc_assets.py` generates the pack from coc.guide's game data
  and falls back to the Clash of Clans wiki for items coc.guide has not
  published. `js/item-icons.test.mjs` checks pack coverage, WebP headers and
  escaping.
- Rankings screenshot (`demo-images/warroom_rankings.png`) and a player-profile
  screenshot (`demo-images/warroom_profile.png`) showing the item icons, both
  refreshed alongside the five existing views.
- README lines for the five frontend test files that were on disk but missing
  from the test block: `freshness`, `player-trends`, `player-snapshots`,
  `profiles`, `warraid-analytics`.

### Fixed

- The Healer Squad icon painted an opaque grey box beside the transparent ones.
  The wiki's newest revision of that file is a flattened RGB re-export, so the
  downloader now walks every revision and keeps the newest that still has an
  alpha channel. The check covers PNG *and* WebP, because the wiki CDN
  content-negotiates WebP even for `.png` URLs.
- `npm run check` skipped five shipped modules (`coc-assets`, `player-profile`,
  `player-trends`, `render-rankings`, `warraid-analytics`). They are in the
  syntax-check list now, so they no longer ship unchecked.
- Regenerated the icon pack for 160 entries; the rebased snapshot added the
  Miner Squad and Healer Squad, which the previous 158-entry pack did not cover.

### Validation

- `npm test`: 20 test files passed, 0 failed.
- `npm run check`: 20 modules syntax-checked, including the five added above.
- `python3 scripts/check_html.py`: 6 sections, balanced nesting.
- Screenshots captured at 1440×1080 against the archived snapshots and audited
  in the browser: no broken visible images, no tofu glyphs, no horizontal
  overflow on any of the six tabs. The profile dialog reported 158 sized icons
  with none zero-width or clipped.

Screenshots show archived data, including its stale-data indicator. They do not
represent a live data refresh or a production deployment.

## 2026-11-16

### Added

- Town Hall 19 WebP asset at `assets/Town_Hall19.webp` (527×534, 52,030 bytes), converted from the supplied PNG.
- Asset regression checks for Town Hall levels 1–19.
- Regression tests exercising real TH19 member, war attack, raid participant, and raid absentee renders, date parsing, native war-card links, and summary-only card behavior.
- Current screenshots of Overview, Members, Wars, Raids, and Stats using the repository's actual archived snapshots.
- Self-hosted Clash font as WOFF2 (`assets/fonts/Clash-Regular.woff2`, `assets/fonts/Clash-Bold.woff2`) and `js/fonts.test.mjs` covering the font files, glyph coverage, and profile tile sizing.

### Changed

- Typography now uses the Clash face everywhere: body, headings, KPI values, and Chart.js labels. The Google Fonts request for Outfit/Fredoka was removed, so nothing depends on an external font host.
- Profile item tiles are 250px minimum with 13px names, so a Clash name fits on one line.
- Moved the Overview KPI grid into a right-hand sidebar on wide screens; tablet and phone layouts stack it above About content.
- Split rendering into `render-members.js`, `render-war.js`, `render-about.js`, and `render-raid.js`; `render.js` preserves the existing public imports.
- Render tests now import production modules directly instead of concatenating their source and injecting dependencies.
- README documents TH19 assets, current screenshots, frontend test commands, and the new typography.

### Fixed

- Profile item names no longer break mid-word (e.g. "Barbarian" rendered as "Barbaria/n") once Clash replaced the narrower Outfit/Fredoka faces.
- War cards now use native links with accessible labels and visible keyboard focus. Enter and ordinary clicks open the internal detail view; modified clicks retain browser navigation. Summary-only cards remain noninteractive.
- Added missing `getTHImage` imports in War and Raid render modules.
- Corrected Stats test timestamps to retain the CoC `T` separator.
- Removed the shared `.render.probe.mjs` file that caused intermittent failures during parallel tests.

### Validation

- `npm test`: 20 test files passed, 0 failed.
- `npm run check`: frontend syntax checks passed.
- Browser check: clicking a nested element inside a war card opened its detail view.
- All five screenshot views had no broken visible images. Both Stats charts were visually verified after bringing the browser tab to the foreground.
- Stats uses the built-in This Month filter, falling back to Previous War because the local archive has no November wars.
- Browser check at 1440/1280/1024/900/768/600/480/414/360/320px: no item name wraps mid-word, no horizontal overflow, no tofu glyphs.

Screenshots show archived data, including its stale-data indicator. They do not represent a live data refresh or a production deployment.
