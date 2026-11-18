#!/usr/bin/env node
// Render the song (or a slice) to WAV from the command line, with level stats.
//   node scripts/render.mjs --from 0 --bars 8 --out out/intro.wav [--stems] [--sr 48000]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildSong } from '../src/song/song.js';
import { Engine } from '../src/engine/engine.js';
import { encodeWav } from '../src/engine/wav.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const sr = Number(args.sr ?? 48000);
const song = buildSong();
const eng = new Engine(song, sr);
const from = Number(args.from ?? 0);
const bars = Number(args.bars ?? eng.totalBars - from);
eng.seek(from);
const n = Math.round(bars * 16 * eng.stepLen);
const L = new Float32Array(n), R = new Float32Array(n);
const stems = args.stems ? Object.fromEntries([...song.tracks.map((t) => t.id), 'delay', 'reverb'].map((id) => [id, [new Float32Array(n), new Float32Array(n)]])) : null;
const t0 = performance.now();
const BLOCK = 4096;
for (let o = 0; o < n; o += BLOCK) eng.render(L, R, Math.min(BLOCK, n - o), o, stems);
const secs = (performance.now() - t0) / 1000;
const stat = (l, r) => {
  let pk = 0, s = 0, bad = 0;
  for (let i = 0; i < l.length; i++) { const a = Math.max(Math.abs(l[i]), Math.abs(r[i])); if (!Number.isFinite(a)) bad++; else { pk = Math.max(pk, a); s += l[i] * l[i] + r[i] * r[i]; } }
  const rms = Math.sqrt(s / (2 * l.length));
  return `peak ${(20 * Math.log10(pk + 1e-12)).toFixed(1)} dB  rms ${(20 * Math.log10(rms + 1e-12)).toFixed(1)} dB${bad ? `  NON-FINITE ${bad}` : ''}`;
};
console.log(`bars ${from}-${from + bars} (${(n / sr).toFixed(1)} s audio) rendered in ${secs.toFixed(1)} s = ${((n / sr) / secs).toFixed(1)}x real time`);
console.log(`master: ${stat(L, R)}  limiter max GR ${(20 * Math.log10(1 - eng.mixer.limiter.gr + 1e-9)).toFixed(1)} dB`);
if (stems) for (const [id, [l, r]] of Object.entries(stems)) console.log(`  ${id.padEnd(8)} ${stat(l, r)}`);
if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, encodeWav([L, R], sr, 24));
  if (stems) for (const [id, ch] of Object.entries(stems)) writeFileSync(join(dirname(args.out), `stem-${id}.wav`), encodeWav(ch, sr, 24));
  console.log('wrote', args.out);
}
