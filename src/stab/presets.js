// Character presets spanning analogue (1) to digital (0). Each preset is a
// partial patch merged over the defaults, plus a suggested chord.
// Names describe a sound family, not a specific product.

import { defaultPatch, merge } from './patch.js';

const off = { on: false };

export const PRESETS = [
  // ---------------- analogue end ----------------
  {
    id: 'dub-chord', name: 'Dub Techno Chord', analog: 0.95, chord: { type: 'min7', voicing: 'open' },
    patch: {
      osc: [{ on: true, type: 'saw', level: 0.7 }, { on: true, type: 'saw', level: 0.5, fine: 9 }, off],
      sub: { level: 0 }, noise: { level: 0.04 }, drift: 5,
      amp: { a: 0.003, d: 0.4, s: 0.15, r: 0.3 }, fenv: { a: 0.001, d: 0.22, s: 0, r: 0.2 },
      gate: 0.35,
      filterA: { type: 'ladder', cutoff: 380, res: 0.55, drive: 0.25, env: 3.2, key: 0.4, follow: 0.8 },
      filterB: { type: 'svf-hp12', cutoff: 180 },
      delay: { send: 0.45, mode: 'pingpong', division: '1/8d', feedback: 0.62, lpf: 2600, hpf: 300, sat: 0.35, wow: 0.35 },
      reverb: { send: 0.35, type: 'hall', size: 0.85, decay: 5.5, damping: 0.6, hpf: 300 },
      delayToReverb: 0.6, duck: { amount: 0.45 },
      texture: { crackle: 0.2, density: 0.35, hiss: 0.12 },
    },
  },
  {
    id: 'detroit-strings', name: 'Detroit String Stab', analog: 0.85, chord: { type: 'min9', voicing: 'spread' },
    patch: {
      osc: [{ on: true, type: 'supersaw', level: 0.6, unison: 5, detune: 18 }, { on: true, type: 'pulse', level: 0.35, pw: 0.3, fine: -6 }, off],
      amp: { a: 0.012, d: 0.6, s: 0.4, r: 0.45 }, fenv: { a: 0.02, d: 0.5, s: 0.2 },
      gate: 0.75,
      filterA: { type: 'svf-lp24', cutoff: 1200, res: 0.25, env: 2.2, follow: 0.4 },
      chorus: { mix: 0.55, mode: 'ensemble', rate: 0.4 },
      reverb: { send: 0.35, type: 'hall', decay: 3.5 }, delay: { send: 0.15 },
    },
  },
  {
    id: 'poly-pluck', name: 'Warm Poly Chord (chorused)', analog: 0.9, chord: { type: 'min7', voicing: 'close' },
    patch: {
      osc: [{ on: true, type: 'pulse', level: 0.6, pw: 0.42 }, { on: true, type: 'saw', level: 0.45 }, off],
      sub: { level: 0.3, wave: 'square' },
      amp: { a: 0.002, d: 0.45, s: 0.2, r: 0.3 }, fenv: { d: 0.3, s: 0.05 },
      filterA: { type: 'svf-lp24', cutoff: 700, res: 0.3, env: 3.5, follow: 0.5 },
      filterB: { type: 'svf-hp12', cutoff: 110 },
      chorus: { mix: 0.7, mode: 'juno', rate: 0.55, depth: 0.6 },
      reverb: { send: 0.25, type: 'plate', decay: 2.2 },
    },
  },
  {
    id: 'chicago-organ', name: 'House Organ', analog: 0.7, chord: { type: 'min7', voicing: 'close' },
    patch: {
      osc: [{ on: true, type: 'organ', level: 0.8, drawbars: [8, 0, 8, 8, 0, 6, 0, 0, 4], perc: 2 }, off, off],
      sub: { level: 0 }, noise: { level: 0.12, decay: 0.006, colour: 0.9 }, drift: 1,
      amp: { a: 0.001, d: 0.25, s: 0.35, r: 0.08, curve: 0.5 }, fenv: { d: 0.1, s: 0.3 },
      gate: 0.25,
      filterA: { type: 'svf-lp12', cutoff: 2600, res: 0.15, env: 1.2, follow: 0 },
      filterB: { type: 'svf-hp12', cutoff: 160 },
      colour: { mode: 'tube', drive: 0.35 },
      reverb: { send: 0.15, type: 'room', decay: 1.1 }, delay: { send: 0.08, division: '1/8' },
    },
  },
  {
    id: 'acid-stab', name: 'Acid Squelch Stab', analog: 0.8, chord: { type: 'power', voicing: 'close' },
    patch: {
      osc: [{ on: true, type: 'saw', level: 0.8 }, { on: true, type: 'pulse', level: 0.3, pw: 0.5, octave: -1 }, off],
      sub: { level: 0.15 },
      amp: { a: 0.001, d: 0.3, s: 0.2, r: 0.12 }, fenv: { d: 0.18, s: 0, curve: 0.85 },
      gate: 0.25,
      filterA: { type: 'diode', cutoff: 320, res: 0.82, drive: 0.5, env: 4.5, follow: 0.6 },
      filterB: { type: 'off' },
      colour: { mode: 'tube', drive: 0.45 },
      delay: { send: 0.3, division: '1/16d', feedback: 0.5, mode: 'tape' },
      reverb: { send: 0.15, type: 'room' },
    },
  },
  {
    id: 'brass-stab', name: 'Analogue Brass Hit', analog: 0.85, chord: { type: 'maj', voicing: 'open' },
    patch: {
      osc: [{ on: true, type: 'saw', level: 0.7 }, { on: true, type: 'saw', level: 0.6, fine: 11 }, { on: true, type: 'saw', level: 0.4, fine: -9, octave: -1 }],
      amp: { a: 0.02, d: 0.35, s: 0.5, r: 0.2 }, fenv: { a: 0.035, d: 0.3, s: 0.35, curve: 0.4 },
      pitchEnv: { amount: -0.6, decay: 0.05 }, gate: 0.4,
      filterA: { type: 'ladder', cutoff: 520, res: 0.15, env: 3.4, follow: 0.3 },
      reverb: { send: 0.3, type: 'plate', decay: 2 },
    },
  },
  {
    id: 'rave-hoover', name: 'Rave Hoover Stab', analog: 0.6, chord: { type: 'min', voicing: 'wide' },
    patch: {
      osc: [{ on: true, type: 'supersaw', level: 0.7, unison: 7, detune: 55 }, { on: true, type: 'pulse', level: 0.45, pw: 0.22, octave: -1 }, off],
      sub: { level: 0.25 }, drift: 12,
      pitchEnv: { amount: -4, decay: 0.09 },
      amp: { a: 0.004, d: 0.6, s: 0.4, r: 0.35 },
      filterA: { type: 'svf-lp12', cutoff: 2400, res: 0.2, env: 1.5, follow: 0.4 },
      chorus: { mix: 0.6, mode: 'ensemble' }, colour: { mode: 'tape', drive: 0.4 },
      reverb: { send: 0.3, type: 'hall', decay: 3 },
    },
  },
  {
    id: 'reese-stab', name: 'Reese Stab', analog: 0.7, chord: { type: 'power', voicing: 'close' },
    patch: {
      osc: [{ on: true, type: 'saw', level: 0.7 }, { on: true, type: 'saw', level: 0.7, fine: 22 }, { on: true, type: 'saw', level: 0.5, fine: -17 }],
      sub: { level: 0.4 }, drift: 6,
      amp: { a: 0.003, d: 0.6, s: 0.6, r: 0.25 }, gate: 0.6,
      filterA: { type: 'ladder', cutoff: 900, res: 0.25, drive: 0.6, env: 1.8, follow: 0.2 },
      colour: { mode: 'hard', drive: 0.35, mix: 0.6 },
      reverb: { send: 0.12, type: 'room' }, delay: { send: 0.1 },
    },
  },
  {
    id: 'garage-vox', name: 'Garage Vowel Organ', analog: 0.55, chord: { type: 'min9', voicing: 'drop2' },
    patch: {
      osc: [{ on: true, type: 'organ', level: 0.6, drawbars: [6, 0, 8, 4, 2, 0, 0, 0, 0] }, { on: true, type: 'pulse', level: 0.35, pw: 0.3 }, off],
      amp: { a: 0.003, d: 0.3, s: 0.3, r: 0.12 }, gate: 0.3,
      filterA: { type: 'formant', cutoff: 900, res: 0.5, env: 2.5, follow: 1 },
      filterB: { type: 'svf-hp12', cutoff: 200 },
      fenv: { d: 0.2, s: 0.1 },
      delay: { send: 0.2, division: '1/8', mode: 'stereo' }, reverb: { send: 0.2, type: 'chamber' },
    },
  },
  {
    id: 'spring-dub', name: 'Spring Tank Skank', analog: 0.9, chord: { type: 'maj', voicing: 'close' },
    patch: {
      osc: [{ on: true, type: 'organ', level: 0.7, drawbars: [0, 0, 8, 8, 8, 0, 0, 0, 0] }, { on: true, type: 'pulse', level: 0.3 }, off],
      amp: { a: 0.001, d: 0.12, s: 0, r: 0.05 }, gate: 0.15,
      filterA: { type: 'svf-bp', cutoff: 1500, res: 0.3, env: 1, follow: 0 },
      reverb: { send: 0.55, type: 'spring', decay: 2.6, size: 0.4 },
      delay: { send: 0.35, mode: 'tape', division: '1/4d', feedback: 0.55, wow: 0.5, lpf: 2500, grit: 0.65 },
      texture: { crackle: 0.35, density: 0.45, hiss: 0.2 },
    },
  },

  {
    id: 'dusty-tape', name: 'Dusty Tape Chord', analog: 0.95, chord: { type: 'min9', voicing: 'drop2' },
    patch: {
      osc: [{ on: true, type: 'pulse', level: 0.6, pw: 0.38 }, { on: true, type: 'organ', level: 0.4, drawbars: [0, 0, 8, 6, 0, 3, 0, 0, 0] }, off],
      noise: { level: 0.06, air: 0.12, airColour: 0.55 }, drift: 8,
      amp: { a: 0.004, d: 0.5, s: 0.25, r: 0.3 }, fenv: { d: 0.3, s: 0.1 }, gate: 0.4,
      filterA: { type: 'ladder', cutoff: 900, res: 0.2, drive: 0.3, env: 2.2, follow: 0.5 },
      filterB: { type: 'svf-hp12', cutoff: 160 },
      colour: { mode: 'tape', drive: 0.45 }, chorus: { mix: 0.35, mode: 'juno' },
      eq: { highCut: 9000, tilt: -0.2 },
      delay: { send: 0.45, mode: 'tape', division: '1/4d', feedback: 0.6, lpf: 3200, hpf: 180, wow: 0.6, grit: 0.85 },
      reverb: { send: 0.2, type: 'spring', decay: 2.2 },
      texture: { crackle: 0.55, density: 0.5, tone: 0.4, hiss: 0.35, follow: 0.4 },
    },
  },

  // ---------------- middle ----------------
  {
    id: 'trance-pluck', name: 'Supersaw Pluck', analog: 0.4, chord: { type: 'sus2', voicing: 'spread' },
    patch: {
      osc: [{ on: true, type: 'supersaw', level: 0.8, unison: 9, detune: 35 }, off, { on: true, type: 'sine', level: 0.2, octave: 1 }],
      amp: { a: 0.001, d: 0.28, s: 0, r: 0.22 }, fenv: { d: 0.18, s: 0 }, gate: 0.3,
      filterA: { type: 'svf-lp24', cutoff: 800, res: 0.2, env: 4.5, follow: 0.2 },
      delay: { send: 0.3, division: '1/8d', feedback: 0.45 }, reverb: { send: 0.35, type: 'hall', decay: 3.5, damping: 0.25 },
      duck: { amount: 0.6 },
    },
  },
  {
    id: 'shimmer-chord', name: 'Shimmer Chord', analog: 0.35, chord: { type: 'maj9', voicing: 'spread' },
    patch: {
      osc: [{ on: true, type: 'tri', level: 0.6 }, { on: true, type: 'supersaw', level: 0.4, unison: 5, detune: 15 }, off],
      amp: { a: 0.006, d: 0.8, s: 0.2, r: 0.6 }, gate: 0.5,
      filterA: { type: 'svf-lp12', cutoff: 2200, res: 0.15, env: 1.5 },
      reverb: { send: 0.55, type: 'shimmer', decay: 7, size: 0.9, shimmer: 0.5, damping: 0.3, hpf: 350 },
      delay: { send: 0.2, division: '1/4' }, duck: { amount: 0.5 },
    },
  },
  {
    id: 'comb-metal', name: 'Metallic Comb Hit', analog: 0.3, chord: { type: 'quartal', voicing: 'open' },
    patch: {
      osc: [{ on: true, type: 'pulse', level: 0.6, pw: 0.15 }, off, off],
      noise: { level: 0.4, decay: 0.03, colour: 0.9 },
      amp: { a: 0.001, d: 0.4, s: 0, r: 0.3 }, gate: 0.25,
      filterA: { type: 'comb', cutoff: 520, res: 0.85, env: 2, key: 1, follow: 0 },
      filterB: { type: 'svf-hp12', cutoff: 250 },
      reverb: { send: 0.3, type: 'plate' }, delay: { send: 0.2, division: '1/16' },
    },
  },

  // ---------------- digital end ----------------
  {
    id: 'fm-bell', name: 'FM Bell Stab', analog: 0.1, chord: { type: 'maj7', voicing: 'open' },
    patch: {
      osc: [{ on: true, type: 'fm', level: 0.7, fmRatio: 3.5, fmIndex: 4, fmDecay: 0.4, fmSustain: 0.05 }, { on: true, type: 'fm', level: 0.3, fmRatio: 1, fmIndex: 1.5, fmDecay: 0.2, octave: 1 }, off],
      sub: { level: 0 }, noise: { level: 0 }, drift: 0,
      amp: { a: 0.001, d: 1.2, s: 0, r: 0.6, curve: 0.8 }, gate: 0.5,
      filterA: { type: 'off' }, filterB: { type: 'svf-hp12', cutoff: 150 },
      colour: { mode: 'off' },
      reverb: { send: 0.35, type: 'plate', decay: 3, damping: 0.2 }, delay: { send: 0.2, division: '1/8d' },
    },
  },
  {
    id: 'fm-brass', name: 'Digital FM Brass', analog: 0.15, chord: { type: 'dom9', voicing: 'drop2' },
    patch: {
      osc: [{ on: true, type: 'fm', level: 0.7, fmRatio: 1, fmIndex: 3.5, fmDecay: 0.25, fmSustain: 0.35, fmFeedback: 0.4 }, { on: true, type: 'fm', level: 0.35, fmRatio: 1, fmIndex: 2, fine: 8 }, off],
      drift: 0.5, amp: { a: 0.015, d: 0.4, s: 0.45, r: 0.2 }, gate: 0.4,
      filterA: { type: 'svf-lp12', cutoff: 5000, res: 0.05, env: 0.5, follow: 0 },
      colour: { mode: 'off' }, chorus: { mix: 0.3, mode: 'ensemble' },
      reverb: { send: 0.25, type: 'room', decay: 1.4 },
    },
  },
  {
    id: 'rave-piano', name: 'Digital Rave Piano', analog: 0.2, chord: { type: 'min7', voicing: 'close' },
    patch: {
      osc: [{ on: true, type: 'fm', level: 0.6, fmRatio: 1, fmIndex: 2.2, fmDecay: 0.5, fmSustain: 0.05 }, { on: true, type: 'fm', level: 0.3, fmRatio: 7, fmIndex: 1.2, fmDecay: 0.03, fmSustain: 0 }, { on: true, type: 'tri', level: 0.25 }],
      noise: { level: 0.05, decay: 0.004 }, drift: 0.5,
      amp: { a: 0.001, d: 1.4, s: 0, r: 0.3, curve: 0.85 }, gate: 0.5,
      filterA: { type: 'svf-lp12', cutoff: 4200, res: 0.05, env: 1.5, key: 0.7, follow: 0 },
      colour: { mode: 'tape', drive: 0.2 },
      reverb: { send: 0.2, type: 'room' }, delay: { send: 0.1 },
    },
  },
  {
    id: 'cz-reso', name: 'Phase-Distortion Reso', analog: 0.15, chord: { type: 'min11', voicing: 'drop2' },
    patch: {
      osc: [{ on: true, type: 'reso', level: 0.7, pd: 0.8, pdDecay: 0.25 }, { on: true, type: 'pd', level: 0.4, pd: 0.9, pdDecay: 0.5, fine: 6 }, off],
      drift: 0.5, amp: { a: 0.001, d: 0.4, s: 0.1, r: 0.25 }, gate: 0.35,
      filterA: { type: 'off' }, filterB: { type: 'svf-hp12', cutoff: 140 },
      colour: { mode: 'off' },
      delay: { send: 0.25, division: '1/8d' }, reverb: { send: 0.25, type: 'plate' },
    },
  },
  {
    id: 'crushed-chord', name: 'Bitcrushed Chord', analog: 0.05, chord: { type: 'min9', voicing: 'close' },
    patch: {
      osc: [{ on: true, type: 'pulse', level: 0.6, pw: 0.25 }, { on: true, type: 'saw', level: 0.4 }, off],
      amp: { a: 0.001, d: 0.35, s: 0.1, r: 0.2 }, gate: 0.35,
      filterA: { type: 'svf-lp12', cutoff: 1800, res: 0.3, env: 2.5 },
      colour: { mode: 'crush', drive: 0.4, bits: 6, rate: 0.35, mix: 0.8 },
      delay: { send: 0.25, division: '1/16d', feedback: 0.45 }, reverb: { send: 0.2, type: 'room' },
    },
  },
  {
    id: 'glass-formant', name: 'Glass Formant', analog: 0.1, chord: { type: 'sus4', voicing: 'spread' },
    patch: {
      osc: [{ on: true, type: 'fm', level: 0.5, fmRatio: 2, fmIndex: 2, fmDecay: 0.6 }, { on: true, type: 'supersaw', level: 0.35, unison: 3, detune: 10 }, off],
      amp: { a: 0.003, d: 0.7, s: 0.1, r: 0.5 }, gate: 0.4,
      filterA: { type: 'formant', cutoff: 3000, res: 0.7, env: -2, follow: 0.6 },
      reverb: { send: 0.4, type: 'shimmer', decay: 5, shimmer: 0.35 }, delay: { send: 0.25, division: '1/4d' },
    },
  },
  {
    id: 'wavefold', name: 'Wavefolded Digital', analog: 0.25, chord: { type: 'tritones', voicing: 'close' },
    patch: {
      osc: [{ on: true, type: 'sine', level: 0.7 }, { on: true, type: 'tri', level: 0.4, octave: 1 }, off],
      amp: { a: 0.001, d: 0.3, s: 0.2, r: 0.2 }, gate: 0.3,
      filterA: { type: 'svf-lp12', cutoff: 6000, res: 0.1, env: 0 },
      colour: { mode: 'fold', drive: 0.55, mix: 1 },
      delay: { send: 0.2, division: '1/8t' }, reverb: { send: 0.2, type: 'plate' },
    },
  },
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

export function presetPatch(id) {
  const pr = PRESET_BY_ID[id] ?? PRESETS[0];
  const p = merge(defaultPatch(), pr.patch);
  p.name = pr.name;
  return p;
}

/** Presets near a point on the analogue<->digital axis, for family spread. */
export function presetsNear(analog, radius) {
  return PRESETS.filter((p) => Math.abs(p.analog - analog) <= radius);
}
