// Shared DSP helpers. Pure functions, no platform dependencies, so the core
// can be ported to C++ (plugin) or Swift (iOS) line for line.

export const TWO_PI = Math.PI * 2;

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-12));
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const centsToRatio = (c) => Math.pow(2, c / 1200);

// Pade-style tanh approximation, accurate enough for saturation and cheap.
export function fastTanh(x) {
  if (x > 4.97) return 1;
  if (x < -4.97) return -1;
  const x2 = x * x;
  return (x * (135135 + x2 * (17325 + x2 * (378 + x2)))) /
    (135135 + x2 * (62370 + x2 * (3150 + x2 * 28)));
}

// One-pole coefficient for a time constant in seconds (to ~63%).
export const onePoleCoef = (seconds, sr) =>
  seconds <= 0 ? 0 : Math.exp(-1 / (seconds * sr));

// Equal-power pan, p in [-1, 1].
export function panGains(p) {
  const a = (clamp(p, -1, 1) + 1) * Math.PI * 0.25;
  return [Math.cos(a), Math.sin(a)];
}

// Beat-division names to beats (quarter note = 1 beat).
export const DIVISIONS = {
  '1/32': 0.125, '1/16t': 1 / 6, '1/16': 0.25, '1/16d': 0.375,
  '1/8t': 1 / 3, '1/8': 0.5, '1/8d': 0.75,
  '1/4t': 2 / 3, '1/4': 1, '1/4d': 1.5,
  '1/2': 2, '1/2d': 3, '1/1': 4,
};

export const beatsToSeconds = (beats, bpm) => (beats * 60) / bpm;

// Simple DC blocker (high-pass at ~10 Hz).
export class DCBlocker {
  constructor(sr) { this.r = 1 - (TWO_PI * 10) / sr; this.x1 = 0; this.y1 = 0; }
  process(x) {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x; this.y1 = y;
    return y;
  }
}
