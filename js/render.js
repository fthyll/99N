/**
 * Rendering Module — barrel.
 * Split per view 2026-11-04 (P1 god-file). Implementasi ada di:
 *   render-members.js  renderWarHistory? no: renderMembers
 *   render-war.js      renderWarHistory, renderWarDetail, renderAtkSmall
 *   render-about.js    renderAbout
 *   render-raid.js     renderRaidSummary, renderRaidAttacks, renderRaidDefenses,
 *                      renderRaidAttendance, setRaidSort, resetRaidSort
 * File ini tetap ada agar import existing (importsmoke, xss, app.js) tidak
 * perlu diubah semua sekaligus. Barrel, bukan logika.
 */
export { renderMembers } from './render-members.js';
export { renderWarHistory, renderWarDetail, renderAtkSmall } from './render-war.js';
export { renderAbout } from './render-about.js';
export { renderRaidSummary, renderRaidAttacks, renderRaidDefenses, renderRaidAttendance, setRaidSort, resetRaidSort } from './render-raid.js';
