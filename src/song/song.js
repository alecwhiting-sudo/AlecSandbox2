// THE song. 130 BPM, F minor, ~6:31. Old-school minimal Detroit techno with a
// Swedish pump, built up to a central washy drop. Everything else in the app
// edits the JSON this file produces.
//
// Pattern notation (one character per 16th step, spaces ignored):
//   '.' rest; a letter = a hit; UPPERCASE = accent.
//   Drum letters map to sounds per track (see TOKENS). Tonal tracks use
//   'C' (current chord) and 'R' (chord root in the sub range).
// A part is { len: steps, lanes: [strings...] } and/or explicit events.

import { stabPatch } from '../engine/tonal.js';

export const TOKENS = {
  kick: { x: [null, 0.95] },                                   // note from track params
  toms: { a: [36, 0.85], b: [39, 0.8], c: [41, 0.8], d: [44, 0.75] }, // C2 Eb2 F2 Ab2
  sub: { r: ['R', 0.8] },
  hats: { c: [0, 0.6], o: [1, 0.65], p: [2, 0.45], g: [0, 0.32] },
  perc: { c: [0, 0.8], r: [1, 0.6], s: [2, 0.32], k: [3, 0.6], b: [4, 0.45], g: [5, 0.55], n: [6, 0.75] },
  stabs: { c: ['C', 0.75] },
  lead: {},
  fx: {},
};

// Discordant minor vocabulary (MIDI notes).
export const CHORDS = {
  Fm9: [53, 56, 60, 63, 67],          // F Ab C Eb G
  'Fm(b9)': [53, 54, 56, 60],         // F Gb Ab C  - cluster
  'Dbmaj7#11': [49, 53, 60, 67],      // Db F C G
  Bbm11: [46, 49, 56, 63],            // Bb Db Ab Eb
  Gbmaj7: [54, 58, 61, 65],           // Neapolitan: tension
  'C7b9': [48, 52, 58, 61],           // dominant with b9
  'F quartal': [53, 58, 63, 68],      // F Bb Eb Ab
};

// [bars, chord] cycles per section.
const PROG = {
  intro: [[4, 'Fm9']],
  build: [[4, 'Fm9']],
  groove: [[2, 'Fm9'], [1, 'Fm(b9)'], [1, 'Dbmaj7#11']],
  breakdown: [[8, 'Fm9'], [4, 'Gbmaj7'], [4, 'C7b9']],
  drop: [[4, 'Fm9'], [4, 'Dbmaj7#11'], [4, 'Bbm11'], [4, 'Gbmaj7'], [4, 'Fm9'], [4, 'Dbmaj7#11'], [4, 'Bbm11'], [4, 'C7b9']],
  peak: [[2, 'F quartal'], [1, 'Fm(b9)'], [1, 'Dbmaj7#11']],
  outro: [[4, 'Fm9']],
};

const SECTIONS = [
  { id: 'intro', name: 'Intro', bars: 32 },
  { id: 'build', name: 'Build', bars: 32 },
  { id: 'groove', name: 'Groove', bars: 32 },
  { id: 'breakdown', name: 'Breakdown', bars: 16 },
  { id: 'drop', name: 'Drop', bars: 32 },
  { id: 'peak', name: 'Peak', bars: 32 },
  { id: 'outro', name: 'Outro', bars: 36 },
];

// ---------------------------------------------------------------- tracks
const TRACKS = [
  { id: 'kick', name: 'Kick', instrument: 'kick', params: { note: 29, decay: 0.42, punch: 5, click: 0.5, drive: 0.45 },
    mix: { filterFollow: 0.3, gain: 0, pan: 0, lp: 16000, hp: 25, drive: 0, delay: 0, reverb: 0.02, duck: 0, duckRelease: 0.1 } },
  { id: 'toms', name: 'Toms', instrument: 'toms', params: { decay: 0.36, sweep: 0.05, drop: 0.8, skin: 0.3 },
    mix: { gain: -3, pan: 0, lp: 9000, hp: 35, drive: 0.25, delay: 0.06, reverb: 0.06, duck: 0.35, duckRelease: 0.12 } },
  { id: 'sub', name: 'Sub stabs', instrument: 'sub', params: { harm: 0.18, release: 0.08 },
    mix: { gain: -7, pan: 0, lp: 400, hp: 20, drive: 0.2, delay: 0, reverb: 0, duck: 0.85, duckRelease: 0.16 } },
  { id: 'hats', name: 'Hats', instrument: 'hats', params: { tune: 1.6, tone: 0.55, noise: 0.35, open: 0.26, closed: 0.04, width: 0.4 },
    mix: { filterFollow: 0.15, gain: -9, pan: 0.08, lp: 17000, hp: 500, drive: 0.1, delay: 0.08, reverb: 0.08, duck: 0.25, duckRelease: 0.1 } },
  { id: 'perc', name: 'Percussion', instrument: 'perc', params: { clapTone: 1 },
    mix: { filterFollow: 0.5, gain: -7, pan: -0.05, lp: 15000, hp: 140, drive: 0.15, delay: 0.16, reverb: 0.14, duck: 0.3, duckRelease: 0.12 } },
  { id: 'stabs', name: 'Stabs', instrument: 'poly',
    params: { patch: stabPatch('dub-chord', { gate: 0.3, delay: { send: 0 }, reverb: { send: 0 }, texture: { crackle: 0 }, comp: { amount: 0 }, limiter: { on: false } }) },
    mix: { gain: 2, pan: 0, lp: 5200, hp: 160, drive: 0.15, delay: 0.5, reverb: 0.25, duck: 0.65, duckRelease: 0.2 } },
  { id: 'pads', name: 'Pads', instrument: 'poly',
    params: { maxVoices: 16, patch: stabPatch('detroit-strings', { amp: { a: 1.4, d: 2, s: 0.8, r: 2.5 }, fenv: { a: 1.2, d: 3, s: 0.6 }, filterA: { cutoff: 900, env: 2, res: 0.2 }, chorus: { mix: 0.8, mode: 'ensemble' } }) },
    mix: { gain: 0, pan: 0, lp: 6500, hp: 200, drive: 0, delay: 0.12, reverb: 0.65, duck: 0.75, duckRelease: 0.24 } },
  { id: 'lead', name: 'Lead', instrument: 'poly',
    params: { maxVoices: 6, patch: stabPatch('cz-reso', { amp: { a: 0.004, d: 0.5, s: 0.3, r: 0.3 } }) },
    mix: { gain: -3, pan: 0.1, lp: 7000, hp: 250, drive: 0.1, delay: 0.38, reverb: 0.35, duck: 0.5, duckRelease: 0.18 } },
  { id: 'fx', name: 'FX & noise', instrument: 'fx', params: {},
    mix: { gain: -10, pan: 0, lp: 16000, hp: 150, drive: 0, delay: 0.1, reverb: 0.5, duck: 0.3, duckRelease: 0.15 } },
];

// ---------------------------------------------------------------- parts
const P = (len, ...lanes) => ({ len, lanes });
const PARTS = {
  kick: {
    A: P(16, 'x...x...x...x...'),
    B: P(16, 'x...x...x...x..x'),
  },
  toms: { // the "bassline": offbeat rolls against the kick
    A: P(32, '..a...a...a..b.a', '..a...a...a.c.a.'),
    B: P(32, '..a.a.a.b.a.a.b.', '..a.a.a.c.a.b.aD'),
    C: P(16, '..a.....a.......'),
  },
  sub: {
    A: P(32, '..r.......r.....', '......r.........'),
    B: P(16, '..r...r...r..r..'),
  },
  hats: {
    A: P(16, '..c...c...c...c.'),
    B: P(16, 'g.c.g.c.g.c.g.cg'),
    C: P(16, 'gcgOgcgcgcgOgcgc'),
    D: P(16, 'g.p.g.O.g.p.g.Og'),
  },
  perc: {
    A: P(32, 'r.....r.....r...r.....r.....r...'),                       // rim, sparse
    B: P(32, 'r..r..r..r..r..r..r..r..r..r..r.', '....c.......c.......c.......c...', 's.s.s.s.s.s.s.s.s.s.s.s.s.s.s.s.'),
    C: P(32, 'r..r..r..r..r..r..r..r..r..r..r.', '....c.......c.......c.......c...', 'ssssssssssssssssssssssssssssssss', '...k..k....k.k.....k..k...k..k..', '.......b...............b.......g'),
    D: P(32, '................................', '....c.......c.......c.......c...', 's.s.s.s.s.s.s.s.s.s.s.s.s.s.s.s.'),
    E: P(64, 'r..r..r..r..r..r..r..r..r..r..r..r..r..r..r..r..r..r..r..r..r..r.', '....c.......c.......c.......c.......c.......c.......c.......c..nn', 'ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss', '...k..k....k.k.....k..k...k..k.....k..k....k.k.....k..k..k.k.k.k', '.......b.......b.......b...g...b.......b.......b.......b...g.g.g'),
  },
  stabs: {
    A: P(32, '..c.....c..c....', '......c.........'),                        // dub offbeats
    B: P(16, '..c..c....c..c..'),
    C: P(64, '..C.............', '................', '........c.......', '................'), // sparse in the breakdown
  },
  pads: { HOLD: { len: 16, follow: 'chords' } },                                    // one chord per change
  lead: {
    A: { len: 32, events: [ // Detroit-ish motif with a b9 rub (Gb)
      { s: 0, n: 72, v: 0.8, l: 3 }, { s: 3, n: 68, v: 0.7, l: 2 }, { s: 6, n: 65, v: 0.7, l: 3 }, { s: 10, n: 63, v: 0.65, l: 2 },
      { s: 12, n: 66, v: 0.7, l: 2 }, { s: 14, n: 65, v: 0.75, l: 4 }, { s: 18, n: 68, v: 0.7, l: 2 }, { s: 20, n: 72, v: 0.8, l: 2 },
      { s: 22, n: 73, v: 0.75, l: 3 }, { s: 26, n: 72, v: 0.7, l: 3 }, { s: 30, n: 68, v: 0.6, l: 2 },
    ] },
    B: { len: 32, events: [ // busier answer for the peak
      { s: 0, n: 72, v: 0.8, l: 2 }, { s: 2, n: 68, v: 0.6, l: 1 }, { s: 3, n: 65, v: 0.6, l: 1 }, { s: 6, n: 72, v: 0.7, l: 2 },
      { s: 8, n: 75, v: 0.75, l: 2 }, { s: 11, n: 73, v: 0.65, l: 1 }, { s: 12, n: 72, v: 0.7, l: 2 }, { s: 14, n: 66, v: 0.7, l: 2 },
      { s: 16, n: 72, v: 0.8, l: 2 }, { s: 19, n: 68, v: 0.6, l: 1 }, { s: 22, n: 65, v: 0.7, l: 2 }, { s: 24, n: 63, v: 0.6, l: 2 },
      { s: 26, n: 65, v: 0.7, l: 2 }, { s: 28, n: 66, v: 0.7, l: 4 },
    ] },
  },
  fx: {
    RISE16: { len: 256, events: [{ s: 0, n: 0, v: 0.8, l: 256 }] },                 // 16-bar riser
    RISE8: { len: 128, events: [{ s: 0, n: 0, v: 0.7, l: 128 }] },
    WASH: { len: 512, events: [{ s: 0, n: 2, v: 0.9, l: 64 }, { s: 256, n: 3, v: 0.6, l: 8 }, { s: 504, n: 3, v: 0.5, l: 8 }] },
    GLITCH: { len: 128, events: [{ s: 60, n: 3, v: 0.5, l: 4 }, { s: 124, n: 3, v: 0.6, l: 4 }] },
    DOWN: { len: 512, events: [{ s: 0, n: 1, v: 0.7, l: 64 }] },
  },
};

// ---------------------------------------------------------------- arrangement
// [part, cell energy 0..1] per track per section. null = silent.
const ARR = {
  //          intro        build        groove       breakdown      drop          peak          outro
  kick:   [['A', 0.9], ['A', 1],    ['A', 1],    null,          ['A', 1],     ['B', 1],     ['A', 0.85]],
  toms:   [['A', 0.6], ['A', 0.8],  ['B', 0.9],  ['C', 0.3],    ['B', 0.8],   ['B', 1],     ['A', 0.55]],
  sub:    [null,       ['A', 0.6],  ['A', 0.8],  null,          ['B', 0.8],   ['B', 0.9],   ['A', 0.4]],
  hats:   [['A', 0.6], ['B', 0.7],  ['C', 0.8],  null,          ['C', 0.9],   ['C', 1],     ['B', 0.5]],
  perc:   [['A', 0.5], ['B', 0.7],  ['C', 0.85], ['D', 0.3],    ['C', 0.85],  ['E', 1],     ['A', 0.5]],
  stabs:  [null,       null,        ['A', 0.8],  ['C', 0.6],    ['B', 0.7],   ['A', 0.9],   null],
  pads:   [null,       null,        null,        ['HOLD', 0.8], ['HOLD', 1],  ['HOLD', 0.5], null],
  lead:   [null,       null,        null,        null,          ['A', 0.9],   ['B', 0.8],   null],
  fx:     [null,       ['RISE16', 0.6], ['GLITCH', 0.6], ['RISE16', 1], ['WASH', 0.8], ['GLITCH', 0.8], ['DOWN', 0.7]],
};

// Song-wide curves: [bar, value] points, linear in between.
const CURVES = {
  energy: [[0, 0.2], [32, 0.4], [64, 0.6], [96, 0.75], [97, 0.35], [112, 0.6], [113, 1], [144, 0.9], [176, 0.85], [196, 0.45], [212, 0.2]],
  swing: [[0, 0.56], [64, 0.58], [112, 0.55], [212, 0.56]],
  filter: [[0, 0.45], [48, 0.8], [64, 1], [96, 1], [104, 0.6], [112, 0.9], [113, 1], [212, 0.7]],
  wet: [[0, 0.9], [96, 1], [97, 1.4], [112, 1.3], [144, 1.1], [212, 1.2]],
  glitch: [[0, 0.1], [64, 0.3], [144, 0.6], [176, 0.3], [212, 0.1]],
};

// ---------------------------------------------------------------- compile
export function laneEvents(trackId, part) {
  const map = TOKENS[trackId] ?? {};
  const events = [];
  for (const lane of part.lanes ?? []) {
    const steps = lane.replace(/\s+/g, '');
    for (let s = 0; s < steps.length && s < part.len; s++) {
      const ch = steps[s];
      if (ch === '.') continue;
      const tok = map[ch.toLowerCase()];
      if (!tok) continue;
      const accent = ch !== ch.toLowerCase();
      events.push({ s, n: tok[0], v: Math.min(1, accent ? Math.max(0.95, tok[1] + 0.2) : tok[1]), l: trackId === 'stabs' ? 2 : 1 });
    }
  }
  return events;
}

/** Rank by metric position: lower = more essential (survives low density). */
export function autoRank(s, v) {
  const p = s % 16;
  let r = p === 0 ? 0 : p === 8 ? 0.15 : p % 4 === 0 ? 0.3 : p % 2 === 0 ? 0.5 : 0.7;
  if (v < 0.45) r += 0.15;
  // Deterministic wobble so equal positions don't all drop at once.
  r += ((s * 37) % 11) / 110;
  return Math.min(1, Math.round(r * 100) / 100);
}

/** Build the song JSON (plain data; safe to clone, save and edit). */
export function buildSong() {
  const parts = {};
  for (const [tid, ps] of Object.entries(PARTS)) {
    parts[tid] = {};
    for (const [pid, part] of Object.entries(ps)) {
      const events = [...(part.events ?? []).map((e) => ({ ...e })), ...laneEvents(tid, part)]
        .map((e) => ({ p: 1, ...e, r: e.r ?? autoRank(e.s, e.v) }))
        .sort((a, b) => a.s - b.s);
      parts[tid][pid] = { len: part.len, follow: part.follow ?? null, events };
    }
  }
  const arrangement = {};
  for (const [tid, cells] of Object.entries(ARR)) {
    arrangement[tid] = {};
    SECTIONS.forEach((sec, i) => {
      const c = cells[i];
      arrangement[tid][sec.id] = c ? { part: c[0], energy: c[1] } : null;
    });
  }
  const chords = {};
  for (const [sid, prog] of Object.entries(PROG)) chords[sid] = prog.map(([bars, name]) => ({ bars, name, notes: [...CHORDS[name]] }));
  return {
    title: 'Untitled Detroit',
    bpm: 130, key: 'F', scale: 'minor',
    sections: SECTIONS.map((s) => ({ ...s })),
    tracks: JSON.parse(JSON.stringify(TRACKS)),
    parts, arrangement, chords,
    curves: JSON.parse(JSON.stringify(CURVES)),
    master: { glue: 0.45, pump: 0.22, pumpRelease: 0.16, delayTime: '1/8d', delayFeedback: 0.55, delayGrit: 0.55, reverbDecay: 5.5, ceilingDb: -0.8, gainDb: 0 },
  };
}
