// Export worker: renders the whole song offline (faster than real time) to a
// 24-bit WAV master plus one stem per track and the delay/reverb returns.

import { Engine } from './engine.js';
import { encodeWav } from './wav.js';

self.onmessage = (e) => {
  const { song, sr = 48000 } = e.data;
  const eng = new Engine(song, sr);
  eng.seek(0);
  // A short tail after the last bar lets the reverb and delay ring out.
  const tail = Math.round(sr * 6);
  const n = eng.totalSamples + tail;
  const L = new Float32Array(n), R = new Float32Array(n);
  const ids = [...song.tracks.map((t) => t.id), 'delay', 'reverb'];
  const stems = Object.fromEntries(ids.map((id) => [id, [new Float32Array(n), new Float32Array(n)]]));
  const BLOCK = 8192;
  // Keep rendering past the song end so tails are captured.
  eng.totalSamples = n;
  for (let o = 0; o < n; o += BLOCK) {
    eng.render(L, R, Math.min(BLOCK, n - o), o, stems);
    if ((o / BLOCK) % 40 === 0) self.postMessage({ type: 'progress', done: o / n });
  }
  // The master limiter looks 1.5 ms ahead; shift the master so it lines up with the stems.
  const look = eng.mixer.limiter.look;
  const shift = (a) => { const b = new Float32Array(n); b.set(a.subarray(look)); return b; };
  const files = [{ name: 'master.wav', data: encodeWav([shift(L), shift(R)], sr, 24) }];
  for (const id of ids) files.push({ name: `stems/${id}.wav`, data: encodeWav(stems[id], sr, 24) });
  self.postMessage({ type: 'done', files }, files.map((f) => f.data.buffer));
};
