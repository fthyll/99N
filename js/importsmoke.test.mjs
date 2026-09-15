// import-smoke: every module must parse and evaluate with no DOM present.
global.document = { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} };
global.window = { location: { hash: '' } };
global.flatpickr = () => ({ destroy() {} });
global.Chart = class { constructor() { this.destroy = () => {}; } };
let bad = 0;
for (const f of ['constants.js', 'api.js', 'charts.js', 'render.js']) {
  try { await import('./' + f); console.log('OK   js/' + f); }
  catch (e) { console.log('FAIL js/' + f, e.message); bad = 1; }
}
process.exit(bad);
