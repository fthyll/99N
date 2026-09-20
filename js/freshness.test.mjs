/**
 * Tests for js/freshness.js.
 *
 * Run: node js/freshness.test.mjs
 */
import assert from 'node:assert';
import { freshness, formatWIB, newestTimestamp } from './freshness.js';

let passed = 0, failed = 0;
function check(name, fn) {
    try { fn(); console.log(`  PASS  ${name}`); passed++; }
    catch (e) { console.log(`  FAIL  ${name}: ${e.message}`); failed++; }
}

const base = new Date('2026-09-20T05:00:00Z');

check('fresh data is live', () => {
    const f = freshness('2026-09-20T02:00:00Z', base); // 3h old
    assert.strictEqual(f.state, 'live');
    assert.strictEqual(f.label, 'Data live');
    assert.match(f.sub, /3h ago/);
});

check('day-old-but-under-threshold data is still live', () => {
    const f = freshness('2026-09-19T05:00:00Z', base); // 24h old, < 30h
    assert.strictEqual(f.state, 'live');
});

check('data past staleHours is stale', () => {
    const f = freshness('2026-09-18T20:00:00Z', base); // 33h old, > 30h
    assert.strictEqual(f.state, 'stale');
    assert.strictEqual(f.label, 'Data stale');
});

check('missing timestamp is unknown, never throws', () => {
    assert.strictEqual(freshness(undefined, base).state, 'unknown');
    assert.strictEqual(freshness(null, base).state, 'unknown');
    assert.strictEqual(freshness('not-a-date', base).state, 'unknown');
});

check('WIB is UTC+7 and 24h', () => {
    // 2026-09-20T02:00:00Z -> 09:00 WIB  (Node renders "Sept" for September)
    assert.match(formatWIB(new Date('2026-09-20T02:00:00Z')), /20 Sept?, 09:00 WIB/);
    // midnight-crossing: 2026-09-19T20:00:00Z -> 03:00 WIB next day
    assert.match(formatWIB(new Date('2026-09-19T20:00:00Z')), /20 Sept?, 03:00 WIB/);
});

check('relative age buckets', () => {
    assert.match(freshness(new Date(base.getTime() - 20000).toISOString(), base).sub, /just now/);
    assert.match(freshness(new Date(base.getTime() - 45 * 60000).toISOString(), base).sub, /45m ago/);
    assert.match(freshness(new Date(base.getTime() - 3 * 86400000).toISOString(), base, 999).sub, /3d ago/);
});

check('newestTimestamp picks the latest and ignores junk', () => {
    assert.strictEqual(
        newestTimestamp('2026-09-19T12:00:00Z', '2026-09-20T03:00:00Z', undefined),
        new Date('2026-09-20T03:00:00Z').toISOString());
    // war heartbeat fresher than daily meta -> chip follows the heartbeat
    assert.match(freshness(newestTimestamp('2026-09-19T12:59:00Z', '2026-09-20T04:50:00Z'), base).sub, /11:50 WIB/);
    // all missing/invalid -> undefined -> unknown, never throws
    assert.strictEqual(newestTimestamp(undefined, null, 'nope'), undefined);
    assert.strictEqual(freshness(newestTimestamp(), base).state, 'unknown');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
