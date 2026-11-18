// Tonal instruments built on Stab Lab's Voice: chord stabs, pads and the
// lead. Each takes a Stab Lab patch (a preset, tweaked per track) and plays
// chords (arrays of MIDI notes) or single notes. Plus the FX track: risers,
// downlifters, noise washes and glitch stutters.

import { clamp, fastTanh, panGains } from '../dsp/util.js';
import { SVFCore, prewarp, OnePoleHP } from '../dsp/filters.js';
import { Voice } from '../stab/voice.js';
import { presetPatch } from '../stab/presets.js';
import { merge, clone } from '../stab/patch.js';

/** A Stab Lab patch from a preset id plus overrides. */
export function stabPatch(presetId, over = {}) {
  return merge(presetPatch(presetId), over);
}

// Poly instrument: one Voice per chord note, voices freed when done.
export class PolyVoices {
  constructor(sr, p, rng) {
    this.sr = sr; this.p = p; this.rng = rng;
    this.patch = clone(p.patch);
    this.voices = [];
    this.max = p.maxVoices ?? 12;
    this.l = 0; this.r = 0;
  }
  setPatch(patch) { this.patch = clone(patch); }
  /** note: number or array of numbers (a chord). lenSec: gate length. */
  trigger(note, vel, lenSec) {
    const notes = Array.isArray(note) ? [...note].sort((a, b) => a - b) : [note];
    const patch = { ...this.patch, velocity: clamp(vel, 0.05, 1) };
    const strum = Math.round((patch.strum ?? 0) * this.sr);
    notes.forEach((n, i) => {
      if (this.voices.length >= this.max) this.voices.shift(); // steal the oldest
      this.voices.push(new Voice(this.sr, patch, n, i, notes.length, this.rng.fork(`v${n}${i}`), Math.max(0.02, lenSec), strum * i));
    });
    this.gain = 0.55 / Math.sqrt(Math.max(1, notes.length));
  }
  process() {
    let l = 0, r = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      v.process(0);
      l += v.l; r += v.r;
      if (v.done) { this.voices.splice(i, 1); i--; }
    }
    const g = this.gain ?? 0.3;
    this.l = l * g; this.r = r * g;
  }
}

// ---------------------------------------------------------------- FX
// note selects the effect; lenSec is how long it lasts.
// 0 riser (noise + sweeping band-pass up), 1 downlifter (sweep down),
// 2 noise wash (soft swell and decay), 3 glitch stutter (gated noise bursts).
export class Fx {
  constructor(sr, p = {}, rng) {
    this.sr = sr; this.p = p; this.rng = rng;
    this.bp = [new SVFCore(), new SVFCore()];
    this.hp = [new OnePoleHP(sr, 120), new OnePoleHP(sr, 120)];
    this.active = false; this.l = 0; this.r = 0;
  }
  trigger(note, vel, lenSec) {
    this.kind = note; this.vel = vel; this.n = 0;
    this.len = Math.max(0.05, lenSec) * this.sr; this.active = true;
    this.gate = 1; this.gateN = 0; this.gateLen = Math.round(this.sr * (0.03 + this.rng.next() * 0.08));
  }
  process() {
    if (!this.active) { this.l = this.r = 0; return; }
    const t = this.n / this.len;
    if (t >= 1 && this.kind !== 2) { this.active = false; this.l = this.r = 0; return; }
    let fc, amp;
    switch (this.kind) {
      case 0: fc = 300 * Math.pow(40, t); amp = t * t; break;                         // riser
      case 1: fc = 9000 * Math.pow(0.02, t); amp = (1 - t) ** 2; break;               // downlifter
      case 2: fc = 3000; amp = t < 0.1 ? t / 0.1 : Math.exp(-(t - 0.1) * 3); if (t > 0.1 && amp < 1e-4) this.active = false; break; // wash
      case 3: {                                                                        // stutter
        if (++this.gateN >= this.gateLen) { this.gateN = 0; this.gate = this.gate ? 0 : 1; }
        fc = 1500 + 3000 * Math.sin(t * 40); amp = this.gate * (1 - t); break;
      }
      default: this.active = false; return;
    }
    if (this.n % 32 === 0) for (const b of this.bp) b.set(prewarp(clamp(fc, 60, 16000), this.sr), 0.5);
    this.bp[0].tick(this.rng.bipolar()); this.bp[1].tick(this.rng.bipolar());
    const g = amp * this.vel * 0.9;
    this.l = this.hp[0].process(this.bp[0].band) * g * 1.8;
    this.r = this.hp[1].process(this.bp[1].band) * g * 1.8;
    this.n++;
  }
}

export { panGains, fastTanh };
