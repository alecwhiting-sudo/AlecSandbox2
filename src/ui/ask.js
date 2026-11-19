// Natural-language edits. "toms busier in the build" -> a list of concrete
// edit operations, previewed, then applied as one undoable change.
//
// Inside a claude.ai artifact the page asks Claude (the `sample` capability,
// on the viewer's own account, no API key). Anywhere else a small built-in
// parser handles the common phrasing.

import { CHORDS } from '../song/song.js';
import { autoRank } from '../song/song.js';
import { PRESETS, presetPatch } from '../stab/presets.js';
import { merge } from '../stab/patch.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const MIX_KEYS = { gain: [-30, 6], pan: [-1, 1], lp: [200, 19000], hp: [15, 2000], res: [0, 0.9], drive: [0, 1], delay: [0, 1], reverb: [0, 1], duck: [0, 1], duckRelease: [0.03, 0.6], filterFollow: [0, 1], cutFreq: [60, 4000], cutDb: [-15, 6], cutQ: [0.3, 8] };
const MASTER_KEYS = { glue: [0, 1], pump: [0, 0.8], pumpRelease: [0.05, 0.5], delayFeedback: [0, 0.9], delayGrit: [0, 1], reverbDecay: [0.5, 12], gainDb: [-12, 6] };
const CURVE_RANGE = { energy: [0, 1.2], swing: [0.5, 0.75], filter: [0, 1.2], wet: [0, 2], glitch: [0, 1] };

// ---------------------------------------------------------------- applying ops
function sectionStart(song, id) {
  let b = 0;
  for (const s of song.sections) { if (s.id === id) return b; b += s.bars; }
  return null;
}
function trackOf(song, id) { return song.tracks.find((t) => t.id === id); }

/**
 * Apply edit ops to the song in place. Returns human-readable lines for what
 * changed; unknown or invalid ops are skipped and reported.
 */
export function applyOps(song, ops) {
  const done = [];
  const skip = (o, why) => done.push(`Skipped ${o.op ?? '?'}: ${why}`);
  for (const o of ops ?? []) {
    try {
      switch (o.op) {
        case 'energy': {
          const secs = o.section === 'all' ? song.sections.map((s) => s.id) : [o.section];
          for (const sid of secs) {
            const cell = song.arrangement[o.track]?.[sid];
            if (!cell) { skip(o, `${o.track} is off in ${sid}`); continue; }
            const v = o.value != null ? Number(o.value) : cell.energy + Number(o.delta ?? 0);
            cell.energy = Math.round(clamp(v, 0, 1.2) * 100) / 100;
            done.push(`${trackOf(song, o.track)?.name} energy in ${sid}: ${Math.round(cell.energy * 100)}%`);
          }
          break;
        }
        case 'part': {
          if (!song.arrangement[o.track] || sectionStart(song, o.section) == null) { skip(o, 'unknown track or section'); break; }
          if (o.part == null || o.part === 'off') { song.arrangement[o.track][o.section] = null; done.push(`${o.track} off in ${o.section}`); break; }
          if (!song.parts[o.track]?.[o.part]) { skip(o, `no part ${o.part} for ${o.track}`); break; }
          const cur = song.arrangement[o.track][o.section];
          song.arrangement[o.track][o.section] = { part: o.part, energy: cur?.energy ?? Number(o.energy ?? 0.7) };
          done.push(`${o.track} plays part ${o.part} in ${o.section}`);
          break;
        }
        case 'mix': {
          const t = trackOf(song, o.track); const r = MIX_KEYS[o.key];
          if (!t || !r) { skip(o, 'unknown track or setting'); break; }
          const cur = t.mix[o.key] ?? (o.key === 'filterFollow' ? 1 : 0);
          let v = o.value != null ? Number(o.value) : o.factor != null ? cur * Number(o.factor) : cur + Number(o.delta ?? 0);
          t.mix[o.key] = Math.round(clamp(v, r[0], r[1]) * 1000) / 1000;
          done.push(`${t.name} ${o.key}: ${t.mix[o.key]}`);
          break;
        }
        case 'param': {
          const t = trackOf(song, o.track);
          if (!t || typeof t.params[o.key] !== 'number') { skip(o, 'unknown sound setting'); break; }
          t.params[o.key] = Number(o.value);
          done.push(`${t.name} sound ${o.key}: ${t.params[o.key]}`);
          break;
        }
        case 'sound': {
          const t = trackOf(song, o.track);
          if (!t || t.instrument !== 'poly' || !PRESETS.some((p) => p.id === o.preset)) { skip(o, 'unknown track or sound'); break; }
          t.params.patch = presetPatch(o.preset); t.params.preset = o.preset;
          done.push(`${t.name} sound: ${PRESETS.find((p) => p.id === o.preset).name}`);
          break;
        }
        case 'master': {
          const r = MASTER_KEYS[o.key];
          if (!r) { skip(o, 'unknown master setting'); break; }
          song.master[o.key] = Math.round(clamp(Number(o.value), r[0], r[1]) * 1000) / 1000;
          done.push(`Master ${o.key}: ${song.master[o.key]}`);
          break;
        }
        case 'curve': {
          const isTrack = /^lp:/.test(o.curve ?? '') && song.tracks.some((t) => `lp:${t.id}` === o.curve);
          const r = isTrack ? [0.02, 1.6] : CURVE_RANGE[o.curve];
          if (!r) { skip(o, 'unknown curve'); break; }
          if (isTrack && !song.curves[o.curve]) song.curves[o.curve] = [];
          if (o.points) { // replace a whole curve: [[bar, value], ...]
            song.curves[o.curve] = o.points.map(([b, v]) => [Math.round(Number(b)), Math.round(clamp(Number(v), r[0], r[1]) * 100) / 100]).sort((a, b) => a[0] - b[0]);
            done.push(`${o.curve} curve: ${song.curves[o.curve].length} points`);
            break;
          }
          const from = Math.round(Number(o.from ?? 0)), to = Math.round(Number(o.to ?? from));
          const v = Math.round(clamp(Number(o.value), r[0], r[1]) * 100) / 100;
          const pts = song.curves[o.curve].filter(([b]) => b < from || b > to);
          pts.push([from, v]); if (to !== from) pts.push([to, v]);
          pts.sort((a, b) => a[0] - b[0]);
          song.curves[o.curve] = pts;
          done.push(`${o.curve} ${v} from bar ${from + 1} to ${to + 1}`);
          break;
        }
        case 'chords': {
          if (sectionStart(song, o.section) == null) { skip(o, 'unknown section'); break; }
          const set = song.chordSet ?? CHORDS;
          const list = (o.chords ?? []).filter((c) => set[c.name]).map((c) => ({ bars: clamp(Math.round(Number(c.bars) || 4), 1, 16), name: c.name, notes: [...set[c.name]] }));
          if (!list.length) { skip(o, 'no valid chords'); break; }
          song.chords[o.section] = list;
          done.push(`Chords in ${o.section}: ${list.map((c) => `${c.name} (${c.bars})`).join(', ')}`);
          break;
        }
        case 'notes': {
          const part = song.parts[o.track]?.[o.part];
          if (!part || part.follow) { skip(o, 'no editable part'); break; }
          if (o.clear) part.events = [];
          for (const r of o.remove ?? []) part.events = part.events.filter((e) => !(e.s === r.s && (r.n === undefined || e.n === r.n)));
          for (const a of o.add ?? []) {
            const s = Math.round(Number(a.s));
            if (!(s >= 0 && s < part.len)) continue;
            const v = clamp(Number(a.v ?? 0.75), 0.1, 1);
            part.events.push({ s, n: a.n, v, l: clamp(Math.round(Number(a.l ?? 1)), 1, part.len), p: clamp(Number(a.p ?? 1), 0, 1), r: a.r != null ? clamp(Number(a.r), 0, 1) : autoRank(s, v) });
          }
          part.events.sort((a, b) => a.s - b.s);
          done.push(`${o.track} part ${o.part}: ${part.events.length} hits`);
          break;
        }
        case 'patch': {
          // {op:'patch', track, preset?, over:{...}}: a Stab Lab sound with overrides.
          const t = trackOf(song, o.track);
          if (!t || t.instrument !== 'poly') { skip(o, 'not a synth track'); break; }
          const base = o.preset ? presetPatch(o.preset) : t.params.patch;
          t.params.patch = merge(base, o.over ?? {});
          if (o.preset) t.params.preset = o.preset;
          done.push(`${t.name}: new sound${o.preset ? ` (${o.preset})` : ''}`);
          break;
        }
        case 'fill': {
          // {op:'fill', track, part, fill: FILL_PART_ID|null, every: bars}
          const part = song.parts[o.track]?.[o.part];
          if (!part) { skip(o, 'unknown part'); break; }
          part.fill = o.fill ?? null; part.fillEvery = o.fill ? clamp(Math.round(Number(o.every ?? 8)), 2, 32) : 0;
          done.push(o.fill ? `${o.track} part ${o.part}: fill ${o.fill} every ${part.fillEvery} bars` : `${o.track} part ${o.part}: no fills`);
          break;
        }
        case 'newpart': {
          // {op:'newpart', track, part, len, tile?: PART_ID, removeRange?: [from, to], add?: [...]}
          if (!song.parts[o.track]) { skip(o, 'unknown track'); break; }
          const len = clamp(Math.round(Number(o.len ?? 16)), 1, 1024);
          let events = [];
          const src = o.tile ? song.parts[o.track][o.tile] : null;
          if (src && !src.follow) for (let off = 0; off < len; off += src.len) for (const e of src.events) if (off + e.s < len) events.push({ ...e, s: off + e.s });
          if (o.removeRange) events = events.filter((e) => e.s < o.removeRange[0] || e.s >= o.removeRange[1]);
          song.parts[o.track][o.part] = { len, follow: null, events };
          done.push(`${o.track}: new part ${o.part} (${len / 16} bars)`);
          if (o.add) applyOps(song, [{ op: 'notes', track: o.track, part: o.part, add: o.add }]);
          break;
        }
        default: skip(o, 'unknown operation');
      }
    } catch (err) { skip(o, err.message); }
  }
  return done;
}

// ---------------------------------------------------------------- prompt
function songSummary(song) {
  let start = 0;
  return {
    bpm: song.bpm, key: `${song.key} ${song.scale}`,
    sections: song.sections.map((s) => { const r = { id: s.id, startBar: start, bars: s.bars }; start += s.bars; return r; }),
    tracks: song.tracks.map((t) => ({ id: t.id, name: t.name, instrument: t.instrument, mix: t.mix, params: Object.fromEntries(Object.entries(t.params).filter(([, v]) => typeof v !== 'object')) })),
    arrangement: song.arrangement,
    parts: Object.fromEntries(Object.entries(song.parts).map(([tid, ps]) => [tid, Object.fromEntries(Object.entries(ps).map(([pid, p]) => [pid, p.follow ? { follow: p.follow } : { len: p.len, events: p.events.map((e) => [e.s, e.n, Math.round(e.v * 100) / 100, e.l ?? 1]) }]))])),
    chords: Object.fromEntries(Object.entries(song.chords).map(([k, v]) => [k, v.map((c) => [c.name, c.bars])])),
    curves: song.curves, master: song.master,
  };
}

const rules = (song) => `You edit one techno track: ${song.brief ?? 'old-school minimal Detroit, 130 BPM, F minor, Swedish pump'}.
Turn the producer's request into edit operations on the song below. Reply with ONLY JSON:
{"summary": "one short sentence of what you changed", "ops": [ ... ]}

Operations (use only these; track/section/part ids exactly as in the song):
- {"op":"energy","track":ID,"section":ID|"all","value":0..1.2} or "delta" instead of "value". Cell energy sets how busy (density), loud and open a part is. Busier/sparser = energy.
- {"op":"part","track":ID,"section":ID,"part":PART_ID|null}  switch a part, or null = silent there.
- {"op":"mix","track":ID,"key":K,"value":N} (or "delta", or "factor" to multiply). K: gain(dB -30..6), pan(-1..1), lp(Hz, darker=lower), hp(Hz), res(0..0.9 low-pass resonance), cutFreq(Hz)+cutDb(-15..6) a bell EQ e.g. remove low-mid mud, drive(0..1), delay(0..1 send), reverb(0..1 send), duck(0..1 sidechain depth), duckRelease(s), filterFollow(0..1).
- {"op":"param","track":ID,"key":K,"value":N}  numeric sound params shown in tracks[].params.
- {"op":"sound","track":"stabs"|"pads"|"lead","preset":PRESET_ID}
- {"op":"master","key":K,"value":N}  K: glue, pump, pumpRelease, delayFeedback, delayGrit, reverbDecay, gainDb.
- {"op":"curve","curve":"energy"|"swing"|"filter"|"wet"|"glitch","from":BAR,"to":BAR,"value":N}  bars are 0-based song bars (see sections' startBar). swing 0.5 straight..0.75 heavy; wet scales delay+reverb (1 normal).
- {"op":"curve","curve":"lp:TRACK_ID","from":BAR,"to":BAR,"value":0.02..1.6} or "points":[[BAR,V],...]  a per-track filter sweep (multiplies that track's low-pass; 1 = as set). Use with mix "res" (resonance 0..0.9) for dramatic sweeps.
- {"op":"chords","section":ID,"chords":[{"name":CHORD,"bars":N},...]}
- {"op":"fill","track":ID,"part":PART_ID,"fill":FILL_PART_ID|null,"every":BARS}  the last bar of every N-bar phrase plays the fill part.
- {"op":"newpart","track":ID,"part":NEW_ID,"len":STEPS,"tile":EXISTING_PART_ID?,"add":[events]}  create a part (optionally starting as copies of another), then use "part" to place it.
- {"op":"patch","track":"stabs"|"pads"|"lead","preset":PRESET_ID?,"over":{...Stab Lab patch overrides, e.g. {"filterA":{"cutoff":600,"res":0.6,"env":3}}}}
- {"op":"notes","track":ID,"part":PART_ID,"add":[{"s":STEP,"n":NOTE,"v":0..1,"l":LEN}],"remove":[{"s":STEP,"n":NOTE}],"clear":false}
  Steps are 16ths from the part start (0..len-1). Notes per track: kick n=null; toms ${song.noteHints?.toms ?? '36 C2,39 Eb2,41 F2,44 Ab2'}; sub "R" (chord root); hats 0 closed,1 open,2 pedal; perc 0 clap,1 rim,2 shaker,3 conga,4 snap,5 glitch,6 snare; stabs "C" (current chord); lead ${song.noteHints?.lead ?? 'MIDI 55..84 in F minor (F G Ab Bb C Db Eb, Gb as a b9 rub)'}; fx 0 riser,1 downlifter,2 wash,3 stutter.
Prefer small, musical edits. Keep it minor and a little discordant. Don't invent ids.`;

function buildPrompt(song, request) {
  return `${rules(song)}

Chord names: ${Object.keys(song.chordSet ?? CHORDS).join(', ')}
Sound presets: ${PRESETS.map((p) => `${p.id} (${p.name})`).join(', ')}

Song:
${JSON.stringify(songSummary(song))}

Request: ${request}`;
}

// ---------------------------------------------------------------- simple fallback parser
const TRACK_WORDS = { kick: ['kick', 'kicks'], toms: ['tom', 'toms'], sub: ['sub', 'subs', 'sub stab', 'sub stabs', 'bass', 'rumble'], hats: ['hat', 'hats', 'hihat', 'hihats', 'hi-hat', 'hi-hats'], perc: ['perc', 'percussion', 'claps', 'clap', 'rims', 'shaker', 'snap', 'snaps'], stabs: ['stab', 'stabs', 'chord stabs'], pads: ['pad', 'pads'], lead: ['lead', 'melody', 'melodies', 'sequence'], fx: ['fx', 'noise', 'risers', 'riser', 'glitches'] };
const SECTION_WORDS = { intro: ['intro'], build: ['build', 'build up', 'buildup'], groove: ['groove'], breakdown: ['breakdown', 'break'], drop: ['drop'], peak: ['peak'], outro: ['outro', 'ending', 'end'] };
const find = (text, words) => Object.entries(words).filter(([, ws]) => ws.some((w) => new RegExp(`\\b${w}\\b`).test(text))).map(([id]) => id);

/** Tiny rule-based parser for common requests. Returns ops (maybe empty). */
export function parseSimple(text, song) {
  // Each comma/semicolon-separated clause is read on its own, so
  // "hats busier in the build, 60% swing in the groove" keeps them apart.
  const clauses = text.toLowerCase().split(/[,;]|\bthen\b/).map((c) => c.trim()).filter(Boolean);
  if (clauses.length > 1) return clauses.flatMap((c) => parseClause(c, song));
  return parseClause(text.toLowerCase(), song);
}

function parseClause(t, song) {
  const tracks = find(t, TRACK_WORDS);
  // This song's own sections (by id and name), plus the usual synonyms.
  const words = {};
  for (const sec of song.sections) words[sec.id] = [...new Set([sec.id, sec.name.toLowerCase(), ...(SECTION_WORDS[sec.id] ?? [])])];
  let sections = find(t, words);
  if (!sections.length || /\b(everywhere|whole song|all sections)\b/.test(t)) sections = ['all'];
  const ops = [];
  const pct = t.match(/(\d{2})\s*%\s*swing|swing\s*(?:to|of|at)?\s*(\d{2})\s*%/);
  if (pct) {
    const v = Number(pct[1] ?? pct[2]) / 100;
    const ranges = sections[0] === 'all' ? [[0, song.sections.reduce((a, s) => a + s.bars, 0)]] : sections.map((sid) => { const st = sectionStart(song, sid); return [st, st + song.sections.find((s) => s.id === sid).bars]; });
    for (const [from, to] of ranges) ops.push({ op: 'curve', curve: 'swing', from, to, value: v });
  }
  for (const tr of tracks) {
    const secs = sections;
    if (/\b(busier|more|denser|fuller)\b/.test(t)) secs.forEach((s) => ops.push({ op: 'energy', track: tr, section: s, delta: 0.2 }));
    if (/\b(sparser|less|thinner|emptier)\b/.test(t)) secs.forEach((s) => ops.push({ op: 'energy', track: tr, section: s, delta: -0.2 }));
    if (/\b(louder|up)\b/.test(t)) ops.push({ op: 'mix', track: tr, key: 'gain', delta: 3 });
    if (/\b(quieter|down|softer)\b/.test(t)) ops.push({ op: 'mix', track: tr, key: 'gain', delta: -3 });
    if (/\b(darker|duller|warmer)\b/.test(t)) ops.push({ op: 'mix', track: tr, key: 'lp', factor: 0.6 });
    if (/\b(brighter|sharper|crisper)\b/.test(t)) ops.push({ op: 'mix', track: tr, key: 'lp', factor: 1.6 });
    if (/\b(wetter|washier|dubbier)\b/.test(t)) { ops.push({ op: 'mix', track: tr, key: 'reverb', delta: 0.15 }); ops.push({ op: 'mix', track: tr, key: 'delay', delta: 0.15 }); }
    if (/\b(drier|dryer)\b/.test(t)) { ops.push({ op: 'mix', track: tr, key: 'reverb', delta: -0.15 }); ops.push({ op: 'mix', track: tr, key: 'delay', delta: -0.15 }); }
    if (/\b(pump|pumpier|duck)\b/.test(t)) ops.push({ op: 'mix', track: tr, key: 'duck', delta: 0.15 });
    if (/\b(mute|off|remove|drop out)\b/.test(t) && secs[0] !== 'all') secs.forEach((s) => ops.push({ op: 'part', track: tr, section: s, part: null }));
  }
  return ops;
}

// ---------------------------------------------------------------- UI
const SIMPLE_HELP = 'Simple mode understands a track (kick, toms, sub, hats, perc, stabs, pads, lead, fx) and a section (by its name on the song map, e.g. intro, drop) with: busier / sparser, louder / quieter, darker / brighter, wetter / drier, pumpier, mute — and “60% swing in the groove”. Separate several requests with commas.';

export function setupAsk({ getSong, commit, toast, undo }) {
  const form = document.querySelector('#ask-form');
  const input = document.querySelector('#ask-input');
  const out = document.querySelector('#ask-result');
  const go = document.querySelector('#ask-go');
  const mode = document.querySelector('#ask-mode');
  const inArtifact = !!(window.claude && typeof window.claude.use === 'function');
  // Resolves to the Claude function, or null (not in claude.ai, or unavailable).
  // A request made before it settles waits for it instead of falling back.
  let samplerReady = inArtifact ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
  let ctl = null;

  const setMode = (s) => {
    mode.textContent = s
      ? 'Claude reads your request and changes the song. Undo reverses it.'
      : `${inArtifact ? 'Claude isn’t available here, so this is' : 'This is'} simple mode. ${SIMPLE_HELP} For anything else, use the claude.ai version.`;
  };
  mode.textContent = inArtifact ? 'Connecting to Claude…' : '';
  samplerReady.then(setMode);

  const show = (...nodes) => { out.replaceChildren(...nodes); out.hidden = false; };
  const p = (text, cls) => { const e = document.createElement('p'); e.style.margin = '0'; if (cls) e.className = cls; e.textContent = text; return e; };
  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = `btn small ${cls}`; b.textContent = label; b.onclick = fn; return b; };

  // Apply straight away (one undo step) and show what changed.
  function applyNow(summary, ops, request) {
    const copy = JSON.parse(JSON.stringify(getSong()));
    const lines = applyOps(copy, ops);
    const real = lines.filter((l) => !l.startsWith('Skipped'));
    if (!real.length) {
      show(p(`I couldn’t turn “${request}” into a change.`), p(SIMPLE_HELP, 'sub'));
      return;
    }
    commit((s) => applyOps(s, ops));
    const ul = document.createElement('ul');
    for (const l of lines) { const li = document.createElement('li'); li.textContent = l; ul.append(li); }
    const row = document.createElement('div'); row.className = 'row gap';
    row.append(btn('Undo', '', () => { undo(); out.hidden = true; toast('Undone'); }), btn('OK', '', () => { out.hidden = true; }));
    show(p(`Done: ${summary || 'changed the song'}`), ul, row);
    input.value = '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    go.disabled = true;
    try {
      const sampler = await samplerReady;
      if (!sampler) { applyNow('', parseSimple(text, getSong()), text); return; }
      ctl?.abort(); ctl = new AbortController();
      show(p('Thinking… (this can take up to a minute)', 'sub'), btn('Stop', '', () => ctl.abort()));
      try {
        const res = await sampler.json(buildPrompt(getSong(), text), { signal: ctl.signal, cache: false });
        if (!res || !Array.isArray(res.ops)) throw { code: 'invalid_json' };
        applyNow(res.summary, res.ops, text);
      } catch (err) {
        const code = err?.code;
        if (code === 'cancelled') out.hidden = true;
        else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
          samplerReady = Promise.resolve(null); setMode(null);
          applyNow('', parseSimple(text, getSong()), text);
        } else if (code === 'rate_limited') show(p('Too many requests just now. Try again in a minute.', 'sub'));
        else if (code === 'invalid_json') show(p('The answer came back garbled. Try again, or phrase it more simply.', 'sub'));
        else show(p('Something went wrong reaching Claude. Try again.', 'sub'));
      }
    } finally { go.disabled = false; }
  });
}
