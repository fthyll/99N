# Changelog

## Unreleased — 2026-11-16

### Added

- Town Hall 19 WebP asset at `assets/Town_Hall19.webp` (527×534, 52,030 bytes), converted from the supplied PNG.
- Asset regression checks for Town Hall levels 1–19.
- Regression tests exercising real TH19 member, war attack, raid participant, and raid absentee renders, date parsing, native war-card links, and summary-only card behavior.
- Current screenshots of Overview, Members, Wars, Raids, and Stats using the repository's actual archived snapshots.

### Changed

- Moved the Overview KPI grid into a right-hand sidebar on wide screens; tablet and phone layouts stack it above About content.
- Split rendering into `render-members.js`, `render-war.js`, `render-about.js`, and `render-raid.js`; `render.js` preserves the existing public imports.
- Render tests now import production modules directly instead of concatenating their source and injecting dependencies.
- README documents TH19 assets, current screenshots, and frontend test commands.

### Fixed

- War cards now use native links with accessible labels and visible keyboard focus. Enter and ordinary clicks open the internal detail view; modified clicks retain browser navigation. Summary-only cards remain noninteractive.
- Added missing `getTHImage` imports in War and Raid render modules.
- Corrected Stats test timestamps to retain the CoC `T` separator.
- Removed the shared `.render.probe.mjs` file that caused intermittent failures during parallel tests.

### Validation

- `npm test`: 14 test files passed, 0 failed.
- `npm run check`: frontend syntax checks passed.
- Browser check: clicking a nested element inside a war card opened its detail view.
- All five screenshot views had no broken visible images. Both Stats charts were visually verified after bringing the browser tab to the foreground.
- Stats uses the built-in This Month filter, falling back to Previous War because the local archive has no November wars.

Screenshots show archived data, including its stale-data indicator. They do not represent a live data refresh or a production deployment.
