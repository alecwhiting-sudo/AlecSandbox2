#!/usr/bin/env node
// Score a hook against catchiness principles. Used for song 3's hook
// (node scripts/hook-check.mjs) and by the tests.
//
// Sources for the checks:
//  - Jakubowski et al. 2016 (earworms): common global contour + a distinctive
//    interval or repetition inside it; "optimal complexity".
//  - Burgoyne / Van Balen (Hooked, 2013-15): repetition, conventionality,
//    moderate pitch range, recognisable without accompaniment.
//  - Practitioner advice: short cell repeated with variation, call and
//    response, syncopation, state the hook early.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (name) => {
  if (typeof name === 'number') return name;
  const m = name.match(/^([A-G])(b|#)?(\d)$/);
  return (Number(m[3]) + 1) * 12 + PC[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
};

/**
 * @param {Array<Array<[number, string|number, number]>>} bars [step, note, len] per bar
 * @param {string[]} chordNames per bar  @param {Record<string, number[]>} chords MIDI notes
 * @param {number[]} scalePcs pitch classes of the key
 */
export function checkHook(bars, chordNames, chords, scalePcs) {
  const ev = bars.flatMap((b, i) => b.map(([s, n, l]) => ({ s, n: midi(n), l, bar: i })));
  const ps = ev.map((e) => e.n);
  const ints = ps.slice(1).map((p, i) => Math.abs(p - ps[i]));
  const range = Math.max(...ps) - Math.min(...ps);
  const distinct = new Set(ps.map((p) => p % 12)).size;
  const step = ints.filter((x) => x <= 2).length / ints.length;
  const leapShapes = new Set(ps.slice(1).map((p, i) => [ps[i], p]).filter(([a, b]) => Math.abs(b - a) >= 5).map(([a, b]) => `${a}>${b}`)).size;
  const maxLeap = Math.max(...ints);
  const sync = ev.filter((e) => e.s % 4 !== 0).length / ev.length;
  const rkey = (b) => JSON.stringify(b.map(([s, , l]) => [s, l]));
  const rhythmRep = bars.filter((b, i) => bars.some((bb, j) => j !== i && rkey(bb) === rkey(b))).length / bars.length;
  const cellRep = bars.filter((b, i) => bars.some((bb, j) => j !== i && JSON.stringify(bb) === JSON.stringify(b))).length / bars.length;
  const strong = ev.filter((e) => e.l >= 2 || e.s % 4 === 0);
  const pcsOf = (name) => chords[name].map((n) => n % 12);
  const ct = strong.filter((e) => pcsOf(chordNames[e.bar]).includes(e.n % 12)).length / strong.length;
  const inKey = ev.filter((e) => scalePcs.includes(e.n % 12)).length / ev.length;
  const peakAt = ev.findIndex((e) => e.n === Math.max(...ps)) / ev.length;
  const density = ev.length / bars.length;
  const first = Math.min(...bars[0].map((x) => x[0]));
  return [
    ['moderate range (7-12 semitones)', range, range >= 7 && range <= 12],
    ['few pitch classes (4-7)', distinct, distinct >= 4 && distinct <= 7],
    ['mostly steps (>= 45%)', step.toFixed(2), step >= 0.45],
    ['1-3 distinctive leaps, none over a sixth', `${leapShapes} (max ${maxLeap})`, leapShapes >= 1 && leapShapes <= 3 && maxLeap <= 9],
    ['syncopated (30-65% of onsets off the beat)', sync.toFixed(2), sync >= 0.3 && sync <= 0.65],
    ['rhythm repeats (>= 50% of bars)', rhythmRep.toFixed(2), rhythmRep >= 0.5],
    ['a cell repeats exactly, tails vary', cellRep.toFixed(2), cellRep >= 0.4 && cellRep < 1],
    ['long / on-beat notes are chord tones (>= 70%)', ct.toFixed(2), ct >= 0.7],
    ['in key (>= 90%)', inKey.toFixed(2), inKey >= 0.9],
    ['common arch contour (peak early)', peakAt.toFixed(2), peakAt <= 0.4],
    ['singable density (3-7 notes a bar)', density.toFixed(1), density >= 3 && density <= 7],
    ['stated at once (first note in the first beat)', first, first <= 2],
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { HOOK, HOOK_CHORDS, CHORDS3 } = await import('../src/song/song3.js');
  const r = checkHook(HOOK, HOOK_CHORDS, CHORDS3, [0, 2, 3, 5, 7, 9, 10]);
  for (const [name, v, ok] of r) console.log(`${ok ? 'pass' : 'FAIL'}  ${name}: ${v}`);
  console.log(`${r.filter((x) => x[2]).length}/${r.length}`);
}
