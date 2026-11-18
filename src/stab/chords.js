// Chord building, voicing, random choice and mutation.
// A chord is { notes: number[] (MIDI, ascending), name: string }.

import { CHORD_BY_ID, CHORD_TYPES, SCALES, detectChord, dissonanceOf } from './theory.js';
import { clamp } from '../dsp/util.js';

export const VOICINGS = ['close', 'open', 'drop2', 'drop3', 'spread', 'wide'];

const finish = (notes) => {
  const uniq = [...new Set(notes.map((n) => clamp(Math.round(n), 24, 100)))].sort((a, b) => a - b);
  return { notes: uniq, name: detectChord(uniq) };
};

/** Centre a voicing so its average pitch sits near `centre` (MIDI). */
function centreOn(notes, centre) {
  const avg = notes.reduce((a, b) => a + b, 0) / notes.length;
  const shift = Math.round((centre - avg) / 12) * 12;
  return notes.map((n) => n + shift);
}

/**
 * @param {object} spec { root: 0..11, type: chord id, inversion: int, voicing, centre, bass: bool, top: bool }
 */
export function buildChord(spec) {
  const t = CHORD_BY_ID[spec.type] ?? CHORD_BY_ID.min7;
  let notes = t.iv.map((i) => 48 + spec.root + i);
  notes = applyInversion(notes, spec.inversion ?? 0);
  notes = applyVoicing(notes, spec.voicing ?? 'close');
  notes = centreOn(notes, spec.centre ?? 60);
  if (spec.bass) {
    // Root in the bass, at least a fourth below the voicing.
    const low = Math.min(...notes);
    let b = low - ((((low - spec.root) % 12) + 12) % 12);
    if (b > low - 5) b -= 12;
    notes.unshift(b);
  }
  if (spec.top) notes.push(Math.max(...notes) + 12); // double the top note
  return finish(notes);
}

export function applyInversion(notes, inv) {
  let n = [...notes].sort((a, b) => a - b);
  const steps = ((inv % n.length) + n.length) % n.length;
  for (let i = 0; i < steps; i++) { const low = n.shift(); n.push(low + 12); }
  return n;
}

export function applyVoicing(notes, v) {
  const n = [...notes].sort((a, b) => a - b);
  switch (v) {
    case 'drop2':
      if (n.length >= 3) { const i = n.length - 2; n[i] -= 12; }
      break;
    case 'drop3':
      if (n.length >= 4) { const i = n.length - 3; n[i] -= 12; }
      break;
    case 'open':
      for (let i = 1; i < n.length; i += 2) n[i] += 12;
      break;
    case 'spread':
      for (let i = 0; i < n.length; i++) n[i] += 12 * Math.floor(i / 2);
      break;
    case 'wide':
      n[0] -= 12;
      if (n.length > 2) n[n.length - 1] += 12;
      break;
    default: break;
  }
  return n.sort((a, b) => a - b);
}

/** Diatonic chord on a scale degree, stacking thirds within the scale. */
export function diatonicChord(key, scaleName, degree, size = 4, centre = 60) {
  const scale = SCALES[scaleName] ?? SCALES.minor;
  const notes = [];
  for (let k = 0; k < size; k++) {
    const idx = degree + k * 2;
    const oct = Math.floor(idx / scale.length);
    notes.push(48 + key + scale[idx % scale.length] + 12 * oct);
  }
  return finish(centreOn(notes, centre));
}

/**
 * Random chord. dissonance 0..1 steers the chord vocabulary; inKey keeps roots
 * on the scale; higher dissonance also loosens that.
 */
export function randomChord(rng, { key = 9, scale = 'minor', dissonance = 0.2, centre = 60, inKey = true } = {}) {
  const D = clamp(dissonance, 0, 1);
  // At the very top, sometimes skip the vocabulary and throw random pitches.
  if (D > 0.85 && rng.chance((D - 0.85) * 3)) {
    const count = rng.int(3, 6);
    const notes = [];
    for (let i = 0; i < count; i++) notes.push(centre - 9 + rng.int(0, 20));
    return finish(notes);
  }
  const sigma = 0.12 + D * 0.15;
  const type = rng.weighted(CHORD_TYPES, (t) => Math.exp(-((t.dis - D) ** 2) / (2 * sigma * sigma)));
  const sc = SCALES[scale] ?? SCALES.minor;
  const root = inKey && !rng.chance(D * 0.5) ? (key + rng.pick(sc)) % 12 : rng.int(0, 11);
  return buildChord({
    root, type: type.id,
    inversion: rng.int(0, 3),
    voicing: rng.weighted(VOICINGS, (v) => (v === 'close' ? 3 : v === 'open' || v === 'drop2' ? 2 : 1)),
    centre: centre + rng.int(-3, 3),
    bass: rng.chance(0.25),
  });
}

const TENSIONS = [2, 5, 6, 9, 10, 11, 13, 14, 1, 8];

/**
 * Mutate a chord. strength 0..1 controls how many operations are applied.
 * Several candidates are tried and the one whose dissonance best matches the
 * target wins, so low dissonance stays musical and high dissonance gets wild.
 */
export function mutateChord(rng, chord, opts = {}) {
  const D = clamp(opts.dissonance ?? 0.3, 0, 1);
  const sc = SCALES[opts.scale ?? 'minor'] ?? SCALES.minor;
  const key = opts.key ?? 9;
  const outOfKey = (c) => c.notes.filter((m) => !sc.includes(((m - key) % 12 + 12) % 12)).length / c.notes.length;
  const named = (c) => !c.name.includes('·');
  let best = null, bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    let c = mutateOnce(rng, chord, opts);
    if (D < 0.5 && rng.chance(1 - D * 2)) c = snapToScale(c, key, sc);
    if (c.notes.join() === chord.notes.join()) continue;
    const pcs = (x) => [...new Set(x.notes.map((m) => m % 12))].sort().join();
    const score = Math.abs(dissonanceOf(c.notes) - (0.15 + D * 0.8))
      + (named(c) ? 0 : 0.25 * (1 - D))
      + (pcs(c) === pcs(chord) ? 0.3 : 0)                 // prefer a genuinely new chord
      + Math.abs(c.notes.length - chord.notes.length) * 0.06 // keep its richness
      + outOfKey(c) * 0.6 * (1 - D)
      + rng.next() * 0.08;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best ?? chord;
}

export function snapToScale(chord, key, sc) {
  const notes = chord.notes.map((m) => {
    const pc = ((m - key) % 12 + 12) % 12;
    if (sc.includes(pc)) return m;
    return sc.includes((pc + 1) % 12) ? m + 1 : m - 1;
  });
  return finish(notes);
}

function mutateOnce(rng, chord, { strength = 0.4, dissonance = 0.3, key = 9, scale = 'minor' } = {}) {
  let n = [...chord.notes];
  const ops = 1 + Math.floor(clamp(strength, 0, 1) * 3 + rng.next() * strength * 2);
  const sc = SCALES[scale] ?? SCALES.minor;
  const inScale = (m) => sc.includes(((m - key) % 12 + 12) % 12);
  for (let k = 0; k < ops; k++) {
    const op = rng.weighted(
      ['nudge', 'add', 'remove', 'invert', 'octave', 'transpose', 'revoice'],
      (o) => ({ nudge: 3, add: 2, remove: n.length > 3 ? 1.5 : 0, invert: 1.5, octave: 1.5, transpose: 1, revoice: 1 })[o],
    );
    switch (op) {
      case 'nudge': {
        const i = rng.int(0, n.length - 1);
        let step = rng.pick([-1, 1]) * (rng.chance(0.6) ? 1 : 2);
        // Low dissonance prefers landing in the scale.
        if (dissonance < 0.5 && !inScale(n[i] + step) && inScale(n[i] - step)) step = -step;
        n[i] += step;
        break;
      }
      case 'add': {
        if (n.length >= 7) break;
        const root = n[0];
        const pool = dissonance > 0.5 ? TENSIONS : TENSIONS.slice(0, 6);
        n.push(root + rng.pick(pool) + (rng.chance(0.5) ? 12 : 0));
        break;
      }
      case 'remove': n.splice(rng.int(1, n.length - 1), 1); break;
      case 'invert': n = applyInversion(n, rng.chance(0.5) ? 1 : -1); break;
      case 'octave': { const i = rng.int(0, n.length - 1); n[i] += rng.pick([-12, 12]); break; }
      case 'transpose': {
        const shift = dissonance > 0.6 ? rng.int(-6, 6) : rng.pick([-5, -3, -2, 2, 3, 5, 7]);
        n = n.map((x) => x + shift);
        break;
      }
      case 'revoice': n = applyVoicing(n, rng.pick(VOICINGS)); break;
      default: break;
    }
  }
  // Keep within a sensible register for stabs.
  const avg = n.reduce((a, b) => a + b, 0) / n.length;
  if (avg > 78) n = n.map((x) => x - 12);
  if (avg < 44) n = n.map((x) => x + 12);
  const out = finish(n);
  return out.notes.length >= 2 ? out : chord;
}

/** Common stab progressions as scale degrees (0-based). */
export const PROGRESSIONS = {
  'i-VI-III-VII': [0, 5, 2, 6],
  'i-iv-v': [0, 3, 4],
  'i-VII-VI': [0, 6, 5],
  'ii-V-I': [1, 4, 0],
  'I-V-vi-IV': [0, 4, 5, 3],
  'all degrees': [0, 1, 2, 3, 4, 5, 6],
};
