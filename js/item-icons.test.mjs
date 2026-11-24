// Run: node js/item-icons.test.mjs
//
// The player profile shows a small icon next to every troop, spell, hero and
// hero-equipment name. The icons are local WebP files listed in
// js/coc-assets.js, so this checks three things: every item the archived
// profiles mention has an icon, every listed icon exists on disk, and the
// renderer emits the icon without letting a name smuggle in markup.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COC_ITEM_IMAGES } from './coc-assets.js';
import { renderPlayerProfile } from './player-profile.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every mapped name must point at a real WebP file.
for (const [name, path] of Object.entries(COC_ITEM_IMAGES)) {
    assert.ok(existsSync(join(root, path)), `missing asset for ${name}: ${path}`);
    const bytes = readFileSync(join(root, path));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', path);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', path);
}

// Every item the archived profiles reference must be covered by the pack.
const profiles = JSON.parse(readFileSync(join(root, 'data', 'player_profiles.json'), 'utf8'));
const referenced = new Set();
for (const profile of Object.values(profiles.players || {})) {
    for (const list of ['troops', 'spells', 'heroes', 'heroEquipment']) {
        for (const item of profile[list] || []) referenced.add(item.name);
    }
    for (const hero of profile.heroes || []) {
        for (const item of hero.equipment || []) referenced.add(item.name);
    }
}
const uncovered = [...referenced].filter(name => !COC_ITEM_IMAGES[name]);
assert.deepEqual(uncovered, [], `items without an icon: ${uncovered.join(', ')}`);

// The renderer puts the icon next to the name.
const html = renderPlayerProfile({
    tag: '#P1', name: 'Player', townHallLevel: 18,
    troops: [{ name: 'Barbarian', level: 6, maxLevel: 14 }],
    spells: [{ name: 'Lightning Spell', level: 10, maxLevel: 14 }],
    heroes: [{ name: 'Barbarian King', level: 64, maxLevel: 115 }],
    heroEquipment: [{ name: 'Spiky Ball', level: 25, maxLevel: 27 }],
});
assert.match(html, /<img class="item-icon" src="assets\/coc\/barbarian\.webp"/);
assert.match(html, /<img class="item-icon" src="assets\/coc\/lightning-spell\.webp"/);
assert.match(html, /<img class="item-icon" src="assets\/coc\/barbarian-king\.webp"/);
assert.match(html, /<img class="item-icon" src="assets\/coc\/spiky-ball\.webp"/);
assert.match(html, /class="profile-item-name"><img class="item-icon"[^>]*><span>Barbarian<\/span>/);

// An item with no icon renders no broken <img>, and its name stays escaped.
const unknown = renderPlayerProfile({
    tag: '#P2', name: 'Player', townHallLevel: 18,
    troops: [{ name: '<img src=x onerror=alert(1)>', level: 1, maxLevel: 2 }],
});
assert.doesNotMatch(unknown, /<img src=x/);
assert.match(unknown, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(unknown, /item-icon/);

console.log(`PASS: ${Object.keys(COC_ITEM_IMAGES).length} item icons, ${referenced.size} referenced items covered`);
