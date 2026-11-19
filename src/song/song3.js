// Song 3: "Woodward Swing". 125 BPM, C Dorian (minor with a bright major
// sixth, A), ~5:23. Detroit techno with a jazzy, upbeat swing, built around
// one hook that everything else echoes.
//
// The hook (lead, 8 bars over a Cm9 / F13 vamp): two quick Cs, a leap up a
// sixth to A (the Dorian note, the one "hook moment"), a fall back through
// G Eb F G. The call ends open on D (the 9th); the answer starts with the
// same rhythm and comes home to C; the 8th bar adds a chromatic B->C, the one
// surprise. It was scored against catchiness research (repetition with
// variation, a common arch contour with one distinctive leap, a moderate
// range, syncopation, chord tones on strong beats, stated early) - see
// scripts/hook-check.mjs, which the tests run too.
//
// The echoes:
//   toms   - the hook's opening bar, same rhythm, pitches mapped to C Eb G A
//   perc   - congas play the opening rhythm; claps on 2 and 4 for the lift
//   stabs  - organ stabs on the hook's skeleton before the lead arrives, then
//            answer the lead in its gaps (call and response)
//   sub    - roots on the hook's syncopated accents (the 3rd and 12th 16th)
//   lead   - a one-bar tease first, then the full hook, the hook at half speed
//            in the breakdown, and harmonised in sixths at the peak
//   pads   - Cm6/9 voicings that hold the hook's A

import { stabPatch } from '../engine/tonal.js';
import { compileSong, laneEvents, TOKENS } from './song.js';

const TOKENS3 = {
  ...TOKENS,
  toms: { a: [36, 0.85], b: [39, 0.8], c: [43, 0.8], d: [45, 0.75] }, // C2 Eb2 G2 A2: the hook's notes
};

export const CHORDS3 = {
  Cm9: [48, 51, 55, 58, 62],          // C Eb G Bb D
  'Cm6/9': [48, 51, 57, 62, 67],      // C Eb A D G  - holds the hook's A
  F13: [53, 57, 60, 63, 74],          // F A C Eb D
  Abmaj9: [44, 48, 55, 58, 63],       // Ab C G Bb Eb
  'G7#9': [43, 47, 53, 58],           // G B F A#
  Ebmaj9: [51, 55, 58, 62, 65],       // Eb G Bb D F
  Bbmaj9: [46, 50, 57, 60, 65],       // Bb D A C F
};

const VAMP = [[2, 'Cm9'], [2, 'F13']];
const PROG = {
  intro: VAMP,
  tease: VAMP,
  groove: VAMP,
  break: [[4, 'Cm9'], [4, 'F13'], [4, 'Cm9'], [2, 'F13'], [1, 'Abmaj9'], [1, 'G7#9']],
  drop: [[2, 'Cm6/9'], [2, 'F13']],
  peak: [[2, 'Cm6/9'], [2, 'F13'], [2, 'Cm6/9'], [1, 'F13'], [1, 'G7#9']],
  outro: VAMP,
};

const SECTIONS = [
  { id: 'intro', name: 'Intro', bars: 16 },
  { id: 'tease', name: 'Tease', bars: 16 },
  { id: 'groove', name: 'Groove', bars: 32 },
  { id: 'break', name: 'Breakdown', bars: 16 },
  { id: 'drop', name: 'Drop', bars: 32 },
  { id: 'peak', name: 'Peak', bars: 32 },
  { id: 'outro', name: 'Outro', bars: 24 },
];

// ---------------------------------------------------------------- the hook
const NOTE = { B4: 71, C5: 72, D5: 74, Eb5: 75, F5: 77, G5: 79, A5: 81 };
const X = [[0, 'C5', 1], [2, 'C5', 1], [3, 'A5', 3], [7, 'G5', 1], [8, 'Eb5', 2], [11, 'F5', 1], [12, 'G5', 3]]; // the cell
const CALL = [[3, 'F5', 1], [4, 'Eb5', 1], [6, 'D5', 6]];                      // ends open, on the 9th
const ANSWER = [[3, 'A5', 1], [4, 'G5', 1], [6, 'F5', 2], [10, 'Eb5', 1], [11, 'C5', 5]]; // comes home
const LAST = [[3, 'Eb5', 1], [4, 'D5', 1], [6, 'C5', 2], [9, 'B4', 1], [10, 'C5', 6]];   // chromatic approach
/** The 8-bar hook: [bar][[step, note, len]]. Exported for the hook check. */
export const HOOK = [X, CALL, X, ANSWER, X, CALL, X, LAST];
// as in the peak (the drop is the same with F13 in bar 8)
export const HOOK_CHORDS = ['Cm6/9', 'Cm6/9', 'F13', 'F13', 'Cm6/9', 'Cm6/9', 'F13', 'G7#9'];

/** Hook events. from = start bar; scale = time stretch (2 = half speed); harm = add a note this many scale steps below (5 = a sixth). */
function hookEvents(bars = HOOK, { scale = 1, accent = 0, harm = 0, from = 0 } = {}) {
  const dorian = [0, 2, 3, 5, 7, 9, 10];
  const below = (n) => {
    // the note `harm` steps down C Dorian (B, the chromatic note, harmonises as G)
    const pc = n % 12; let i = dorian.indexOf(pc); let oct = Math.floor(n / 12);
    if (i < 0) return n - 4;
    for (let k = 0; k < harm; k++) { i--; if (i < 0) { i = dorian.length - 1; oct--; } }
    return oct * 12 + dorian[i];
  };
  const out = [];
  bars.forEach((bar, b) => {
    for (const [s, name, l] of bar) {
      const n = NOTE[name], at = ((from + b) * 16 + s) * scale;
      const v = (s === 3 && name === 'A5' ? 0.95 : s % 4 === 0 ? 0.78 : 0.7) + accent;
      // r is low so the hook never thins out at lower density
      out.push({ s: at, n, v: Math.min(1, v), l: l * scale, r: 0.05 });
      if (harm) out.push({ s: at, n: below(n), v: Math.min(1, v) * 0.8, l: l * scale, r: 0.05 });
    }
  });
  return out;
}

// ---------------------------------------------------------------- tracks
const TRACKS = [
  { id: 'kick', name: 'Kick', instrument: 'kick', params: { note: 31, decay: 0.26, punch: 4.2, click: 0.45, drive: 0.3 },
    mix: { filterFollow: 0.3, gain: -1, pan: 0, lp: 16000, hp: 25, drive: 0, delay: 0, reverb: 0.02, duck: 0, duckRelease: 0.1 } },
  { id: 'toms', name: 'Toms (hook echo)', instrument: 'toms', params: { decay: 0.3, sweep: 0.05, drop: 0.7, skin: 0.18 },
    mix: { gain: -5, pan: -0.15, lp: 8000, hp: 45, drive: 0.04, delay: 0.12, reverb: 0.08, duck: 0.35, duckRelease: 0.12, cutFreq: 320, cutDb: -6, cutQ: 1.1 } },
  { id: 'sub', name: 'Sub stabs', instrument: 'sub', params: { harm: 0.15, release: 0.09 },
    mix: { gain: -8, pan: 0, lp: 380, hp: 20, drive: 0.15, delay: 0, reverb: 0, duck: 0.8, duckRelease: 0.15 } },
  { id: 'hats', name: 'Hats', instrument: 'hats', params: { tune: 1.75, tone: 0.6, noise: 0.3, open: 0.22, closed: 0.04, width: 0.45 },
    mix: { filterFollow: 0.15, gain: -9, pan: 0.12, lp: 17000, hp: 500, drive: 0.08, delay: 0.06, reverb: 0.08, duck: 0.2, duckRelease: 0.1 } },
  { id: 'perc', name: 'Percussion', instrument: 'perc', params: { clapTone: 1.1 },
    mix: { filterFollow: 0.45, gain: -7, pan: -0.05, lp: 15000, hp: 130, drive: 0.1, delay: 0.14, reverb: 0.14, duck: 0.25, duckRelease: 0.12 } },
  { id: 'stabs', name: 'Organ stabs', instrument: 'poly',
    params: { patch: stabPatch('chicago-organ', { gate: 0.3, delay: { send: 0 }, reverb: { send: 0 }, comp: { amount: 0 }, limiter: { on: false } }) },
    mix: { gain: 1, pan: -0.15, lp: 6500, hp: 180, res: 0.15, drive: 0.1, delay: 0.3, reverb: 0.22, duck: 0.6, duckRelease: 0.18 } },
  { id: 'pads', name: 'Strings', instrument: 'poly',
    params: { maxVoices: 16, patch: stabPatch('detroit-strings', { amp: { a: 0.9, d: 2, s: 0.8, r: 2 }, fenv: { a: 0.8, d: 2.5, s: 0.6 }, filterA: { cutoff: 1100, env: 2, res: 0.18 }, chorus: { mix: 0.8, mode: 'ensemble' } }) },
    mix: { gain: -2, pan: 0, lp: 7500, hp: 200, res: 0.2, drive: 0, delay: 0.1, reverb: 0.55, duck: 0.7, duckRelease: 0.22 } },
  { id: 'lead', name: 'Hook', instrument: 'poly',
    params: { maxVoices: 8, patch: stabPatch('brass-stab', {
      osc: [{ on: true, type: 'saw', level: 0.7 }, { on: true, type: 'pulse', level: 0.4, pw: 0.42, fine: 7 }, { on: false }],
      amp: { a: 0.006, d: 0.45, s: 0.6, r: 0.22 }, fenv: { a: 0.01, d: 0.28, s: 0.3, curve: 0.5 },
      sub: { level: 0 }, pitchEnv: { amount: -0.3, decay: 0.04 }, drift: 2,
      filterA: { type: 'ladder', cutoff: 700, res: 0.4, env: 3, key: 0.5, follow: 0.4 },
      colour: { mode: 'tape', drive: 0.25 }, delay: { send: 0 }, reverb: { send: 0 },
    }) },
    mix: { gain: 0, pan: 0.08, lp: 9000, hp: 220, res: 0.3, drive: 0.08, delay: 0.32, reverb: 0.28, duck: 0.4, duckRelease: 0.16 } },
  { id: 'fx', name: 'FX & noise', instrument: 'fx', params: {},
    mix: { gain: -11, pan: 0, lp: 16000, hp: 150, drive: 0, delay: 0.1, reverb: 0.5, duck: 0.3, duckRelease: 0.15 } },
];

// ---------------------------------------------------------------- helpers
const P = (len, ...lanes) => ({ len, lanes });
function bars(track, specs) {
  const out = [];
  for (const [from, to, ...lanes] of specs) {
    const ev = laneEvents(track, { len: 16, lanes }, TOKENS3);
    for (let b = from; b <= to; b++) for (const e of ev) out.push({ ...e, s: b * 16 + e.s, r: 0.05 });
  }
  return out;
}
// The cell's rhythm and its pitches mapped onto the toms (C2 Eb2 G2 A2).
const TOM = { C5: 36, Eb5: 39, F5: 43, G5: 43, A5: 45, D5: 39, B4: 36 };
const tomEcho = (bar) => X.map(([s, n]) => ({ s: bar * 16 + s, n: TOM[n], v: n === 'A5' ? 0.85 : 0.6, l: 1, r: s === 3 || s === 0 ? 0.05 : 0.4 }));
// The cell's rhythm on congas.
const congaEcho = (bar, v = 0.6) => X.map(([s, n]) => ({ s: bar * 16 + s, n: 3, v: n === 'A5' ? v + 0.15 : v, l: 1, r: 0.3 }));

// ---------------------------------------------------------------- parts
const PARTS = {
  kick: {
    A: { ...P(16, 'x...x...x...x...'), fill: 'F', fillEvery: 8 },
    I: { len: 256, events: bars('kick', [[0, 14, 'x...x...x...x...'], [15, 15, 'x...x...x.......']]) },
    F: P(16, 'x...x...x...x.x.'),
  },
  toms: {
    // the hook's opening bar on toms, every other bar; low C on the 3 between
    E: { len: 32, events: [...tomEcho(0), { s: 22, n: 36, v: 0.5, l: 1, r: 0.5 }] },
  },
  sub: {
    A: P(32, '...r.......r....', 'r.....r.........'),
  },
  hats: {
    A: P(16, '..c...c...c...c.'),
    B: { ...P(16, 'g.c.gcc.g.c.gcO.'), fill: 'F', fillEvery: 8 },
    C: { ...P(16, 'gcgcgOgcgcgcgOgc'), fill: 'F', fillEvery: 8 },
    F: P(16, 'gcgcgcgcccOcccOO'),
  },
  perc: {
    A: { len: 32, events: [...bars('perc', [[0, 1, '...r.......r....']]), ...bars('perc', [[1, 1, '..............r.'] ])] },
    B: { len: 32, events: [...bars('perc', [[0, 1, 's.s.s.s.s.s.s.s.', '....c.......c...']]), ...congaEcho(0)] },
    C: { len: 32, events: [...bars('perc', [[0, 1, 'ssssssssssssssss', '....c.......c...'], [1, 1, '...b......b.....']]), ...congaEcho(0, 0.65), ...congaEcho(1, 0.45).filter((e) => e.s % 16 >= 8)] },
    D: P(32, '....c...........', '............c...'),
  },
  stabs: {
    // before the lead: the hook's skeleton (its accents) on organ
    G: { len: 64, events: [...bars('stabs', [[0, 0, '...c...c....c...'], [1, 1, 'c.............c.'], [2, 2, '...c...c....c...'], [3, 3, 'c...........c...']])] },
    // with the lead: answers in the hook's gaps (bars 2 and 4 start before the lead's tail)
    Q: { len: 64, events: [...bars('stabs', [[1, 1, 'c.............c.'], [3, 3, 'c.........c...c.']])] },
  },
  pads: { HOLD: { len: 16, follow: 'chords' } },
  lead: {
    TEASE: { len: 64, events: hookEvents([X]) },                                       // the opening bar, once every 4
    // groove: the tease grows (bars 1, 5, 9, then 13-14 with the call), the full hook from bar 17
    G32: { len: 512, events: [...hookEvents([X], { from: 0 }), ...hookEvents([X], { from: 4 }), ...hookEvents([X], { from: 8 }),
      ...hookEvents([X, CALL], { from: 12 }), ...hookEvents(HOOK, { from: 16 }), ...hookEvents(HOOK, { from: 24, accent: 0.03 })] },
    HOOK8: { len: 128, events: hookEvents() },
    AUG: { len: 256, events: hookEvents(HOOK, { scale: 2 }) },                       // half speed in the breakdown
    HARM: { len: 128, events: hookEvents(HOOK, { harm: 5, accent: 0.03 }) },         // in sixths at the peak
  },
  fx: {
    W: { len: 256, events: [{ s: 0, n: 2, v: 0.6, l: 64 }, { s: 192, n: 0, v: 0.6, l: 64 }] },
    GLITCH: { len: 128, events: [{ s: 124, n: 3, v: 0.5, l: 4 }] },
    BRK: { len: 256, events: [{ s: 0, n: 1, v: 0.7, l: 64 }, { s: 128, n: 0, v: 0.9, l: 128 }] },
    WASH: { len: 512, events: [{ s: 0, n: 2, v: 0.85, l: 64 }, { s: 252, n: 3, v: 0.5, l: 4 }] },
    DOWN: { len: 384, events: [{ s: 0, n: 1, v: 0.7, l: 64 }] },
  },
};

// ---------------------------------------------------------------- arrangement
const ARR = {
  //          intro        tease          groove        break          drop           peak           outro
  kick:   [['I', 0.9],   ['A', 1],      ['A', 1],     null,          ['A', 1],      ['A', 1],      ['A', 0.85]],
  toms:   [['E', 0.6],   ['E', 0.75],   ['E', 0.85],  null,          ['E', 0.7],    ['E', 0.9],    ['E', 0.5]],
  sub:    [null,         ['A', 0.6],    ['A', 0.8],   null,          ['A', 0.85],   ['A', 0.9],    ['A', 0.45]],
  hats:   [['A', 0.6],   ['A', 0.75],   ['B', 0.85],  null,          ['B', 0.9],    ['C', 1],      ['A', 0.55]],
  perc:   [['A', 0.5],   ['A', 0.7],    ['B', 0.85],  ['D', 0.4],    ['B', 0.9],    ['C', 1],      ['A', 0.55]],
  stabs:  [null,         ['G', 0.55],   ['G', 0.75],  null,          ['Q', 0.85],   ['Q', 0.95],   ['G', 0.45]],
  pads:   [null,         null,          ['HOLD', 0.4], ['HOLD', 0.9], ['HOLD', 0.75], ['HOLD', 0.7], null],
  lead:   [null,         ['TEASE', 0.75], ['G32', 0.85], ['AUG', 0.8], ['HOOK8', 0.95], ['HARM', 0.95], ['TEASE', 0.6]],
  fx:     [['W', 0.6],   ['GLITCH', 0.5], ['GLITCH', 0.6], ['BRK', 1], ['WASH', 0.8],  ['GLITCH', 0.7], ['DOWN', 0.7]],
};

// Section starts: intro 0, tease 16, groove 32, break 64, drop 80, peak 112, outro 144, end 168.
const CURVES = {
  energy: [[0, 0.25], [16, 0.45], [32, 0.6], [64, 0.75], [65, 0.35], [80, 0.7], [81, 1], [112, 0.95], [144, 0.85], [156, 0.45], [168, 0.2]],
  swing: [[0, 0.6], [16, 0.62], [48, 0.64], [80, 0.63], [112, 0.66], [168, 0.62]],
  filter: [[0, 0.5], [16, 0.75], [32, 0.95], [64, 1], [72, 0.6], [79, 0.95], [80, 1], [168, 0.7]],
  wet: [[0, 0.9], [64, 1], [65, 1.35], [80, 1.1], [168, 1.2]],
  glitch: [[0, 0.05], [32, 0.15], [112, 0.3], [168, 0.05]],
  'lp:lead': [[16, 0.35], [32, 0.5], [48, 0.9], [64, 0.55], [79, 1], [80, 0.8], [96, 1.1], [112, 0.9], [128, 1.2], [144, 0.8], [168, 0.4]],
  'lp:stabs': [[16, 0.4], [32, 0.7], [64, 0.9], [80, 0.8], [112, 1.1], [144, 0.7], [168, 0.4]],
  'lp:pads': [[32, 0.3], [64, 0.25], [79, 1], [81, 0.7], [112, 0.9], [144, 0.5]],
  'lp:hats': [[0, 0.4], [16, 0.7], [32, 1], [168, 0.5]],
};

export function buildSong3() {
  return compileSong({
    songId: 'woodward', title: 'Woodward Swing', bpm: 125, key: 'C', scale: 'Dorian',
    sections: SECTIONS, tracks: TRACKS, parts: PARTS, arr: ARR, prog: PROG, chords: CHORDS3, curves: CURVES,
    tokens: TOKENS3,
    master: { glue: 0.45, pump: 0.2, pumpRelease: 0.15, delayTime: '1/8d', delayFeedback: 0.5, delayGrit: 0.45, reverbDecay: 4.5, ceilingDb: -0.8, gainDb: 0 },
    extra: {
      brief: 'jazzy, upbeat Detroit techno with heavy swing, 125 BPM, C Dorian (C D Eb F G A Bb), built around one 8-bar hook on the lead that the toms, congas, organ stabs and sub echo',
      scaleSteps: [0, 2, 3, 5, 7, 9, 10],
      leadRange: [55, 86],
      chordSet: CHORDS3,
      rows: { toms: [['A2', 45], ['G2', 43], ['Eb2', 39], ['C2', 36]] },
      noteHints: {
        toms: '36 C2, 39 Eb2, 43 G2, 45 A2 (the hook\'s notes)',
        lead: 'MIDI 55..86 in C Dorian (C D Eb F G A Bb, B as a chromatic approach); the hook is part HOOK8: C C, leap up to A, G Eb F G - keep it recognisable',
      },
    },
  });
}
