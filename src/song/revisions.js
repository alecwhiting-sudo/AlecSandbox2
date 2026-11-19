// Changes made to the song by Claude in chat, after people may already have
// edited their own copy in the app. Each revision is a list of edit ops (see
// applyOps in src/ui/ask.js). The app applies any revision a saved song
// hasn't had yet, so your own tweaks are kept. Add new revisions at the end.

import { applyOps } from '../ui/ask.js';
import { laneEvents, buildSong } from './song.js';

// Bars/steps: the intro is bars 0-31 (steps 0-511); the build starts at bar 32.
const roll = [];
for (let s = 480; s < 496; s += 2) roll.push({ s, n: 6, v: 0.3 + (s - 480) / 64, l: 1, r: 0 });     // 8ths, bar 31
for (let s = 496; s < 512; s++) roll.push({ s, n: 6, v: 0.55 + (s - 496) / 36, l: 1, r: 0 });      // 16ths, bar 32

export const REVISIONS = [
  {
    id: 'r1-intro',
    summary: 'Livelier intro: a sparse dub stab every 8 beats, and anticipation into the build (riser, filter lift, snare roll, kick drops for the last bar)',
    ops: [
      // A dark dub chord stab on the "and" of beat 2, once every 8 beats.
      { op: 'newpart', track: 'stabs', part: 'INTRO', len: 32, add: [{ s: 6, n: 'C', v: 0.7, l: 2, r: 0.1 }] },
      { op: 'part', track: 'stabs', section: 'intro', part: 'INTRO', energy: 0.5 },
      // Kick plays four to the floor, then drops out for the intro's last bar.
      { op: 'newpart', track: 'kick', part: 'INTRO', len: 512, tile: 'A', removeRange: [496, 512] },
      { op: 'part', track: 'kick', section: 'intro', part: 'INTRO' },
      // Percussion keeps its rims and adds a snare roll over the last 2 bars.
      { op: 'newpart', track: 'perc', part: 'INTRO', len: 512, tile: 'A', add: roll },
      { op: 'part', track: 'perc', section: 'intro', part: 'INTRO' },
      // An 8-bar riser into the build.
      { op: 'newpart', track: 'fx', part: 'INTRO', len: 512, add: [{ s: 384, n: 0, v: 0.85, l: 128, r: 0 }] },
      { op: 'part', track: 'fx', section: 'intro', part: 'INTRO', energy: 0.75 },
      // Filter opens over the last 8 bars of the intro.
      { op: 'curve', curve: 'filter', from: 24, to: 24, value: 0.5 },
      { op: 'curve', curve: 'filter', from: 31, to: 31, value: 0.85 },
    ],
  },
];


// ---------------------------------------------------------------- draft 2 helpers
// Build events bar by bar: [[fromBar, toBar, ...lanes], ...] where each lane
// is one bar (16 steps) of the usual pattern notation.
function bars(track, specs) {
  const out = [];
  for (const [from, to, ...lanes] of specs) {
    const ev = laneEvents(track, { len: 16, lanes });
    for (let b = from; b <= to; b++) for (const e of ev) out.push({ ...e, s: b * 16 + e.s, r: e.r ?? 0.05 });
  }
  return out;
}
const N = { F4: 65, G4: 67, Ab4: 68, Bb4: 70, C5: 72, Db5: 73, Eb5: 75, F5: 77, Eb4: 63 };
// The lead melody over the drop's chords, 16 bars, all in F minor (no Gb).
// [bar, step, note, length in steps]
const MELODY = [
  // Fm9
  [0, 0, 'C5', 3], [0, 3, 'Ab4', 2], [0, 6, 'F4', 3], [0, 10, 'G4', 2], [0, 12, 'Ab4', 4],
  [1, 0, 'C5', 2], [1, 4, 'Eb5', 3], [1, 8, 'C5', 2], [1, 12, 'Ab4', 4],
  [2, 0, 'C5', 3], [2, 3, 'Ab4', 2], [2, 6, 'F4', 3], [2, 10, 'Eb4', 2], [2, 12, 'F4', 4],
  [3, 0, 'G4', 6], [3, 8, 'Ab4', 3], [3, 12, 'C5', 4],
  // Dbmaj7#11
  [4, 0, 'F5', 3], [4, 3, 'Eb5', 2], [4, 6, 'C5', 4], [4, 12, 'Ab4', 4],
  [5, 0, 'Db5', 4], [5, 6, 'C5', 2], [5, 10, 'Ab4', 2], [5, 12, 'F4', 4],
  [6, 0, 'G4', 3], [6, 3, 'Ab4', 3], [6, 6, 'C5', 6], [6, 14, 'Db5', 2],
  [7, 0, 'C5', 10], [7, 12, 'Ab4', 4],
  // Bbm11
  [8, 0, 'Bb4', 3], [8, 3, 'Db5', 3], [8, 6, 'F5', 6], [8, 12, 'Eb5', 4],
  [9, 0, 'Db5', 4], [9, 6, 'Bb4', 2], [9, 10, 'Ab4', 2], [9, 12, 'F4', 4],
  [10, 0, 'Ab4', 3], [10, 3, 'Bb4', 3], [10, 6, 'Db5', 4], [10, 12, 'Eb5', 4],
  [11, 0, 'F5', 10], [11, 12, 'Eb5', 4],
  // Gbmaj7 (and C7b9 the second time round): Bb, Db, F, Eb only
  [12, 0, 'Db5', 3], [12, 3, 'Bb4', 3], [12, 6, 'F4', 6], [12, 12, 'Bb4', 4],
  [13, 0, 'Eb5', 4], [13, 6, 'Db5', 2], [13, 10, 'Bb4', 2], [13, 12, 'Db5', 4],
  [14, 0, 'F5', 6], [14, 8, 'Eb5', 4], [14, 12, 'Db5', 4],
  [15, 0, 'Bb4', 8], [15, 10, 'C5', 2], [15, 12, 'Db5', 2], [15, 14, 'Eb5', 2],
];
const melodyEvents = (accent = 0) => MELODY.map(([b, s, n, l]) => ({ s: b * 16 + s, n: N[n], v: (s === 0 ? 0.85 : 0.68) + accent, l, r: 0 }));
// Peak: the same melody with 16th pickups into longer notes (busier, not new).
function busier() {
  const ev = melodyEvents(0.05);
  const scale = [63, 65, 67, 68, 70, 72, 73, 75, 77];
  const extra = [];
  for (let i = 0; i < ev.length - 1; i++) {
    const a = ev[i], b = ev[i + 1];
    if (b.s - a.s >= 4 && (i % 2 === 0)) {
      const k = scale.indexOf(b.n);
      const pick = scale[k > 0 ? k - 1 : k + 1];
      extra.push({ s: b.s - 1, n: pick, v: 0.5, l: 1, r: 0.2 });
    }
  }
  return [...ev, ...extra];
}

// ---------------------------------------------------------------- draft 2
const D2 = [
  // --- sound fixes
  { op: 'param', track: 'kick', key: 'decay', value: 0.24 },
  { op: 'param', track: 'kick', key: 'punch', value: 4.2 },
  { op: 'param', track: 'kick', key: 'drive', value: 0.3 },
  { op: 'mix', track: 'toms', key: 'drive', value: 0.04 },
  { op: 'mix', track: 'toms', key: 'hp', value: 42 },
  { op: 'mix', track: 'toms', key: 'cutFreq', value: 330 },
  { op: 'mix', track: 'toms', key: 'cutDb', value: -7 },
  { op: 'mix', track: 'toms', key: 'cutQ', value: 1.1 },
  { op: 'param', track: 'toms', key: 'skin', value: 0.18 },
  // --- lead: clean, in tune, resonant filter that can sweep
  { op: 'patch', track: 'lead', preset: 'acid-stab', over: {
    osc: [{ on: true, type: 'saw', level: 0.7, octave: 0 }, { on: true, type: 'square', level: 0.35, octave: 0, fine: 6 }, { on: false }],
    sub: { level: 0 }, noise: { level: 0.02 }, drift: 1.5, pitchEnv: { amount: 0 },
    amp: { a: 0.004, d: 0.5, s: 0.55, r: 0.28 }, fenv: { a: 0.002, d: 0.32, s: 0.15, r: 0.3 },
    filterA: { type: 'ladder', cutoff: 520, res: 0.68, drive: 0.25, env: 3.4, key: 0.5, follow: 0.4 },
    filterB: { type: 'svf-hp12', cutoff: 180 }, colour: { mode: 'tape', drive: 0.25 },
  } },
  { op: 'mix', track: 'lead', key: 'res', value: 0.45 },
  { op: 'mix', track: 'lead', key: 'lp', value: 9000 },
  { op: 'mix', track: 'lead', key: 'delay', value: 0.42 },
  { op: 'newpart', track: 'lead', part: 'M16', len: 256, add: melodyEvents() },
  { op: 'newpart', track: 'lead', part: 'M16B', len: 256, add: busier() },
  { op: 'part', track: 'lead', section: 'drop', part: 'M16', energy: 0.9 },
  { op: 'part', track: 'lead', section: 'peak', part: 'M16B', energy: 0.85 },
  // --- filter sweeps for drama (multipliers on each track's low-pass)
  { op: 'curve', curve: 'lp:lead', points: [[112, 0.12], [120, 0.45], [128, 1.1], [132, 0.4], [140, 1.2], [144, 0.5], [152, 1.1], [160, 0.45], [168, 1.25], [176, 0.3]] },
  { op: 'mix', track: 'stabs', key: 'res', value: 0.35 },
  { op: 'curve', curve: 'lp:stabs', points: [[0, 0.3], [32, 0.55], [64, 0.35], [72, 0.9], [80, 0.4], [88, 1], [96, 0.9], [112, 0.25], [113, 0.7], [144, 0.5], [152, 1.1], [160, 0.6], [168, 1.2], [176, 0.5]] },
  { op: 'mix', track: 'pads', key: 'res', value: 0.25 },
  { op: 'curve', curve: 'lp:pads', points: [[96, 0.12], [111, 1], [113, 0.55], [128, 1], [144, 0.6], [176, 0.3]] },
  { op: 'curve', curve: 'lp:hats', points: [[0, 0.3], [8, 0.4], [24, 1], [96, 1], [176, 1], [212, 0.35]] },
  { op: 'curve', curve: 'lp:toms', points: [[0, 0.7], [32, 1], [176, 1], [212, 0.6]] },

  // --- phrase fills (last bar of every 8): kick drops a beat, rolls, flurries
  { op: 'newpart', track: 'kick', part: 'F', len: 16, add: bars('kick', [[0, 0, 'x...x...x.......']]) },
  { op: 'newpart', track: 'toms', part: 'F', len: 16, add: bars('toms', [[0, 0, '..a.ab.bc.cdc.dD']]) },
  { op: 'newpart', track: 'perc', part: 'F', len: 16, add: bars('perc', [[0, 0, '....c.......c.nN', 'ssssssssssssssss', '...........k.k.k']]) },
  { op: 'newpart', track: 'hats', part: 'F', len: 16, add: bars('hats', [[0, 0, 'g.c.g.c.ccccOccO']]) },
  ...['A', 'B'].map((p) => ({ op: 'fill', track: 'kick', part: p, fill: 'F', every: 8 })),
  ...['A', 'B'].map((p) => ({ op: 'fill', track: 'toms', part: p, fill: 'F', every: 8 })),
  ...['B', 'C', 'E'].map((p) => ({ op: 'fill', track: 'perc', part: p, fill: 'F', every: 8 })),
  ...['B', 'C'].map((p) => ({ op: 'fill', track: 'hats', part: p, fill: 'F', every: 8 })),

  // --- intro: 32 evolving bars (new layers every 8 bars, fills, no loops)
  { op: 'newpart', track: 'kick', part: 'I2', len: 512, add: bars('kick', [
    [0, 6, 'x...x...x...x...'], [7, 7, 'x...x...x.......'], [8, 14, 'x...x...x...x...'], [15, 15, 'x...x...x.....x.'],
    [16, 22, 'x...x...x...x...'], [23, 23, 'x...x...x.......'], [24, 30, 'x...x...x...x...']]) }, // bar 32 rests
  { op: 'part', track: 'kick', section: 'intro', part: 'I2' },
  { op: 'newpart', track: 'toms', part: 'I2', len: 512, add: bars('toms', [
    [0, 3, '..a.......a.....'], [4, 6, '..a.......a...a.'], [7, 7, '..a.....a.b.c.d.'],
    [8, 14, '..a...a...a..b.a'], [15, 15, '..a...a.b.b.c.cd'],
    [16, 22, '..a...a...a.c.a.'], [23, 23, '..a.ab.bc.cdc.dD'],
    [24, 30, '..a.a.a.b.a.a.b.'], [31, 31, '..a.....b...c.d.']]) },
  { op: 'part', track: 'toms', section: 'intro', part: 'I2', energy: 0.7 },
  { op: 'newpart', track: 'hats', part: 'I2', len: 512, add: bars('hats', [
    [7, 7, '............p.p.'], [8, 15, '..c...c...c...c.'], [16, 23, 'g.c.g.c.g.c.g.cg'],
    [24, 30, 'g.c.g.O.g.c.g.Og'], [31, 31, 'gcgcgcgcccccOcOc']]) },
  { op: 'part', track: 'hats', section: 'intro', part: 'I2', energy: 0.75 },
  { op: 'newpart', track: 'perc', part: 'I2', len: 512, add: [
    ...bars('perc', [[3, 3, '..........k..k.k'], [7, 7, '..........k..k.k'], [11, 11, '...............g'], [15, 15, 'b.........k..k.k'],
      [19, 19, '...............g'], [23, 23, 'b.........k..k.k'], [27, 27, '...............g']]),
    // rim polyrhythm (every 3 steps) from bar 5, shaker 8ths from bar 17
    ...Array.from({ length: Math.floor((512 - 64) / 3) }, (_, i) => ({ s: 64 + i * 3, n: 1, v: 0.55, l: 1, r: 0.05 })),
    ...bars('perc', [[16, 31, 's.s.s.s.s.s.s.s.']]),
    // snare roll over the last 2 bars
    ...Array.from({ length: 8 }, (_, i) => ({ s: 480 + i * 2, n: 6, v: 0.3 + i * 0.03, l: 1, r: 0 })),
    ...Array.from({ length: 16 }, (_, i) => ({ s: 496 + i, n: 6, v: 0.55 + i * 0.028, l: 1, r: 0 })),
  ] },
  { op: 'part', track: 'perc', section: 'intro', part: 'I2', energy: 0.75 },
  { op: 'newpart', track: 'sub', part: 'I2', len: 512, add: bars('sub', [[16, 31, '..r.......r.....']]).filter((e, i) => i % 2 === 0) },
  { op: 'part', track: 'sub', section: 'intro', part: 'I2', energy: 0.6 },
  { op: 'newpart', track: 'stabs', part: 'I2', len: 512, add: [
    ...bars('stabs', [[0, 15, '......c.........']]).filter((e) => (e.s >> 4) % 2 === 0),        // every 8 beats
    ...bars('stabs', [[16, 30, '......c.........']]).filter((e) => (e.s >> 4) % 2 === 0),
    ...bars('stabs', [[16, 30, '..............c.']]).filter((e) => (e.s >> 4) % 4 === 3),        // an answer every 4 bars
  ] },
  { op: 'part', track: 'stabs', section: 'intro', part: 'I2', energy: 0.55 },
  { op: 'newpart', track: 'fx', part: 'I2', len: 512, add: [
    { s: 0, n: 2, v: 0.6, l: 64, r: 0 }, { s: 252, n: 3, v: 0.5, l: 4, r: 0 }, { s: 384, n: 0, v: 0.85, l: 128, r: 0 }] },
  { op: 'part', track: 'fx', section: 'intro', part: 'I2', energy: 0.75 },

  // --- build: everything keeps moving across its 32 bars
  { op: 'newpart', track: 'toms', part: 'B2', len: 512, add: bars('toms', [
    [0, 2, '..a.a.a.b.a.a.b.'], [3, 3, '..a.a.a.b.b.c.c.'], [4, 6, '..a.a.a.c.a.b.aD'], [7, 7, '..a.ab.bc.cdc.dD'],
    [8, 10, '..a.a.ab..a.a.b.'], [11, 11, 'a.a.a.a.b.b.c.c.'], [12, 14, '..a.a.ab..a.c.ad'], [15, 15, '..a.ab.bc.cdc.dD'],
    [16, 22, '..a.a.a.b.a.a.b.'], [23, 23, 'a.ab.bc.cdc.dDdD'], [24, 30, '..a.aba.b.a.abcd'], [31, 31, 'ababcdcdababcdcD']]) },
  { op: 'part', track: 'toms', section: 'build', part: 'B2', energy: 0.85 },
  { op: 'newpart', track: 'hats', part: 'B2', len: 512, add: bars('hats', [
    [0, 7, 'g.c.g.c.g.c.g.cg'], [8, 15, 'g.c.g.O.g.c.g.Og'], [16, 30, 'gcgOgcgcgcgOgcgc'], [31, 31, 'cccccccccccccccc']]) },
  { op: 'part', track: 'hats', section: 'build', part: 'B2', energy: 0.8 },
  { op: 'newpart', track: 'perc', part: 'B2', len: 512, add: [
    ...Array.from({ length: Math.floor(512 / 3) }, (_, i) => ({ s: i * 3, n: 1, v: 0.55, l: 1, r: 0.05 })),
    ...bars('perc', [[0, 31, 's.s.s.s.s.s.s.s.'], [8, 31, '...k..k....k.k..'], [16, 31, '....c.......c...'],
      [7, 7, '...............g'], [15, 15, 'b..........g.g.g'], [23, 23, 'b.........k..k.k']]),
    ...Array.from({ length: 16 }, (_, i) => ({ s: 496 + i, n: 6, v: 0.5 + i * 0.03, l: 1, r: 0 })),
  ] },
  { op: 'part', track: 'perc', section: 'build', part: 'B2', energy: 0.8 },
  { op: 'newpart', track: 'stabs', part: 'B2', len: 512, add: [
    ...bars('stabs', [[0, 15, '..c.......c.....']]).filter((e) => (e.s >> 4) % 2 === 0),
    ...bars('stabs', [[16, 31, '..c.....c..c....']]),
  ] },
  { op: 'part', track: 'stabs', section: 'build', part: 'B2', energy: 0.65 },
];
REVISIONS.push({
  id: 'r2-draft2',
  summary: 'Draft 2: tighter kick, cleaner toms (less drive, low-mid cut), new in-key lead with a resonant filter and sweeps, filter sweeps on stabs and pads, fills every 8 bars, evolving 32-bar intro and build',
  ops: D2,
});

/** Apply revisions the song hasn't had. Returns the summaries applied. */
export function applyRevisions(song, list = REVISIONS) {
  song.revisions = song.revisions ?? [];
  const applied = [];
  for (const r of list) {
    if (song.revisions.includes(r.id)) continue;
    if (r.ops) applyOps(song, r.ops);
    if (r.apply) r.apply(song);
    song.revisions.push(r.id);
    applied.push(r.summary);
  }
  return applied;
}

// The percussion sequence as Claude last wrote it (base song + every revision
// before `upto`), ignoring any edits made in the app.
function referencePerc(upto) {
  const ref = buildSong();
  for (const r of REVISIONS) {
    if (r.id === upto) break;
    if (r.ops) applyOps(ref, r.ops);
    if (r.apply) r.apply(ref);
  }
  return { parts: ref.parts.perc, arrangement: ref.arrangement.perc };
}
REVISIONS.push({
  id: 'r3-perc-restore',
  summary: 'Percussion sequence put back to how it was before your edits (the bell is now a short snap instead of a ring)',
  apply(song) {
    const ref = referencePerc('r3-perc-restore');
    song.parts.perc = structuredClone(ref.parts);
    song.arrangement.perc = structuredClone(ref.arrangement);
  },
});
