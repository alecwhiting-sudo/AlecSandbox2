// Tempo-synced stereo delay: stereo, ping-pong and tape modes.
// Filtering and saturation sit inside the feedback loop, so repeats darken
// and smear like a real dub delay.
//
// Tape mode models a worn tape echo. Each pass through the loop goes through:
//   record saturation   asymmetric, biased tanh (bounded, as RatMode requires)
//   head bump           a low-mid resonance around 110 Hz
//   gap loss            a low-pass that darkens with grit
//   modulation noise    hiss that rides the signal, so the tail still ends
//   wow and flutter     slow drift + random wander + 5-7 Hz flutter + scrape
//   dropouts            brief level dips from worn oxide
// "grit" (0..1) scales all of it. In the other modes grit only adds loop drive.

import { clamp, fastTanh, DIVISIONS, beatsToSeconds, TWO_PI } from './util.js';
import { OnePoleLP, OnePoleHP, SVFCore, prewarp } from './filters.js';
import { Rng } from './rng.js';

export const DELAY_MODES = ['stereo', 'pingpong', 'tape'];

class Line {
  constructor(size) { this.buf = new Float64Array(size); this.size = size; this.w = 0; }
  write(x) { this.buf[this.w] = x; this.w = (this.w + 1) % this.size; }
  read(d) {
    let rp = this.w - d; while (rp < 0) rp += this.size;
    const i = Math.floor(rp), f = rp - i;
    const a = this.buf[i], b = this.buf[(i + 1) % this.size];
    return a + (b - a) * f;
  }
}

// Per-channel tape loop colouring.
class TapeChannel {
  constructor(sr, grit, rng) {
    this.rng = rng;
    this.bump = new SVFCore();
    this.bump.set(prewarp(110, sr), 1.2);
    this.bias = 0.06 + grit * 0.08;
    this.drive = 1 + grit * 2.5;
    // Unity gain for small signals, so the loop never gains level: grit
    // compresses and colours loud repeats instead of feeding back harder.
    const t = Math.tanh(this.drive * this.bias);
    this.norm = 1 / (this.drive * (1 - t * t));
    this.bumpAmt = 0.2 + grit * 0.4;
    this.env = 0;
    this.envK = 1 - Math.exp(-1 / (0.01 * sr));
    this.hiss = 0.02 + grit * 0.09;
    this.hissLP = new OnePoleLP(sr, 9000);
  }
  process(x) {
    // Record stage: biased tanh gives even harmonics and soft compression.
    const d = this.drive;
    let y = (fastTanh(d * (x + this.bias)) - fastTanh(d * this.bias)) * this.norm;
    // Head bump
    // Head bump as a relative tilt: peak gain stays at 1, everything else
    // sits slightly lower, so it can't build up into a low-frequency drone.
    this.bump.tick(y);
    y = (y + this.bump.band * this.bumpAmt) / (1 + this.bumpAmt);
    // Modulation noise: hiss proportional to the signal level on the tape.
    this.env += (Math.abs(y) - this.env) * this.envK;
    y += this.hissLP.process(this.rng.bipolar()) * this.env * this.hiss;
    return y;
  }
}

export class StereoDelay {
  constructor(sr, bpm, p = {}, rng = new Rng(7)) {
    this.sr = sr;
    this.rng = rng;
    this.mode = p.mode ?? 'pingpong';
    const tape = this.mode === 'tape';
    this.grit = clamp(p.grit ?? (tape ? 0.45 : 0), 0, 1);
    const beats = DIVISIONS[p.division ?? '1/8d'] ?? 0.75;
    const secs = clamp(beatsToSeconds(beats, bpm), 0.02, 2.5);
    this.dL = secs * sr;
    // In stereo mode the right side is offset for width (or has its own time).
    if (this.mode === 'stereo' && p.divisionR && DIVISIONS[p.divisionR]) {
      this.dR = clamp(beatsToSeconds(DIVISIONS[p.divisionR], bpm), 0.02, 2.9) * sr;
    } else if (this.mode === 'stereo') {
      this.dR = clamp(secs * (1 + (p.offset ?? 0.12)), 0.02, 2.9) * sr;
    } else if (tape) {
      // Two playback heads a hair apart: a wide, slightly smeared tape image.
      this.dR = this.dL * 1.012;
    } else this.dR = this.dL;
    const size = Math.ceil(3.2 * sr);
    this.L = new Line(size); this.R = new Line(size);
    this.fb = clamp(p.feedback ?? 0.4, 0, 0.97);
    // Gap loss: tape darkens more as grit rises.
    const lpf = (p.lpf ?? 5000) * (tape ? Math.pow(2, -this.grit * 1.3) : 1);
    this.lp = [new OnePoleLP(sr, lpf), new OnePoleLP(sr, lpf)];
    this.lp2 = tape ? [new OnePoleLP(sr, lpf * 1.6), new OnePoleLP(sr, lpf * 1.6)] : null;
    this.hp = [new OnePoleHP(sr, p.hpf ?? 200), new OnePoleHP(sr, p.hpf ?? 200)];
    this.sat = clamp((p.sat ?? 0.2) + this.grit * 0.5, 0, 1);
    this.tape = tape ? [new TapeChannel(sr, this.grit, rng.fork('tL')), new TapeChannel(sr, this.grit, rng.fork('tR'))] : null;
    // Separate record-head colouring for the incoming signal.
    this.rec = tape ? [new TapeChannel(sr, this.grit * 0.7, rng.fork('rL')), new TapeChannel(sr, this.grit * 0.7, rng.fork('rR'))] : null;
    this.wow = tape ? clamp((p.wow ?? 0.4) + this.grit * 0.4, 0, 1.4) : clamp(p.wow ?? 0, 0, 1) * 0.3;
    this.ph = 0; this.ph2 = 0.37; this.ph3 = 0.71;
    // Random wander (smoothed noise) for the wow.
    this.wander = 0; this.wanderT = 0; this.wanderK = 1 - Math.exp(-1 / (0.4 * sr));
    this.wanderN = 0; this.wanderEvery = Math.round(sr * 0.25);
    // Dropouts
    this.dropProb = tape ? (this.grit * 0.8) / sr : 0;
    this.drop = 1; this.dropTarget = 1; this.dropHold = 0;
    this.dropK = 1 - Math.exp(-1 / (0.012 * sr));
    this.l = 0; this.r = 0;
  }
  sat1(x) {
    if (this.sat === 0) return x;
    const d = 1 + this.sat * 3;
    return fastTanh(x * d) / d;
  }
  /** Feed dry stereo input; writes wet-only output to this.l / this.r. */
  process(inL, inR) {
    const sr = this.sr;
    let mod = 0;
    if (this.wow > 0) {
      this.ph += 0.6 / sr; if (this.ph >= 1) this.ph -= 1;   // wow
      this.ph2 += 5.6 / sr; if (this.ph2 >= 1) this.ph2 -= 1; // flutter
      mod = Math.sin(TWO_PI * this.ph) * 0.0022 + Math.sin(TWO_PI * this.ph2) * 0.00035;
      if (this.tape) {
        if (++this.wanderN >= this.wanderEvery) { this.wanderN = 0; this.wanderT = this.rng.bipolar(); }
        this.wander += (this.wanderT - this.wander) * this.wanderK;
        this.ph3 += 7.1 / sr; if (this.ph3 >= 1) this.ph3 -= 1;
        mod += this.wander * 0.0025 + Math.sin(TWO_PI * this.ph3) * 0.0002 * this.grit
          + this.rng.bipolar() * 0.00003 * this.grit; // scrape flutter
      }
      mod *= sr * this.wow;
    }
    let yL = this.L.read(this.dL + mod + 2);
    let yR = this.R.read(this.dR + mod * 0.93 + 2);
    if (this.dropProb > 0) {
      if (this.dropHold > 0) { if (--this.dropHold === 0) this.dropTarget = 1; }
      else if (this.rng.next() < this.dropProb) {
        this.dropTarget = 0.35 + this.rng.next() * 0.4;
        this.dropHold = Math.round((0.02 + this.rng.next() * 0.06) * sr);
      }
      this.drop += (this.dropTarget - this.drop) * this.dropK;
      yL *= this.drop; yR *= this.drop;
    }
    let fL = this.hp[0].process(this.lp[0].process(yL));
    let fR = this.hp[1].process(this.lp[1].process(yR));
    if (this.tape) {
      fL = this.lp2[0].process(this.tape[0].process(fL));
      fR = this.lp2[1].process(this.tape[1].process(fR));
    }
    fL = this.sat1(fL); fR = this.sat1(fR);
    if (this.mode === 'pingpong') {
      const mono = (inL + inR) * 0.5;
      this.L.write(mono + fR * this.fb);
      this.R.write(fL * this.fb);
    } else if (this.tape) {
      // The echo you hear has been through the tape too, not just the loop.
      const recL = this.rec[0].process(inL) * 0.9, recR = this.rec[1].process(inR) * 0.9;
      this.L.write(recL + fL * this.fb);
      this.R.write(recR + fR * this.fb);
    } else {
      this.L.write(inL + fL * this.fb);
      this.R.write(inR + fR * this.fb);
    }
    this.l = yL; this.r = yR;
  }
}
