// Envelopes and envelope followers.

import { clamp, onePoleCoef } from './util.js';

// Shapes a 0..1 ramp. c > 0 starts fast and slows down (exponential-like),
// c < 0 starts slow, c = 0 is linear.
function shape(t, c) {
  if (Math.abs(c) < 1e-3) return t;
  return (1 - Math.exp(-c * t)) / (1 - Math.exp(-c));
}

/**
 * ADSR with curve control and a fixed gate length (stabs are one-shots).
 * Times in seconds. curve and attackCurve in -1..1.
 */
export class ADSR {
  constructor(sr, { a = 0.002, d = 0.2, s = 0, r = 0.2, curve = 0.6, attackCurve = 0.3 } = {}, gateSeconds = 0.25) {
    this.sr = sr;
    this.a = Math.max(a, 0.0002) * sr;
    this.d = Math.max(d, 0.001) * sr;
    this.s = clamp(s, 0, 1);
    this.r = Math.max(r, 0.002) * sr;
    this.c = curve * 8;
    this.ac = attackCurve * 6;
    this.gate = Math.max(1, Math.round(gateSeconds * sr));
    this.n = 0;
    this.stage = 0; // 0 attack, 1 decay/sustain, 2 release, 3 done
    this.stageN = 0;
    this.level = 0;
    this.relStart = 0;
  }

  get done() { return this.stage === 3; }

  // Samples until the envelope reaches zero.
  get lengthSamples() { return this.gate + this.r; }

  process() {
    if (this.n === this.gate && this.stage < 2) {
      this.stage = 2; this.stageN = 0; this.relStart = this.level;
    }
    switch (this.stage) {
      case 0:
        this.level = shape(this.stageN / this.a, this.ac);
        if (++this.stageN >= this.a) { this.stage = 1; this.stageN = 0; this.level = 1; }
        break;
      case 1:
        if (this.stageN < this.d) {
          this.level = 1 + (this.s - 1) * shape(this.stageN / this.d, this.c);
          this.stageN++;
        } else this.level = this.s;
        break;
      case 2:
        this.level = this.relStart * (1 - shape(this.stageN / this.r, this.c));
        if (++this.stageN >= this.r) { this.stage = 3; this.level = 0; }
        break;
      default:
        this.level = 0;
    }
    this.n++;
    return this.level;
  }
}

/**
 * Envelope follower: rectify then smooth with separate attack and release.
 * Output is linear amplitude (roughly 0..1 for normal signals).
 */
export class EnvelopeFollower {
  constructor(sr, attack = 0.005, release = 0.12) {
    this.set(sr, attack, release);
    this.y = 0;
  }
  set(sr, attack, release) {
    this.ca = onePoleCoef(Math.max(attack, 0.0001), sr);
    this.cr = onePoleCoef(Math.max(release, 0.001), sr);
  }
  process(x) {
    const v = Math.abs(x);
    const c = v > this.y ? this.ca : this.cr;
    this.y = v + c * (this.y - v);
    return this.y;
  }
}

/** Decaying pitch envelope in semitones: amount * exp(-t / decay). */
export class PitchEnv {
  constructor(sr, amount = 0, decay = 0.03) {
    this.amount = amount;
    this.k = Math.exp(-1 / (Math.max(decay, 0.0005) * sr));
    this.v = amount;
  }
  process() {
    const v = this.v;
    this.v *= this.k;
    return v;
  }
}

/** Slow random walk for analogue pitch drift, output in cents. */
export class Drift {
  constructor(sr, rng, cents = 0, rate = 0.7) {
    this.rng = rng;
    this.cents = cents;
    this.k = 1 - Math.exp(-6.283 * rate / sr);
    this.target = rng.bipolar();
    this.y = rng.bipolar() * 0.5;
    this.count = 0;
    this.period = Math.max(1, Math.round(sr / (rate * 4)));
  }
  process() {
    if (++this.count >= this.period) { this.count = 0; this.target = this.rng.bipolar(); }
    this.y += (this.target - this.y) * this.k;
    return this.y * this.cents;
  }
}
