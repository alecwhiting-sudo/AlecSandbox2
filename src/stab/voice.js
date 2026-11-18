// Stab Lab's per-note voice, reused live: oscillators, sub, click, air noise,
// two filters with envelope + follower, amp envelope, pan. One Voice plays one
// note of a chord for a fixed gate length; process() streams a stereo sample.
// (From AlecSandbox1 src/dsp/render.js; the offline renderStab was dropped.)

import { clamp, midiToHz, panGains } from '../dsp/util.js';
import { Oscillator, Noise } from '../dsp/oscillators.js';
import { ADSR, EnvelopeFollower, PitchEnv, Drift } from '../dsp/envelope.js';
import { createFilter } from '../dsp/filters.js';

const CTRL = 16; // control-rate interval in samples

export class Voice {
  constructor(sr, patch, note, index, count, rng, gateSec, startOffset) {
    this.sr = sr;
    this.patch = patch;
    this.note = note;
    this.start = startOffset;
    const freq = midiToHz(note);
    this.oscs = [];
    for (const o of patch.osc) {
      if (!o.on || o.level <= 0) continue;
      const f = freq * Math.pow(2, (o.octave ?? 0) + (o.semi ?? 0) / 12 + (o.fine ?? 0) / 1200);
      this.oscs.push({ osc: new Oscillator(sr, o, f, rng.fork('osc' + this.oscs.length)), level: o.level });
    }
    const isLowest = index === 0;
    this.sub = null;
    if (isLowest && patch.sub && patch.sub.level > 0) {
      const t = patch.sub.wave === 'square' ? 'square' : patch.sub.wave === 'tri' ? 'tri' : 'sine';
      this.sub = { osc: new Oscillator(sr, { type: t, pw: 0.5, phaseRand: 0 }, freq * Math.pow(2, patch.sub.octave ?? -1), rng), level: patch.sub.level };
    }
    this.noise = null;
    if (isLowest && patch.noise && patch.noise.level > 0) {
      this.noise = new Noise(rng.fork('noise'), patch.noise.colour ?? 0.6);
      this.noiseLevel = patch.noise.level;
      this.noiseK = Math.exp(-1 / (Math.max(patch.noise.decay ?? 0.02, 0.001) * sr));
      this.noiseEnv = 1;
    }
    // Air: sustained noise through the filter and amp envelope (breath, grit).
    this.air = null;
    if (isLowest && patch.noise && (patch.noise.air ?? 0) > 0) {
      const col = patch.noise.airColour ?? 0.7;
      this.air = [new Noise(rng.fork('airL'), col), new Noise(rng.fork('airR'), col)];
      // Scale with the chord so a big chord gets proportionally more air.
      this.airLevel = patch.noise.air * 0.45 * Math.sqrt(count);
    }
    this.amp = new ADSR(sr, patch.amp, gateSec);
    this.fenv = new ADSR(sr, patch.fenv, gateSec);
    this.pitch = new PitchEnv(sr, patch.pitchEnv?.amount ?? 0, patch.pitchEnv?.decay ?? 0.03);
    this.drift = new Drift(sr, rng.fork('drift'), patch.drift ?? 0, patch.driftRate ?? 0.6);
    this.follower = new EnvelopeFollower(sr, patch.follower?.attack ?? 0.01, patch.follower?.release ?? 0.15);
    this.fA = [createFilter(patch.filterA.type, sr), createFilter(patch.filterA.type, sr)];
    this.fBOn = patch.filterB && patch.filterB.type !== 'off';
    if (this.fBOn) this.fB = [createFilter(patch.filterB.type, sr), createFilter(patch.filterB.type, sr)];
    const pos = count === 1 ? 0 : (index / (count - 1)) * 2 - 1;
    // Alternate sides so adjacent notes separate rather than low-left/high-right.
    const alt = count > 2 ? (index % 2 ? 1 : -1) * Math.abs(pos) * 0.6 + pos * 0.4 : pos;
    [this.pl, this.pr] = panGains(alt * clamp(patch.voiceSpread ?? 0.5, 0, 1));
    this.keyOct = (note - 60) / 12;
    this.vel = clamp(patch.velocity ?? 0.8, 0, 1);
    this.ampVel = 0.4 + 0.6 * this.vel;
    this.n = 0;
    this.pitchMul = 1;
    this.lastOut = 0;
    this.l = 0; this.r = 0;
    this.done = false;
  }

  updateControl(scMod) {
    const p = this.patch;
    const semis = this.pitch.v;
    for (let i = 1; i < CTRL; i++) this.pitch.process();
    this.pitch.process();
    this.pitchMul = Math.pow(2, (semis * 100 + this.drift.y) / 1200);
    const fe = this.fenv.level;
    const fol = clamp(this.follower.y * 2.5, 0, 1.5);
    const velOct = (this.vel - 0.7) * (p.filterA.vel ?? 1);
    const a = p.filterA;
    const cutA = a.cutoff * Math.pow(2, (a.env ?? 0) * fe + (a.key ?? 0.5) * this.keyOct + velOct + (a.follow ?? 0) * fol + scMod * (p.sidechain?.filter ?? 0));
    this.fA[0].set(cutA, a.res, a.drive); this.fA[1].set(cutA, a.res, a.drive);
    if (this.fBOn) {
      const b = p.filterB;
      const cutB = b.cutoff * Math.pow(2, (b.env ?? 0) * fe + (b.key ?? 0) * this.keyOct + (b.follow ?? 0) * fol);
      this.fB[0].set(cutB, b.res, b.drive); this.fB[1].set(cutB, b.res, b.drive);
    }
  }

  process(scMod) {
    if (this.n < this.start) { this.n++; this.l = 0; this.r = 0; return; }
    const local = this.n - this.start;
    if (local % CTRL === 0) this.updateControl(scMod);
    this.drift.process();
    this.fenv.process();
    const pm = this.pitchMul;
    let l = 0, r = 0;
    for (const o of this.oscs) { o.osc.process(pm); l += o.osc.l * o.level; r += o.osc.r * o.level; }
    if (this.sub) { this.sub.osc.process(pm); const s = this.sub.osc.l * this.sub.level; l += s; r += s; }
    if (this.noise) {
      const s = this.noise.process() * this.noiseLevel * this.noiseEnv;
      this.noiseEnv *= this.noiseK; l += s; r += s;
    }
    if (this.air) { l += this.air[0].process() * this.airLevel; r += this.air[1].process() * this.airLevel; }
    const p = this.patch;
    let yl, yr;
    if (this.fBOn && p.routing === 'parallel') {
      yl = (this.fA[0].process(l) + this.fB[0].process(l)) * 0.7;
      yr = (this.fA[1].process(r) + this.fB[1].process(r)) * 0.7;
    } else {
      yl = this.fA[0].process(l); yr = this.fA[1].process(r);
      if (this.fBOn) { yl = this.fB[0].process(yl); yr = this.fB[1].process(yr); }
    }
    const env = this.amp.process() * this.ampVel;
    yl *= env; yr *= env;
    // Follower tracks this voice's own output (one sample behind).
    this.follower.process((yl + yr) * 0.5);
    this.l = yl * this.pl; this.r = yr * this.pr;
    this.n++;
    if (this.amp.done) this.done = true;
  }
}
