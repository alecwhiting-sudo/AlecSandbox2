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

## Using it

- **Play** (or Space), click a section name to jump there, tick **Loop section** to stay on one.
- **M / S** next to each track: mute, solo (several can be soloed; Alt-click solos just that one).
- **Energy map**: tracks × sections. Drag a cell up/down to set how busy, loud and open
  that part is; double-click to switch it on/off; click to edit it below.
- **Curves** over the song: Energy, Swing, Filter, Wash, Glitch. Drag, click to add, double-click to remove.
- **Perform** pad: up = more energy, right = busier, live while playing. Tick *Record energy*
  to write it into the song.
- **Part editor**: click to add/remove hits, Shift-click for strength; chords per section.
- **Ask box**: plain English ("toms busier in the build, darker pads in the drop"). In the
  claude.ai version this uses Claude; elsewhere a simple built-in parser.
- **Export master + stems**: 24-bit WAVs (master, 9 tracks, delay and reverb returns).

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
