// Run: node js/syncbtn.test.mjs
// "Where is the refresh button?" was a real answer once: it existed on three of
// five tabs, so landing on Overview — the default view — showed nothing to press.
// The fix is the invariant, not the two buttons: every tab carries one, or the
// next tab added quietly reintroduces the hole.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(ROOT, f), 'utf8');

const check = (name, cond, detail = '') => {
    if (cond) console.log('PASS  ' + name);
    else { console.log('FAIL  ' + name + (detail ? '   [' + detail + ']' : '')); process.exitCode = 1; }
};

const html = read('index.html');
const render = read('js/render.js');

// The nav is the source of truth for which tabs exist, so a new tab that is
// added to the nav without a button fails here rather than in someone's browser.
const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
const TABS = [...nav.matchAll(/id="tab-([a-z]+)"/g)].map(m => m[1]);
check('nav tabs are discoverable', TABS.length === 5, TABS.join(','));

const BTN = /<button[^>]*onclick="window\.syncData\(\)"[^>]*class="[^"]*sync-btn/;
console.log('a refresh button on every tab');
for (const tab of TABS) {
    // Overview is rendered from JS, so its button lives in the template string.
    const inStatic = new RegExp(`id="section-${tab}"[\\s\\S]*?sync-btn`).test(html);
    const inTemplate = tab === 'about' && /renderAbout[\s\S]*?sync-btn/.test(render);
    check(`${tab} has one`, inStatic || inTemplate,
        inStatic ? '' : (tab === 'about' ? 'not in renderAbout template' : 'not in index.html'));
}

console.log('the buttons are actually the refresh action');
{
    const buttons = html.match(new RegExp(BTN.source, 'g')) || [];
    check('index.html holds the static ones', buttons.length >= 4, String(buttons.length));
    // Every one must call the same handler, so one implementation stays.
    const calls = html.match(/onclick="window\.syncData\(\)"/g) || [];
    check('they all call window.syncData()', calls.length >= 4, String(calls.length));
    check('render.js uses the same handler', /onclick="window\.syncData\(\)"/.test(render));
}

console.log('no duplicate id on the new buttons');
{
    const ids = [...html.matchAll(/id="(sync[A-Za-z]*)"/g)].map(m => m[1]);
    const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
    check('no repeated button ids', dupes.length === 0, dupes.join(','));
    check('members button needs no id (header is static)', !/id="syncDetailBtn"[^>]*memberTitle/.test(html));
}

console.log('accessibility');
{
    // The buttons carry only a title, so the icon needs an accessible name.
    check('members button has a title', /sync-btn[^>]*title="Reload data/.test(html));
    check('overview button has a title', /renderAbout[\s\S]*?sync-btn[^>]*title="Reload data/.test(render));
    check('the chip is a live region', /id="freshness"[^>]*aria-live="polite"/.test(html));
}

console.log('\n' + (process.exitCode ? 'FAILURES above' : 'Every tab has a refresh button.'));