// Patch model: defaults, parameter schema (drives the UI and any future
// plugin parameter list), macros and lock groups.

import { OSC_TYPES, OSC_LABELS } from '../dsp/oscillators.js';
import { FILTER_TYPES, FILTER_LABELS } from '../dsp/filters.js';
import { SAT_MODES } from '../dsp/colour.js';
import { DELAY_MODES } from '../dsp/delay.js';
import { REVERB_TYPES } from '../dsp/reverb.js';
import { DIVISIONS, clamp } from '../dsp/util.js';

const layer = (o = {}) => ({
  on: false, type: 'saw', level: 0.6, octave: 0, semi: 0, fine: 0,
  pw: 0.5, shape: 0.5, unison: 7, detune: 25, spread: 0.8,
  fmRatio: 2, fmIndex: 3, fmDecay: 0.3, fmSustain: 0.15, fmFeedback: 0,
  pd: 0.8, pdDecay: 0.4, drawbars: [8, 0, 8, 6, 0, 4, 0, 0, 2], perc: 0,
  phaseRand: 1, ...o,
});

export function defaultPatch() {
  return {
    name: 'Init',
    osc: [layer({ on: true, type: 'saw', level: 0.7 }), layer({ type: 'pulse', level: 0.4, fine: 7 }), layer({ type: 'sine', level: 0.3 })],
    sub: { level: 0.2, octave: -1, wave: 'sine' },
    noise: { level: 0.08, decay: 0.015, colour: 0.7, air: 0, airColour: 0.7 },
    texture: { crackle: 0, density: 0.4, tone: 0.5, hiss: 0, follow: 0.6 },
    comp: { amount: 0.3, mode: 'stab', ratio: 4, attack: 0.012, release: 0.15, mix: 1 },
    limiter: { on: true, drive: 3, release: 0.08 },
    drift: 3, driftRate: 0.6,
    pitchEnv: { amount: 0, decay: 0.03 },
    amp: { a: 0.002, d: 0.35, s: 0.25, r: 0.25, curve: 0.6, attackCurve: 0.3 },
    fenv: { a: 0.001, d: 0.28, s: 0.1, r: 0.25, curve: 0.7, attackCurve: 0.3 },
    gate: 0.5, strum: 0, strumDir: 'up', velocity: 0.8,
    filterA: { type: 'ladder', cutoff: 600, res: 0.35, drive: 0.2, env: 3.5, key: 0.5, vel: 1, follow: 0.6 },
    filterB: { type: 'svf-hp12', cutoff: 90, res: 0.1, drive: 0, env: 0, key: 0, follow: 0 },
    routing: 'serial',
    follower: { attack: 0.01, release: 0.18 },
    voiceSpread: 0.5,
    colour: { mode: 'tape', drive: 0.2, mix: 1, bits: 10, rate: 0.3 },
    transient: { attack: 0, sustain: 0 },
    chorus: { mix: 0, rate: 0.5, depth: 0.5, mode: 'juno' },
    eq: { lowCut: 35, highCut: 17000, tilt: 0 },
    width: 1,
    delay: { send: 0.2, mode: 'pingpong', division: '1/8d', feedback: 0.42, lpf: 4500, hpf: 220, sat: 0.2, wow: 0.2, offset: 0.12, grit: 0.4 },
    reverb: { send: 0.25, type: 'hall', size: 0.6, decay: 2.8, predelay: 0.02, damping: 0.45, hpf: 220, mod: 0.5, width: 1, shimmer: 0.4, diffusion: 0.7 },
    delayToReverb: 0.35,
    duck: { amount: 0.3, release: 0.3 },
    sidechain: { mode: 'off', amount: 0.6, release: 0.18, division: '1/4', filter: 0 },
    level: 0,
  };
}

// ---------- path helpers ----------
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}
export const clone = (x) => JSON.parse(JSON.stringify(x));

/** Deep-merge `over` onto `base` (arrays of objects merge per index). */
export function merge(base, over) {
  if (over == null) return base;
  if (Array.isArray(base) && Array.isArray(over)) {
    if (base.length && typeof base[0] === 'object') return base.map((b, i) => merge(b, over[i]));
    return over.slice();
  }
  if (typeof base === 'object' && base && typeof over === 'object') {
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
    return out;
  }
  return over;
}

// ---------- lock groups ----------
export const LOCK_GROUPS = {
  chord: { label: 'Chord', keys: [] },
  osc: { label: 'Oscillators', keys: ['osc', 'sub', 'noise', 'drift', 'driftRate'] },
  filter: { label: 'Filters', keys: ['filterA', 'filterB', 'routing', 'follower'] },
  env: { label: 'Envelopes', keys: ['amp', 'fenv', 'pitchEnv', 'gate', 'strum', 'strumDir', 'velocity'] },
  colour: { label: 'Colour', keys: ['colour', 'transient', 'chorus', 'eq', 'width', 'voiceSpread', 'level', 'texture', 'comp', 'limiter'] },
  space: { label: 'Space', keys: ['delay', 'reverb', 'delayToReverb', 'duck', 'sidechain'] },
};

/** Copy locked groups from `from` into `to`. */
export function applyLocks(to, from, locks) {
  const out = clone(to);
  for (const [g, on] of Object.entries(locks || {})) {
    if (!on || !LOCK_GROUPS[g]) continue;
    for (const k of LOCK_GROUPS[g].keys) out[k] = clone(from[k]);
  }
  return out;
}

// ---------- macros ----------
export const MACROS = [
  { id: 'bite', label: 'Bite', hint: 'Attack snap, filter envelope, click' },
  { id: 'body', label: 'Body', hint: 'Sub, sustain and note length' },
  { id: 'bright', label: 'Brightness', hint: 'Filter cutoff and tilt' },
  { id: 'move', label: 'Movement', hint: 'Envelope follower, drift, chorus, wow' },
  { id: 'grit', label: 'Grit', hint: 'Saturation and filter drive' },
  { id: 'space', label: 'Space', hint: 'Delay and reverb sends and tail length' },
  { id: 'width', label: 'Width', hint: 'Stereo width: mono at 0, extra wide at max' },
];

export const defaultMacros = () => Object.fromEntries(MACROS.map((m) => [m.id, 0.5]));

/** Apply macro offsets (0.5 = neutral) to a patch, returning a new patch. */
export function applyMacros(patch, macros) {
  const p = clone(patch);
  const b = ((macros.bite ?? 0.5) - 0.5) * 2;
  const bd = ((macros.body ?? 0.5) - 0.5) * 2;
  const br = ((macros.bright ?? 0.5) - 0.5) * 2;
  const mv = ((macros.move ?? 0.5) - 0.5) * 2;
  const g = ((macros.grit ?? 0.5) - 0.5) * 2;
  const s = ((macros.space ?? 0.5) - 0.5) * 2;
  const w = ((macros.width ?? 0.5) - 0.5) * 2;

  p.filterA.env = clamp(p.filterA.env + b * 1.5, -6, 8);
  p.amp.a = clamp(p.amp.a * Math.pow(2, -b * 2), 0.0003, 2);
  p.fenv.d = clamp(p.fenv.d * Math.pow(2, -b * 0.6), 0.005, 4);
  p.transient.attack = clamp(p.transient.attack + b * 0.5, -1, 1);
  p.noise.level = clamp(p.noise.level * Math.pow(2, b * 1.2) + Math.max(0, b) * 0.04, 0, 1);

  p.sub.level = clamp(p.sub.level + bd * 0.25, 0, 1);
  p.gate = clamp(p.gate * Math.pow(2, bd * 0.9), 0.05, 8);
  p.amp.s = clamp(p.amp.s + bd * 0.2, 0, 1);
  p.amp.d = clamp(p.amp.d * Math.pow(2, bd * 0.6), 0.01, 6);
  p.eq.lowCut = clamp(p.eq.lowCut * Math.pow(2, -bd * 1.2), 15, 1500);

  p.filterA.cutoff = clamp(p.filterA.cutoff * Math.pow(2, br * 2.2), 30, 18000);
  if (/lp|ladder|diode/.test(p.filterB.type)) p.filterB.cutoff = clamp(p.filterB.cutoff * Math.pow(2, br * 1.5), 30, 18000);
  p.eq.tilt = clamp(p.eq.tilt + br * 0.35, -1, 1);

  p.filterA.follow = clamp(p.filterA.follow + mv * 1.5, -4, 5);
  p.drift = clamp(p.drift * Math.pow(2, mv * 1.5) + Math.max(0, mv) * 3, 0, 60);
  p.chorus.mix = clamp(p.chorus.mix + mv * 0.3, 0, 1);
  p.delay.wow = clamp(p.delay.wow + mv * 0.3, 0, 1);

  if (g > 0.15 && p.colour.mode === 'off') p.colour.mode = 'tape';
  p.colour.drive = clamp(p.colour.drive + g * 0.5, 0, 1);
  p.filterA.drive = clamp(p.filterA.drive + g * 0.4, 0, 1);
  p.delay.grit = clamp((p.delay.grit ?? 0.4) + g * 0.3, 0, 1);

  p.delay.send = clamp(p.delay.send * Math.pow(2, s * 1.6) + Math.max(0, s) * 0.05, 0, 1);
  p.reverb.send = clamp(p.reverb.send * Math.pow(2, s * 1.6) + Math.max(0, s) * 0.05, 0, 1);
  p.reverb.decay = clamp(p.reverb.decay * Math.pow(2, s * 1.2), 0.2, 20);
  p.delay.feedback = clamp(p.delay.feedback + s * 0.18, 0, 0.92);

  // Width: below centre narrows towards mono, above spreads voices, unison,
  // chorus and the tails wider (mid/side up to 1.6).
  const wMul = w < 0 ? 1 + w : 1; // 0 at full left = mono
  p.width = clamp(p.width * wMul + Math.max(0, w) * 0.6, 0, 1.6);
  p.voiceSpread = clamp(p.voiceSpread * wMul + Math.max(0, w) * 0.5, 0, 1);
  for (const o of p.osc) o.spread = clamp(o.spread * wMul + Math.max(0, w) * 0.3, 0, 1);
  p.chorus.mix = clamp(p.chorus.mix + Math.max(0, w) * 0.15, 0, 1);
  p.reverb.width = clamp(p.reverb.width * wMul + Math.max(0, w) * 0.5, 0, 1.5);
  p.delay.offset = clamp((p.delay.offset ?? 0.12) + Math.max(0, w) * 0.1, 0, 0.5);
  return p;
}

// ---------- schema (UI controls) ----------
const r = (path, label, min, max, step, opts = {}) => ({ path, label, kind: 'range', min, max, step, ...opts });
const sel = (path, label, options, labels) => ({ path, label, kind: 'select', options, labels });
const tog = (path, label) => ({ path, label, kind: 'toggle' });

const oscParams = (i) => [
  tog(`osc.${i}.on`, 'On'),
  sel(`osc.${i}.type`, 'Wave', OSC_TYPES, OSC_TYPES.map((t) => OSC_LABELS[t])),
  r(`osc.${i}.level`, 'Level', 0, 1, 0.01),
  r(`osc.${i}.octave`, 'Octave', -2, 2, 1),
  r(`osc.${i}.semi`, 'Semi', -12, 12, 1),
  r(`osc.${i}.fine`, 'Fine', -50, 50, 1, { unit: 'ct' }),
  r(`osc.${i}.pw`, 'Pulse width', 0.05, 0.95, 0.01, { show: ['pulse'] }),
  r(`osc.${i}.shape`, 'Shape (tri › saw › square)', 0, 1, 0.01, { show: ['morph'] }),
  r(`osc.${i}.unison`, 'Unison', 1, 9, 1, { show: ['supersaw'] }),
  r(`osc.${i}.detune`, 'Detune', 0, 100, 1, { unit: 'ct', show: ['supersaw'] }),
  r(`osc.${i}.spread`, 'Stereo', 0, 1, 0.01, { show: ['supersaw'] }),
  r(`osc.${i}.fmRatio`, 'FM ratio', 0.5, 14, 0.5, { show: ['fm'] }),
  r(`osc.${i}.fmIndex`, 'FM index', 0, 12, 0.1, { show: ['fm'] }),
  r(`osc.${i}.fmDecay`, 'FM decay', 0.005, 2, 0.005, { unit: 's', scale: 'log', show: ['fm'] }),
  r(`osc.${i}.fmSustain`, 'FM sustain', 0, 1, 0.01, { show: ['fm'] }),
  r(`osc.${i}.fmFeedback`, 'FM feedback', 0, 1.5, 0.01, { show: ['fm'] }),
  r(`osc.${i}.pd`, 'PD amount', 0, 1, 0.01, { show: ['pd', 'reso'] }),
  r(`osc.${i}.pdDecay`, 'PD decay', 0.01, 2, 0.01, { unit: 's', scale: 'log', show: ['pd', 'reso'] }),
  sel(`osc.${i}.perc`, 'Percussion', [0, 2, 3], ['Off', '2nd', '3rd']),
  r(`osc.${i}.phaseRand`, 'Phase random', 0, 1, 0.01),
];

const filterParams = (k) => [
  sel(`${k}.type`, 'Type', FILTER_TYPES, FILTER_TYPES.map((t) => FILTER_LABELS[t])),
  r(`${k}.cutoff`, 'Cutoff', 30, 18000, 1, { unit: 'Hz', scale: 'log' }),
  r(`${k}.res`, 'Resonance', 0, 1, 0.01),
  r(`${k}.drive`, 'Drive', 0, 1, 0.01),
  r(`${k}.env`, 'Env amount', -6, 8, 0.1, { unit: 'oct' }),
  r(`${k}.key`, 'Key track', 0, 1, 0.01),
  r(`${k}.follow`, 'Follower', -4, 5, 0.1, { unit: 'oct' }),
];

const envParams = (k) => [
  r(`${k}.a`, 'Attack', 0.0003, 2, 0.0001, { unit: 's', scale: 'log' }),
  r(`${k}.d`, 'Decay', 0.005, 6, 0.001, { unit: 's', scale: 'log' }),
  r(`${k}.s`, 'Sustain', 0, 1, 0.01),
  r(`${k}.r`, 'Release', 0.005, 6, 0.001, { unit: 's', scale: 'log' }),
  r(`${k}.curve`, 'Curve', -1, 1, 0.01),
];

export const SCHEMA = [
  { id: 'osc1', label: 'Osc 1', lock: 'osc', params: oscParams(0) },
  { id: 'osc2', label: 'Osc 2', lock: 'osc', params: oscParams(1) },
  { id: 'osc3', label: 'Osc 3', lock: 'osc', params: oscParams(2) },
  {
    id: 'source', label: 'Sub, noise & drift', lock: 'osc', params: [
      r('sub.level', 'Sub level', 0, 1, 0.01),
      r('sub.octave', 'Sub octave', -2, -1, 1),
      sel('sub.wave', 'Sub wave', ['sine', 'tri', 'square']),
      r('noise.level', 'Noise click', 0, 1, 0.01),
      r('noise.decay', 'Click decay', 0.001, 0.3, 0.001, { unit: 's', scale: 'log' }),
      r('noise.colour', 'Click colour', 0, 1, 0.01),
      r('noise.air', 'Air noise', 0, 1, 0.01),
      r('noise.airColour', 'Air colour', 0, 1, 0.01),
      r('drift', 'Analogue drift', 0, 60, 0.5, { unit: 'ct' }),
      r('driftRate', 'Drift rate', 0.05, 8, 0.05, { unit: 'Hz', scale: 'log' }),
    ],
  },
  { id: 'filterA', label: 'Filter A', lock: 'filter', params: filterParams('filterA') },
  { id: 'filterB', label: 'Filter B', lock: 'filter', params: [...filterParams('filterB'), sel('routing', 'Routing', ['serial', 'parallel'])] },
  {
    id: 'follower', label: 'Envelope follower', lock: 'filter', params: [
      r('follower.attack', 'Attack', 0.0005, 1, 0.0005, { unit: 's', scale: 'log' }),
      r('follower.release', 'Release', 0.01, 3, 0.01, { unit: 's', scale: 'log' }),
      r('duck.amount', 'Tail duck', 0, 1, 0.01),
      r('duck.release', 'Duck release', 0.02, 2, 0.01, { unit: 's', scale: 'log' }),
      sel('sidechain.mode', 'Sidechain', ['off', 'pump', 'file'], ['Off', 'Internal kick pump', 'Uploaded audio']),
      r('sidechain.amount', 'SC amount', 0, 1, 0.01),
      r('sidechain.release', 'SC release', 0.02, 1, 0.01, { unit: 's', scale: 'log' }),
      sel('sidechain.division', 'SC rate', Object.keys(DIVISIONS)),
      r('sidechain.filter', 'SC → cutoff', -3, 3, 0.1, { unit: 'oct' }),
    ],
  },
  { id: 'amp', label: 'Amp envelope', lock: 'env', params: [...envParams('amp'), r('amp.attackCurve', 'Attack curve', -1, 1, 0.01)] },
  { id: 'fenv', label: 'Filter envelope', lock: 'env', params: envParams('fenv') },
  {
    id: 'note', label: 'Note & pitch', lock: 'env', params: [
      r('gate', 'Note length', 0.05, 8, 0.05, { unit: 'beats', scale: 'log' }),
      r('velocity', 'Velocity', 0, 1, 0.01),
      r('strum', 'Strum', 0, 0.12, 0.001, { unit: 's' }),
      sel('strumDir', 'Strum dir', ['up', 'down']),
      r('pitchEnv.amount', 'Pitch env', -24, 24, 0.1, { unit: 'st' }),
      r('pitchEnv.decay', 'Pitch decay', 0.001, 1, 0.001, { unit: 's', scale: 'log' }),
    ],
  },
  {
    id: 'colour', label: 'Colour', lock: 'colour', params: [
      sel('colour.mode', 'Saturation', SAT_MODES),
      r('colour.drive', 'Drive', 0, 1, 0.01),
      r('colour.mix', 'Mix', 0, 1, 0.01),
      r('colour.bits', 'Crush bits', 2, 16, 1),
      r('colour.rate', 'Crush rate', 0, 1, 0.01),
      r('transient.attack', 'Transient attack', -1, 1, 0.01),
      r('transient.sustain', 'Transient sustain', -1, 1, 0.01),
      sel('chorus.mode', 'Chorus', ['juno', 'ensemble']),
      r('chorus.mix', 'Chorus mix', 0, 1, 0.01),
      r('chorus.rate', 'Chorus rate', 0, 1, 0.01),
      r('chorus.depth', 'Chorus depth', 0, 1, 0.01),
    ],
  },
  {
    id: 'comp', label: 'Compressor', lock: 'colour', params: [
      r('comp.amount', 'Amount', 0, 1, 0.01),
      sel('comp.mode', 'Mode', ['stab', 'glue'], ['Stab (before delay/reverb)', 'Glue (stab + tails)']),
      r('comp.ratio', 'Ratio', 1, 20, 0.5, { unit: ':1', scale: 'log' }),
      r('comp.attack', 'Attack', 0.0002, 0.3, 0.0001, { unit: 's', scale: 'log' }),
      r('comp.release', 'Release', 0.01, 2, 0.01, { unit: 's', scale: 'log' }),
      r('comp.mix', 'Mix (parallel)', 0, 1, 0.01),
      tog('limiter.on', 'Limiter'),
      r('limiter.drive', 'Limiter drive', 0, 18, 0.5, { unit: 'dB' }),
      r('limiter.release', 'Limiter release', 0.005, 1, 0.005, { unit: 's', scale: 'log' }),
    ],
  },
  {
    id: 'texture', label: 'Crackle & hiss', lock: 'colour', params: [
      r('texture.crackle', 'Crackle', 0, 1, 0.01),
      r('texture.density', 'Crackle density', 0, 1, 0.01),
      r('texture.tone', 'Crackle tone', 0, 1, 0.01),
      r('texture.hiss', 'Hiss', 0, 1, 0.01),
      r('texture.follow', 'Follow the sound', 0, 1, 0.01),
    ],
  },
  {
    id: 'output', label: 'Output', lock: 'colour', params: [
      r('eq.lowCut', 'Low cut', 15, 1500, 1, { unit: 'Hz', scale: 'log' }),
      r('eq.highCut', 'High cut', 1000, 20000, 1, { unit: 'Hz', scale: 'log' }),
      r('eq.tilt', 'Tilt', -1, 1, 0.01),
      r('width', 'Width', 0, 1.5, 0.01),
      r('voiceSpread', 'Voice spread', 0, 1, 0.01),
      r('level', 'Level', -24, 12, 0.5, { unit: 'dB' }),
    ],
  },
  {
    id: 'delay', label: 'Delay', lock: 'space', params: [
      r('delay.send', 'Send', 0, 1, 0.01),
      sel('delay.mode', 'Mode', DELAY_MODES),
      sel('delay.division', 'Time', Object.keys(DIVISIONS)),
      r('delay.feedback', 'Feedback', 0, 0.95, 0.01),
      r('delay.lpf', 'Loop LP', 300, 18000, 1, { unit: 'Hz', scale: 'log' }),
      r('delay.hpf', 'Loop HP', 20, 2000, 1, { unit: 'Hz', scale: 'log' }),
      r('delay.sat', 'Loop drive', 0, 1, 0.01),
      r('delay.wow', 'Wow/flutter', 0, 1, 0.01),
      r('delay.grit', 'Tape grit', 0, 1, 0.01),
      r('delayToReverb', 'Delay → reverb', 0, 1, 0.01),
    ],
  },
  {
    id: 'reverb', label: 'Reverb', lock: 'space', params: [
      r('reverb.send', 'Send', 0, 1, 0.01),
      sel('reverb.type', 'Type', REVERB_TYPES),
      r('reverb.size', 'Size', 0, 1, 0.01),
      r('reverb.decay', 'Decay', 0.2, 20, 0.1, { unit: 's', scale: 'log' }),
      r('reverb.predelay', 'Pre-delay', 0, 0.3, 0.001, { unit: 's' }),
      r('reverb.damping', 'Damping', 0, 1, 0.01),
      r('reverb.hpf', 'Tail HP', 20, 2000, 1, { unit: 'Hz', scale: 'log' }),
      r('reverb.mod', 'Modulation', 0, 1, 0.01),
      r('reverb.width', 'Width', 0, 1.5, 0.01),
      r('reverb.shimmer', 'Shimmer', 0, 0.8, 0.01),
    ],
  },
];
