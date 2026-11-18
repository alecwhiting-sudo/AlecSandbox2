# One Song

A throwaway app built to make exactly one track: about 6½ minutes of
old-school, minimal Detroit techno in F minor at 130 BPM, with a Swedish pump
(think Joel Mull, Heiko Laux). Everything is synthesised in code: no samples,
no generated audio. When the track is done (WAV master and stems), the app
can be thrown away.

```bash
npm install
npm test
node scripts/render.mjs --from 112 --bars 16 --stems --out out/drop.wav   # render a slice
```

## Layout

```
src/song/song.js      THE song: sections, tracks, patterns, chords, curves
src/engine/engine.js  sequencer: plays the song JSON sample by sample
src/engine/drums.js   kick, toms (the bass), sub stabs, hats, percussion
src/engine/tonal.js   stabs, pads, lead (Stab Lab voices) and FX/noise
src/engine/mixer.js   channel strips, sidechain duck, tape delay, reverb, glue, limiter
src/stab/             Stab Lab's voice, patches and chord theory (reused)
src/dsp/              Stab Lab's DSP building blocks (reused)
```
