// Run: node js/warmerge.test.mjs
import { mergeWarLog } from './warmerge.js';

const check = (name, cond) => {
    if (cond) console.log('PASS  ' + name);
    else { console.log('FAIL  ' + name); process.exitCode = 1; }
};

const side = (stars, dest, attacks) => ({ stars, destructionPercentage: dest, attacks });
const snapshot = (endTime, state, stars, dest) => ({
    endTime, startTime: endTime.slice(0, 8) + 'T000000.000Z', state,
    teamSize: 10, attacksPerMember: 2,
    clan: { ...side(stars, dest, 6), members: [{ tag: '#A', attacks: [{ stars: 2 }] }] },
    opponent: side(20, 50.0, 8),
});
const logged = (endTime, result, stars, dest) => ({
    endTime, result, teamSize: 10, attacksPerMember: 2,
    clan: side(stars, dest, 12), opponent: side(20, 50.0, 14),
});

console.log('finalising a finished war');
{
    // The live endpoint stops returning a war the moment the next one starts,
    // so its last snapshot is frozen at inWar with a partial score.
    const wars = [snapshot('20260921T073745.000Z', 'inWar', 24, 89.9)];
    const extra = mergeWarLog(wars, [logged('20260921T073747.000Z', 'lose', 26, 93.5)]);
    check('one- or two-second endTime drift still pairs the war', wars.length === 1, 'war count ' + wars.length);
    check('stale snapshot is promoted to warEnded', wars[0].state === 'warEnded');
    check('warlog result overrides the partial score',
        wars[0].clan.stars === 26 && wars[0].clan.destructionPercentage === 93.5,
        `got ${wars[0].clan.stars}s/${wars[0].clan.destructionPercentage}%`);
    check('per-player roster survives the upgrade', wars[0].clan.members.length === 1);
    check('attack count is finalised too, not the last poll\'s',
        wars[0].clan.attacks === 12, 'got ' + wars[0].clan.attacks);
    check('the paired warlog entry is not listed twice', extra.length === 0, 'extra ' + extra.length);
}

console.log('a war still running');
{
    const wars = [snapshot('20260930T234755.000Z', 'inWar', 0, 0.0)];
    const extra = mergeWarLog(wars, []);
    check('untouched while no result exists', wars[0].state === 'inWar' && extra.length === 0);
}

console.log('a war older than the warlog window');
{
    const wars = [snapshot('20250101T000000.000Z', 'inWar', 10, 20.0)];
    mergeWarLog(wars, [logged('20260921T073747.000Z', 'lose', 26, 93.5)]);
    check('stays undecided rather than guessing a result', wars[0].state === 'inWar');
}

console.log('wars with no snapshot');
{
    const extra = mergeWarLog([], [logged('20260929T054454.000Z', 'win', 30, 100.0)]);
    check('surfaced as a summary-only pseudo-war', extra.length === 1 && extra[0].summaryOnly === true);
    check('pseudo-war is decided and dated', extra[0].state === 'warEnded' && extra[0].startTime === extra[0].endTime);
    check('pseudo-war filename is unique', extra[0].filename === 'warlog_20260929T054454.000Z', extra[0].filename);
}

console.log('a snapshot the archive already decided');
{
    const wars = [snapshot('20260917T041524.000Z', 'warEnded', 29, 99.2)];
    const extra = mergeWarLog(wars, [logged('20260917T041524.000Z', 'lose', 29, 99.2)]);
    check('keeps the richer snapshot', wars[0].clan.stars === 29);
    check('and does not duplicate it in the list', extra.length === 0, 'extra ' + extra.length);
}

console.log('degenerate input');
{
    const wars = [snapshot('20260924T094625.000Z', 'inWar', 28, 95.5)];
    check('no warlog at all is a no-op', mergeWarLog(wars, undefined).length === 0 && wars[0].state === 'inWar');
    check('entries missing endTime are skipped',
        mergeWarLog([], [{ result: 'win', clan: side(30, 100, 12), opponent: side(20, 50, 14) }]).length === 0);
}

console.log(process.exitCode ? '\nFAILURES' : '\nAll warmerge checks passed.');
