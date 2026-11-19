// Song 2: "Undertow". 126 BPM, D minor with a Phrygian colour (the flat
// second, Eb), ~6:36. Same vibe as the first song, darker, trying other
// things:
//   - a rolling sub bass under the kick (song 1 had none: toms carried it)
//   - a dark pad drone from the very first bar, breathing on a filter curve
//   - a hypnotic lead sequence on a 3-step cycle against 4/4 (polymeter)
//     instead of a melody, re-voiced to every chord of the drop
//   - toms as a 3-bar polyrhythm, not the bass
//   - a half-time "pull back" after the first groove, a kick-less 24-bar
//     breakdown, fills every 16 bars instead of 8
//   - darker hats and claps, a longer darker hall, a harder pump

import { stabPatch } from '../engine/tonal.js';
import { compileSong, laneEvents, TOKENS } from './song.js';

const TOKENS2 = {
  ...TOKENS,
  toms: { a: [38, 0.85], e: [39, 0.75], b: [41, 0.8], c: [43, 0.8], d: [45, 0.75] }, // D2 Eb2 F2 G2 A2
};

// Dark minor / Phrygian vocabulary (MIDI notes).
export const CHORDS2 = {
  'Dm(add9)': [50, 53, 57, 64],       // D F A E
  'Dm(b9)': [50, 51, 53, 57],         // D Eb F A  - Phrygian cluster
  'Ebmaj7#11': [51, 55, 62, 69],      // Eb G D A  - the flat-two chord
  Gm9: [43, 46, 50, 53, 57],          // G Bb D F A
  Bbmaj7: [46, 50, 53, 57],           // Bb D F A
  'Em7b5': [52, 55, 58, 62],          // E G Bb D
  'A7b9': [45, 49, 55, 58],           // A C# G Bb - harmonic-minor dominant
  'Dm quartal': [50, 55, 60, 65],     // D G C F
};

const PROG = {
  intro: [[8, 'Dm(add9)']],
  pressure: [[4, 'Dm(add9)'], [4, 'Dm(b9)']],
  pull: [[4, 'Ebmaj7#11'], [4, 'A7b9']],
  tunnel: [[2, 'Dm quartal'], [2, 'Dm(b9)']],
  breakdown: [[8, 'Dm(add9)'], [4, 'Ebmaj7#11'], [4, 'Gm9'], [4, 'Em7b5'], [4, 'A7b9']],
  drop: [[4, 'Dm(add9)'], [4, 'Bbmaj7'], [4, 'Gm9'], [4, 'A7b9'], [4, 'Dm(b9)'], [4, 'Ebmaj7#11'], [4, 'Gm9'], [4, 'A7b9']],
  afterhours: [[2, 'Dm quartal'], [1, 'Dm(b9)'], [1, 'Ebmaj7#11']],
  outro: [[8, 'Dm(add9)']],
};

const SECTIONS = [
  { id: 'intro', name: 'Intro', bars: 24 },
  { id: 'pressure', name: 'Pressure', bars: 32 },
  { id: 'pull', name: 'Pull back', bars: 8 },
  { id: 'tunnel', name: 'Tunnel', bars: 32 },
  { id: 'breakdown', name: 'Breakdown', bars: 24 },
  { id: 'drop', name: 'Drop', bars: 32 },
  { id: 'afterhours', name: 'Afterhours', bars: 32 },
  { id: 'outro', name: 'Outro', bars: 24 },
];

// ---------------------------------------------------------------- tracks
const TRACKS = [
  { id: 'kick', name: 'Kick', instrument: 'kick', params: { note: 26, decay: 0.27, punch: 4.4, click: 0.35, drive: 0.32 },
    mix: { filterFollow: 0.25, gain: -2.5, pan: 0, lp: 15000, hp: 24, drive: 0, delay: 0, reverb: 0.05, duck: 0, duckRelease: 0.1 } },
  { id: 'toms', name: 'Toms', instrument: 'toms', params: { decay: 0.26, sweep: 0.05, drop: 0.7, skin: 0.15 },
    mix: { gain: -6, pan: -0.1, lp: 7000, hp: 50, drive: 0.03, delay: 0.14, reverb: 0.1, duck: 0.4, duckRelease: 0.12, cutFreq: 300, cutDb: -6, cutQ: 1.1 } },
  { id: 'sub', name: 'Rumble bass', instrument: 'sub', params: { harm: 0.28, release: 0.1 },
    mix: { gain: -9, pan: 0, lp: 240, hp: 22, drive: 0.25, delay: 0, reverb: 0, duck: 0.92, duckRelease: 0.15 } },
  { id: 'hats', name: 'Hats', instrument: 'hats', params: { tune: 1.3, tone: 0.42, noise: 0.5, open: 0.3, closed: 0.035, width: 0.45 },
    mix: { filterFollow: 0.2, gain: -10, pan: 0.1, lp: 14000, hp: 600, drive: 0.12, delay: 0.1, reverb: 0.1, duck: 0.3, duckRelease: 0.1 } },
  { id: 'perc', name: 'Percussion', instrument: 'perc', params: { clapTone: 0.72 },
    mix: { filterFollow: 0.45, gain: -8, pan: 0.05, lp: 12000, hp: 150, drive: 0.12, delay: 0.2, reverb: 0.18, duck: 0.3, duckRelease: 0.12 } },
  { id: 'stabs', name: 'Stabs', instrument: 'poly',
    params: { patch: stabPatch('dusty-tape', { gate: 0.35, filterA: { cutoff: 620, res: 0.3, env: 2.6 }, delay: { send: 0 }, reverb: { send: 0 }, texture: { crackle: 0, hiss: 0 }, comp: { amount: 0 }, limiter: { on: false } }) },
    mix: { gain: 1, pan: -0.05, lp: 4200, hp: 180, res: 0.35, drive: 0.12, delay: 0.55, reverb: 0.3, duck: 0.7, duckRelease: 0.22 } },
  { id: 'pads', name: 'Drone pads', instrument: 'poly',
    params: { maxVoices: 16, patch: stabPatch('detroit-strings', { amp: { a: 2.4, d: 3, s: 0.85, r: 3.5 }, fenv: { a: 2, d: 4, s: 0.5 }, filterA: { cutoff: 620, env: 1.6, res: 0.28 }, chorus: { mix: 0.85, mode: 'ensemble' } }) },
    mix: { gain: -1, pan: 0, lp: 5000, hp: 120, res: 0.3, drive: 0, delay: 0.1, reverb: 0.7, duck: 0.8, duckRelease: 0.26 } },
  { id: 'lead', name: 'Sequence', instrument: 'poly',
    params: { maxVoices: 6, patch: stabPatch('acid-stab', {
      osc: [{ on: true, type: 'saw', level: 0.75, octave: 0 }, { on: true, type: 'saw', level: 0.4, octave: 0, fine: -9 }, { on: false }],
      sub: { level: 0.1 }, noise: { level: 0.02 }, drift: 2, pitchEnv: { amount: 0 },
      amp: { a: 0.003, d: 0.28, s: 0.25, r: 0.2 }, fenv: { a: 0.001, d: 0.22, s: 0.05, r: 0.2 },
      filterA: { type: 'ladder', cutoff: 380, res: 0.72, drive: 0.35, env: 3, key: 0.4, follow: 0.5 },
      filterB: { type: 'svf-hp12', cutoff: 140 }, colour: { mode: 'tape', drive: 0.3 },
      delay: { send: 0 }, reverb: { send: 0 },
    }) },
    mix: { gain: 3, pan: 0.12, lp: 8000, hp: 160, res: 0.45, drive: 0.1, delay: 0.45, reverb: 0.3, duck: 0.55, duckRelease: 0.18 } },
  { id: 'fx', name: 'FX & noise', instrument: 'fx', params: {},
    mix: { gain: -9, pan: 0, lp: 14000, hp: 160, drive: 0.05, delay: 0.12, reverb: 0.6, duck: 0.35, duckRelease: 0.15 } },
];

// ---------------------------------------------------------------- helpers
const P = (len, ...lanes) => ({ len, lanes });
// Events bar by bar: [[fromBar, toBar, ...one-bar lanes], ...]
function bars(track, specs) {
  const out = [];
  for (const [from, to, ...lanes] of specs) {
    const ev = laneEvents(track, { len: 16, lanes }, TOKENS2);
    for (let b = from; b <= to; b++) for (const e of ev) out.push({ ...e, s: b * 16 + e.s, r: 0.05 });
  }
  return out;
}
// Something every `every` steps from `start`, cycling through notes/velocities.
function cycle(len, every, notes, vels, { start = 0, l = 1, r = 0.3 } = {}) {
  const out = [];
  for (let s = start, i = 0; s < len; s += every, i++) out.push({ s, n: notes[i % notes.length], v: vels[i % vels.length], l, r });
  return out;
}
const SNARE_ROLL = (at) => [
  ...Array.from({ length: 8 }, (_, i) => ({ s: at + i * 2, n: 6, v: 0.28 + i * 0.03, l: 1, r: 0 })),
  ...Array.from({ length: 16 }, (_, i) => ({ s: at + 16 + i, n: 6, v: 0.5 + i * 0.03, l: 1, r: 0 })),
];

// The lead: a note every 3 steps through a 5-note pool, so the line only
// lines up with the bar again every 15 notes. Each chord gets its own pool,
// all from the chord and D Phrygian (C# and E only over A7b9, its
// harmonic-minor dominant).
const POOLS = {
  'Dm(add9)': [50, 57, 53, 62, 57], 'Dm(b9)': [50, 57, 51, 53, 57], 'Ebmaj7#11': [51, 58, 55, 62, 57],
  Gm9: [50, 55, 58, 57, 62], Bbmaj7: [50, 53, 58, 57, 62], 'A7b9': [49, 55, 52, 58, 57], 'Dm quartal': [50, 55, 57, 60, 62],
};
function sequence(prog, { extra = false, accent = 0 } = {}) {
  const out = [];
  let bar = 0, i = 0;
  for (const [n, name] of prog) {
    const pool = POOLS[name];
    for (let s = bar * 16; s < (bar + n) * 16; s += 3, i++) {
      out.push({ s, n: pool[i % pool.length], v: (i % 4 === 0 ? 0.85 : 0.62) + accent, l: 2, r: i % 4 === 0 ? 0.1 : 0.45 });
      // Afterhours: an octave-up answer on the last 16th of some bars.
      if (extra && s % 16 === 12) out.push({ s: s + 2, n: pool[(i + 2) % pool.length] + 12, v: 0.55, l: 1, r: 0.7 });
    }
    bar += n;
  }
  return out;
}
const repeat = (prog, times) => Array.from({ length: times }, () => prog).flat();

// ---------------------------------------------------------------- parts
const PARTS = {
  kick: {
    A: { ...P(16, 'x...x...x...x...'), fill: 'F', fillEvery: 16 },
    I: { len: 384, events: bars('kick', [[8, 14, 'x...x...x...x...'], [15, 15, 'x...x...x.....x.'], [16, 22, 'x...x...x...x...'], [23, 23, 'x...x...x.......']]) },
    H: P(16, 'x.......x.......'),                                          // half-time pull back
    F: P(16, 'x...x...x..x..x.'),
  },
  toms: {
    // 3-bar polyrhythm: a hit every 3 steps, the accent wanders.
    A: { len: 48, events: cycle(48, 3, [38, 38, 41, 38, 45, 38, 39, 38], [0.7, 0.45, 0.6, 0.45, 0.75, 0.45, 0.6, 0.45], { start: 2 }) },
    B: P(16, '..a.a.ab.bc.cdcD'),
    I: { len: 384, events: cycle(384, 6, [38, 38, 41, 38], [0.55, 0.4, 0.5, 0.4], { start: 128 + 2 }) },
  },
  sub: {
    I: { len: 384, events: bars('sub', [[4, 7, '..r.............'], [8, 23, '..r.......r.....']]) },
    A: P(16, '..r...r...r...r.'),                                          // offbeat rumble
    B: { ...P(16, '.rrr.rrr.rrr.rrr'), fill: 'F', fillEvery: 16 },        // rolling 16ths under the kick
    F: P(16, '.rrr.rrr.rrr....'),
    D: P(64, 'r...............'),                                          // breakdown: one low note per 4 bars
  },
  hats: {
    I: { len: 384, events: bars('hats', [[4, 11, 'g...g...g...g...'], [12, 19, 'g.o.g...g.o.g...'], [20, 23, 'g.o.g.o.g.o.g.og']]) },
    A: P(16, 'g.o.g.o.g.o.g.o.'),
    B: { ...P(16, 'c.o.c.ocg.o.c.og'), fill: 'F', fillEvery: 16 },
    // dotted ticks (every 3) against the offbeat opens
    C: { len: 48, events: [...cycle(48, 3, [0], [0.5, 0.32, 0.4]), ...bars('hats', [[0, 2, '..o...o...o...o.']])] },
    D: P(16, '..g...g...g...g.'),
    F: P(16, 'c.o.c.occccOccOO'),
  },
  perc: {
    I: { len: 384, events: [...bars('perc', [[0, 23, '.......b.....b..'], [8, 23, 's.s.s.s.s.s.s.s.'], [16, 23, '...k......k.....']]), ...SNARE_ROLL(352)] },
    A: P(32, 's.s.s.s.s.s.s.s.s.s.s.s.s.s.s.s.', '.......b.....b.........b.....b..', '............n...............n...'),
    B: { ...P(32, 'ssssssssssssssssssssssssssssssss', '.......b.....b.........b.....b..', '....c.......c.......c.......c...', '...k..k....k.....k.....k..k.....', '...............................g'), fill: 'F', fillEvery: 16 },
    C: { ...P(64, 'ssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss', '.......b.....b.........b.....b.........b.....b.........b.....bb.', '....c.......c.......c.......c.......c.......c.......c.......c...', '...k..k....k.k.....k..k...k.....k..k....k.k.....k..k...k..k.k.k.', '...............g...............g...........g...............g.g.g'), fill: 'F', fillEvery: 16 },
    D: P(32, '.......b.....................b..'),
    F: { len: 16, events: [...bars('perc', [[0, 0, 'ssssssssssssssss', '....c.......c...']]), ...Array.from({ length: 8 }, (_, i) => ({ s: 8 + i, n: 6, v: 0.5 + i * 0.06, l: 1, r: 0 }))] },
    R: { len: 128, events: SNARE_ROLL(96) },                              // pull back: roll into the tunnel
  },
  stabs: {
    A: P(32, '...c......c.....', '.......c........'),
    B: P(16, '...c..c...c..c..'),
    P: { len: 512, events: [...bars('stabs', [[0, 15, '...c............'], [16, 31, '...c......c.....']]).filter((e) => (e.s >> 4) % 2 === 0)] },
  },
  pads: { HOLD: { len: 16, follow: 'chords' } },
  lead: {
    T: { len: 512, events: sequence(repeat(PROG.tunnel, 8)) },
    D: { len: 512, events: sequence(PROG.drop) },
    AH: { len: 512, events: sequence(repeat(PROG.afterhours, 8), { extra: true, accent: 0.05 }) },
  },
  fx: {
    I: { len: 384, events: [{ s: 0, n: 2, v: 0.7, l: 96 }, { s: 188, n: 3, v: 0.45, l: 4 }, { s: 256, n: 0, v: 0.75, l: 128 }] },
    GLITCH: { len: 128, events: [{ s: 60, n: 3, v: 0.5, l: 4 }, { s: 92, n: 3, v: 0.35, l: 2 }, { s: 124, n: 3, v: 0.6, l: 4 }] },
    RISE8: { len: 128, events: [{ s: 0, n: 0, v: 0.8, l: 128 }] },
    BREAK: { len: 384, events: [{ s: 0, n: 1, v: 0.7, l: 64 }, { s: 0, n: 2, v: 0.6, l: 128 }, { s: 128, n: 0, v: 0.9, l: 256 }] },
    WASH: { len: 512, events: [{ s: 0, n: 2, v: 0.9, l: 64 }, { s: 256, n: 3, v: 0.6, l: 8 }, { s: 504, n: 3, v: 0.5, l: 8 }] },
    DOWN: { len: 384, events: [{ s: 0, n: 1, v: 0.7, l: 64 }, { s: 256, n: 2, v: 0.5, l: 128 }] },
  },
};

// ---------------------------------------------------------------- arrangement
const ARR = {
  //          intro        pressure     pull           tunnel        breakdown      drop           afterhours    outro
  kick:   [['I', 0.9],   ['A', 1],    ['H', 0.9],    ['A', 1],     null,          ['A', 1],      ['A', 1],     ['A', 0.85]],
  toms:   [['I', 0.55],  ['A', 0.7],  ['B', 0.8],    ['A', 0.85],  null,          ['A', 0.75],   ['A', 0.95],  ['A', 0.5]],
  sub:    [['I', 0.6],   ['A', 0.8],  null,          ['B', 0.85],  ['D', 0.5],    ['B', 0.9],    ['B', 1],     ['A', 0.5]],
  hats:   [['I', 0.7],   ['A', 0.75], ['D', 0.5],    ['C', 0.85],  null,          ['B', 0.9],    ['C', 1],     ['A', 0.5]],
  perc:   [['I', 0.7],   ['A', 0.7],  ['R', 0.8],    ['B', 0.85],  ['D', 0.35],   ['B', 0.9],    ['C', 1],     ['A', 0.55]],
  stabs:  [null,         ['P', 0.6],  ['A', 0.6],    ['A', 0.8],   null,          ['B', 0.75],   ['A', 0.9],   null],
  pads:   [['HOLD', 0.4], ['HOLD', 0.35], ['HOLD', 0.6], ['HOLD', 0.4], ['HOLD', 0.9], ['HOLD', 1], ['HOLD', 0.5], ['HOLD', 0.35]],
  lead:   [null,         null,        null,          ['T', 0.8],   null,          ['D', 0.9],    ['AH', 0.85], null],
  fx:     [['I', 0.75],  ['GLITCH', 0.5], ['RISE8', 0.85], ['GLITCH', 0.7], ['BREAK', 1], ['WASH', 0.85], ['GLITCH', 0.85], ['DOWN', 0.7]],
};

// Song-wide curves: [bar, value] points, linear in between. Section starts:
// intro 0, pressure 24, pull 56, tunnel 64, breakdown 96, drop 120, afterhours 152, outro 184, end 208.
const CURVES = {
  energy: [[0, 0.15], [24, 0.45], [56, 0.55], [57, 0.35], [64, 0.65], [96, 0.8], [97, 0.3], [120, 0.65], [121, 1], [152, 0.92], [184, 0.85], [196, 0.4], [208, 0.15]],
  swing: [[0, 0.53], [64, 0.55], [120, 0.53], [208, 0.53]],
  filter: [[0, 0.35], [24, 0.7], [56, 0.9], [60, 0.5], [64, 0.9], [96, 1], [110, 0.6], [119, 0.95], [120, 1], [208, 0.6]],
  wet: [[0, 1.1], [96, 1], [97, 1.5], [120, 1.3], [152, 1.1], [208, 1.3]],
  glitch: [[0, 0.2], [64, 0.45], [120, 0.5], [152, 0.75], [184, 0.4], [208, 0.2]],
  'lp:lead': [[64, 0.25], [80, 0.7], [88, 0.35], [96, 0.9], [120, 0.32], [128, 0.7], [136, 0.35], [144, 1.1], [152, 0.4], [168, 1.2], [176, 0.5], [184, 0.3]],
  'lp:pads': [[0, 0.15], [24, 0.25], [56, 0.2], [96, 0.15], [119, 1], [121, 0.6], [136, 1], [152, 0.5], [208, 0.2]],
  'lp:stabs': [[24, 0.3], [56, 0.6], [64, 0.35], [96, 0.9], [120, 0.4], [136, 1], [152, 0.6], [176, 1.1], [184, 0.5]],
  'lp:hats': [[0, 0.25], [16, 0.5], [24, 0.8], [56, 1], [208, 0.4]],
};

export function buildSong2() {
  return compileSong({
    songId: 'undertow', title: 'Undertow', bpm: 126, key: 'D', scale: 'minor',
    sections: SECTIONS, tracks: TRACKS, parts: PARTS, arr: ARR, prog: PROG, chords: CHORDS2, curves: CURVES,
    tokens: TOKENS2,
    master: { glue: 0.5, pump: 0.28, pumpRelease: 0.18, delayTime: '1/4d', delayFeedback: 0.58, delayGrit: 0.65, reverbDecay: 7.5, ceilingDb: -0.8, gainDb: 1.8 },
    extra: {
      brief: 'dark, hypnotic minimal techno (Detroit / Swedish), 126 BPM, D minor with a Phrygian colour (Eb), rolling sub bass, hard pump',
      scaleSteps: [0, 1, 3, 5, 7, 8, 10],
      leadRange: [45, 74],
      chordSet: CHORDS2,
      rows: { toms: [['A2', 45], ['G2', 43], ['F2', 41], ['Eb2', 39], ['D2', 38]] },
      noteHints: {
        toms: '38 D2, 39 Eb2, 41 F2, 43 G2, 45 A2',
        lead: 'MIDI 45..74 in D Phrygian (D Eb F G A Bb C; C# and E only over A7b9); the part is a note every 3 steps',
      },
    },
  });
}
