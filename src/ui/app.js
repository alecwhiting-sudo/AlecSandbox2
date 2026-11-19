// One Song: the interface. Holds the song JSON, sends it to the live engine
// (AudioWorklet) on every edit, and draws the energy map, curves, XY pad,
// part editor and track settings.

import { buildSong, TOKENS, CHORDS, autoRank } from '../song/song.js';
import { Engine, curveAt, sectionAt, songBars } from '../engine/engine.js';
import { PRESETS, presetPatch } from '../stab/presets.js';
import { noteName } from '../stab/theory.js';
import { encodeWav } from '../engine/wav.js';
import { setupAsk } from './ask.js';

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid);
  return e;
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------------------------------------------------------------- state
const STORE = 'onesong.song.v1';
let song = loadSaved() ?? buildSong();
const ui = { track: 'toms', section: 'groove', master: false, curve: 'energy', bar: 0, playing: false };
const perf = { energy: 0, density: 0, swing: 0, filter: 0, wash: 0, mute: {} };
const undoStack = [], redoStack = [];
const lastPart = {}; // remembers a cell's part when switched off

function loadSaved() {
  try { const s = JSON.parse(localStorage.getItem(STORE)); return s && s.sections ? s : null; } catch { return null; }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(song)); } catch { /* full or blocked */ } }, 400);
}

/** Make an edit: snapshot for undo, apply, push to the engine, redraw. */
function commit(fn, { redraw = 'all', quiet = false } = {}) {
  undoStack.push(JSON.stringify(song));
  if (undoStack.length > 150) undoStack.shift();
  redoStack.length = 0;
  fn(song);
  changed(redraw);
  if (!quiet) updateUndo();
}
function changed(redraw = 'all') {
  sendSong(); save();
  if (redraw === 'all') renderAll();
  else if (redraw === 'map') renderMap();
  else if (redraw === 'curve') drawCurve();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(song)); song = JSON.parse(undoStack.pop()); changed(); updateUndo();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(song)); song = JSON.parse(redoStack.pop()); changed(); updateUndo();
}
function updateUndo() { $('#btn-undo').disabled = !undoStack.length; $('#btn-redo').disabled = !redoStack.length; }
export function getSong() { return song; }
export { commit, toast };

// ---------------------------------------------------------------- audio
let ctx = null, node = null;
// iPhone/iPad: ask for the media playback channel so the ring/silent switch
// doesn't mute the song (Safari 16.4+); older iOS gets a silent looping
// <audio> element, which moves the page into that channel.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
let keepAlive = null;
function unlockIOS() {
  if (!isIOS || keepAlive || navigator.audioSession) return;
  const wav = encodeWav([new Float32Array(4410)], 44100, 16);
  keepAlive = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
  keepAlive.loop = true; keepAlive.setAttribute('playsinline', '');
  keepAlive.play().catch(() => { keepAlive = null; });
}

// Fallback player for browsers where the AudioWorklet can't load: runs the
// same Engine on the main thread through a ScriptProcessor, with the same
// message interface as the worklet.
function mainThreadPlayer(context) {
  const proc = context.createScriptProcessor(4096, 0, 2);
  let engine = null, playing = false, loop = null, tick = 0;
  const port = {
    onmessage: null,
    postMessage(m) {
      if (m.type === 'song') { if (!engine) { engine = new Engine(m.song, context.sampleRate); engine.seek(0); } else engine.update(m.song); }
      else if (m.type === 'perf' && engine) Object.assign(engine.perf, m.perf);
      else if (m.type === 'play') playing = true;
      else if (m.type === 'stop') playing = false;
      else if (m.type === 'seek' && engine) engine.seek(m.bar);
      else if (m.type === 'loop') loop = m.loop;
    },
  };
  proc.onaudioprocess = (e) => {
    const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
    if (!engine || !playing) { L.fill(0); R.fill(0); return; }
    if (loop && engine.bar >= loop.to) engine.seek(loop.from);
    engine.render(L, R, L.length);
    if (engine.pos >= engine.totalSamples) { playing = false; port.onmessage?.({ data: { type: 'ended' } }); }
    if (++tick % 2 === 0) { port.onmessage?.({ data: { type: 'pos', bar: engine.bar, gr: engine.mixer.limiter.gr } }); engine.mixer.limiter.gr = 0; }
  };
  return { port, connect: (d) => proc.connect(d) };
}

async function ensureAudio() {
  if (node) { if (ctx.state !== 'running') await ctx.resume().catch(() => {}); return; }
  // Created synchronously inside the tap, which iOS requires. Phones run the
  // live preview at 32 kHz to save CPU (exports are always 48 kHz).
  const AC = window.AudioContext || window.webkitAudioContext;
  try { ctx = new AC(isIOS ? { latencyHint: 'playback', sampleRate: 32000 } : { latencyHint: 'playback' }); }
  catch { ctx = new AC(); }
  unlockIOS();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  try {
    // eslint-disable-next-line no-undef
    const url = URL.createObjectURL(new Blob([__WORKLET_SRC__], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(url);
    node = new AudioWorkletNode(ctx, 'song-processor', { outputChannelCount: [2] });
  } catch (err) {
    console.warn('AudioWorklet unavailable, using the fallback player', err);
    node = mainThreadPlayer(ctx);
  }
  node.connect(ctx.destination);
  node.port.onmessage = (e) => onEngine(e.data);
  sendSong(); sendPerf();
  node.port.postMessage({ type: 'seek', bar: ui.bar });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); });
function sendSong() { node?.port.postMessage({ type: 'song', song }); }
let perfPending = false;
function sendPerf() {
  if (perfPending) return;
  perfPending = true;
  requestAnimationFrame(() => { perfPending = false; node?.port.postMessage({ type: 'perf', perf }); });
}
async function togglePlay() {
  try { await ensureAudio(); }
  catch (err) { toast(`Couldn't start audio: ${err?.message ?? err}`); return; }
  ui.playing = !ui.playing;
  node.port.postMessage({ type: ui.playing ? 'play' : 'stop' });
  $('#btn-play').textContent = ui.playing ? '■ Stop' : '▶ Play';
  if (ui.playing) updateLoop();
}
function seek(bar) {
  ui.bar = clamp(bar, 0, songBars(song) - 0.01);
  node?.port.postMessage({ type: 'seek', bar: ui.bar });
  updatePosition();
}
function updateLoop() {
  if (!node) return;
  if (!$('#loop').checked) { node.port.postMessage({ type: 'loop', loop: null }); return; }
  const w = sectionAt(song, Math.floor(ui.bar));
  node.port.postMessage({ type: 'loop', loop: { from: w.startBar, to: w.startBar + w.section.bars } });
}
let lastRecordedBar = -1;
function onEngine(m) {
  if (m.type === 'pos') {
    ui.bar = m.bar;
    updatePosition();
    $('#gr span').style.width = `${clamp(m.gr * 300, 0, 100)}%`;
    // Record the performance energy into the song's energy curve, once per bar.
    if ($('#perf-record').checked && ui.playing && Math.floor(m.bar) !== lastRecordedBar && perf.energy !== 0) {
      lastRecordedBar = Math.floor(m.bar);
      setCurvePoint('energy', lastRecordedBar, clamp(curveAt(song.curves.energy, lastRecordedBar) + perf.energy, 0, 1.2));
      changed(ui.curve === 'energy' ? 'curve' : 'none');
    }
  } else if (m.type === 'ended') {
    ui.playing = false; $('#btn-play').textContent = '▶ Play';
  }
}
function updatePosition() {
  const total = songBars(song);
  const b = Math.floor(ui.bar), beat = Math.floor((ui.bar - b) * 4);
  $('#pos-bar').textContent = `${b + 1}.${beat + 1}`;
  $('#pos-sec').textContent = sectionAt(song, b).section.name;
  const secs = (ui.bar * 4 * 60) / song.bpm;
  $('#pos-time').textContent = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  $('#playhead').style.left = `${(ui.bar / total) * 100}%`;
}

// ---------------------------------------------------------------- timeline
const CURVES = {
  energy: { label: 'Energy', min: 0, max: 1.2 },
  swing: { label: 'Swing', min: 0.5, max: 0.75 },
  filter: { label: 'Filter', min: 0, max: 1.2 },
  wet: { label: 'Wash', min: 0, max: 2 },
  glitch: { label: 'Glitch', min: 0, max: 1 },
};
function renderTabs() {
  $('#curve-tabs').replaceChildren(...Object.entries(CURVES).map(([k, c]) =>
    el('button', { class: ui.curve === k ? 'on' : '', onclick: () => { ui.curve = k; renderTabs(); drawCurve(); } }, c.label)));
}
function renderRuler() {
  const total = songBars(song);
  $('#ruler').replaceChildren(...song.sections.map((s, i) => {
    const start = song.sections.slice(0, i).reduce((a, x) => a + x.bars, 0);
    return el('div', { style: `width:${(s.bars / total) * 100}%`, title: `${s.name}: bars ${start + 1}-${start + s.bars}`, onclick: () => seek(start) }, s.name);
  }));
}
function renderLabels() {
  const rows = song.tracks.map((t) => el('div', { class: `lab${!ui.master && ui.track === t.id ? ' sel' : ''}`, onclick: () => { ui.master = false; ui.track = t.id; renderAll(); } },
    el('span', {}, t.name),
    el('button', { class: `mute${perf.mute[t.id] ? ' on' : ''}`, title: 'Mute while playing', onclick: (e) => { e.stopPropagation(); perf.mute[t.id] = !perf.mute[t.id]; sendPerf(); renderLabels(); } }, 'M')));
  rows.push(el('div', { class: `lab${ui.master ? ' sel' : ''}`, onclick: () => { ui.master = true; renderAll(); } }, el('span', {}, 'Master')));
  $('#tl-labels').replaceChildren(...rows);
}
function renderMap() {
  const total = songBars(song);
  const rows = song.tracks.map((t) => el('div', { class: 'maprow' }, ...song.sections.map((s) => {
    const cell = song.arrangement[t.id]?.[s.id];
    const sel = !ui.master && ui.track === t.id && ui.section === s.id;
    const c = el('div', {
      class: `cell${cell ? '' : ' off'}${sel ? ' sel' : ''}`, tabindex: '0', style: `width:${(s.bars / total) * 100}%`,
      title: cell ? `${t.name} · ${s.name}: part ${cell.part}, energy ${Math.round(cell.energy * 100)}%` : `${t.name} · ${s.name}: off (double-click to switch on)`,
    }, cell ? el('div', { class: 'fill', style: `height:${clamp(cell.energy / 1.2, 0, 1) * 100}%;opacity:${0.3 + 0.6 * clamp(cell.energy, 0, 1)}` }) : null,
    cell ? el('span', { class: 'tag' }, cell.part) : null);
    attachCellDrag(c, t.id, s.id);
    return c;
  })));
  // Master row: section energy from the curve, read-only.
  $('#map').replaceChildren(...rows);
}
function attachCellDrag(c, tid, sid) {
  let y0 = 0, e0 = 0, moved = false, snap = null;
  c.addEventListener('pointerdown', (e) => {
    const cell = song.arrangement[tid][sid];
    c.setPointerCapture(e.pointerId); y0 = e.clientY; moved = false;
    e0 = cell ? cell.energy : 0; snap = JSON.stringify(song);
  });
  c.addEventListener('pointermove', (e) => {
    if (!c.hasPointerCapture(e.pointerId)) return;
    const cell = song.arrangement[tid][sid];
    if (!cell) return;
    const dy = y0 - e.clientY;
    if (!moved && Math.abs(dy) < 3) return;
    if (!moved) { undoStack.push(snap); redoStack.length = 0; moved = true; }
    cell.energy = Math.round(clamp(e0 + dy / 120, 0, 1.2) * 100) / 100;
    const fill = c.querySelector('.fill');
    if (fill) { fill.style.height = `${(cell.energy / 1.2) * 100}%`; fill.style.opacity = 0.3 + 0.6 * clamp(cell.energy, 0, 1); }
    c.title = `energy ${Math.round(cell.energy * 100)}%`;
    sendSong();
  });
  c.addEventListener('pointerup', () => {
    if (moved) { save(); updateUndo(); renderMap(); }
    else { ui.master = false; ui.track = tid; ui.section = sid; renderAll(); }
  });
  c.addEventListener('dblclick', () => toggleCell(tid, sid));
  c.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { ui.master = false; ui.track = tid; ui.section = sid; renderAll(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cell = song.arrangement[tid][sid];
      if (cell) commit(() => { cell.energy = Math.round(clamp(cell.energy + (e.key === 'ArrowUp' ? 0.05 : -0.05), 0, 1.2) * 100) / 100; }, { redraw: 'map' });
    }
  });
}
function toggleCell(tid, sid) {
  commit((s) => {
    const cur = s.arrangement[tid][sid];
    if (cur) { lastPart[`${tid}:${sid}`] = cur.part; s.arrangement[tid][sid] = null; }
    else s.arrangement[tid][sid] = { part: lastPart[`${tid}:${sid}`] ?? Object.keys(s.parts[tid])[0], energy: 0.7 };
  });
}

// ---------------------------------------------------------------- curve editor
let curveDrag = null;
function curveGeom() {
  const cv = $('#curve');
  const w = cv.clientWidth || 600, h = 110;
  const def = CURVES[ui.curve];
  const total = songBars(song);
  return {
    cv, w, h, def, total,
    x: (bar) => (bar / total) * w,
    y: (v) => h - 6 - ((v - def.min) / (def.max - def.min)) * (h - 12),
    bar: (x) => clamp(Math.round((x / w) * total), 0, total),
    val: (y) => clamp(def.min + ((h - 6 - y) / (h - 12)) * (def.max - def.min), def.min, def.max),
  };
}
function drawCurve() {
  const g = curveGeom();
  const dpr = window.devicePixelRatio || 1;
  g.cv.width = g.w * dpr; g.cv.height = g.h * dpr;
  const c = g.cv.getContext('2d');
  c.scale(dpr, dpr);
  c.clearRect(0, 0, g.w, g.h);
  // section boundaries
  let start = 0;
  c.fillStyle = css('--line-light');
  for (const s of song.sections) { c.fillRect(g.x(start), 0, 1, g.h); start += s.bars; }
  const pts = song.curves[ui.curve] ?? [];
  c.strokeStyle = css('--accent'); c.lineWidth = 2; c.beginPath();
  pts.forEach(([b, v], i) => { const X = g.x(b), Y = g.y(v); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
  c.stroke();
  c.fillStyle = '#fff';
  for (const [b, v] of pts) { c.beginPath(); c.arc(g.x(b), g.y(v), 3.5, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = css('--muted'); c.font = '11px system-ui';
  c.fillText(`${g.def.label}: drag points · click to add · double-click to remove`, 6, 14);
}
function setCurvePoint(key, bar, v) {
  const pts = song.curves[key];
  const i = pts.findIndex(([b]) => b === bar);
  if (i >= 0) pts[i][1] = v; else { pts.push([bar, v]); pts.sort((a, b) => a[0] - b[0]); }
}
function nearestPoint(g, x, y) {
  const pts = song.curves[ui.curve];
  let best = -1, bd = 10;
  pts.forEach(([b, v], i) => { const d = Math.hypot(g.x(b) - x, g.y(v) - y); if (d < bd) { bd = d; best = i; } });
  return best;
}
function setupCurve() {
  const cv = $('#curve');
  cv.addEventListener('pointerdown', (e) => {
    const g = curveGeom(); const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let i = nearestPoint(g, x, y);
    undoStack.push(JSON.stringify(song)); redoStack.length = 0; updateUndo();
    if (i < 0) { setCurvePoint(ui.curve, g.bar(x), Math.round(g.val(y) * 100) / 100); i = song.curves[ui.curve].findIndex(([b]) => b === g.bar(x)); changed('curve'); }
    curveDrag = i; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (curveDrag == null || !cv.hasPointerCapture(e.pointerId)) return;
    const g = curveGeom(); const r = cv.getBoundingClientRect();
    const pts = song.curves[ui.curve];
    const lo = curveDrag > 0 ? pts[curveDrag - 1][0] : 0, hi = curveDrag < pts.length - 1 ? pts[curveDrag + 1][0] : g.total;
    pts[curveDrag] = [clamp(g.bar(e.clientX - r.left), lo, hi), Math.round(g.val(e.clientY - r.top) * 100) / 100];
    drawCurve(); sendSong();
  });
  cv.addEventListener('pointerup', () => { if (curveDrag != null) { curveDrag = null; save(); } });
  cv.addEventListener('dblclick', (e) => {
    const g = curveGeom(); const r = cv.getBoundingClientRect();
    const i = nearestPoint(g, e.clientX - r.left, e.clientY - r.top);
    if (i >= 0 && song.curves[ui.curve].length > 2) commit((s) => { s.curves[ui.curve].splice(i, 1); }, { redraw: 'curve' });
  });
}

// ---------------------------------------------------------------- perform pad
function drawXY() {
  const cv = $('#xy'); const w = cv.clientWidth || 240;
  const dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr; cv.height = w * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  c.clearRect(0, 0, w, w);
  c.strokeStyle = css('--line-light'); c.lineWidth = 1;
  c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, w); c.moveTo(0, w / 2); c.lineTo(w, w / 2); c.stroke();
  const x = (perf.density + 0.5) * w, y = (0.5 - perf.energy) * w;
  const grd = c.createRadialGradient(x, y, 2, x, y, 40);
  grd.addColorStop(0, 'rgba(255,69,0,.9)'); grd.addColorStop(1, 'rgba(255,69,0,0)');
  c.fillStyle = grd; c.beginPath(); c.arc(x, y, 40, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
  c.fillStyle = css('--muted'); c.font = '11px system-ui';
  c.fillText('more energy', 6, 14); c.fillText('less energy', 6, w - 6);
}
function setupPerf() {
  const cv = $('#xy');
  const move = (e) => {
    const r = cv.getBoundingClientRect();
    perf.density = Math.round(clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5) * 100) / 100;
    perf.energy = Math.round(clamp(0.5 - (e.clientY - r.top) / r.height, -0.5, 0.5) * 100) / 100;
    drawXY(); sendPerf();
  };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); move(e); });
  cv.addEventListener('pointermove', (e) => { if (cv.hasPointerCapture(e.pointerId)) move(e); });
  $('#perf-reset').addEventListener('click', () => { Object.assign(perf, { energy: 0, density: 0, swing: 0, filter: 0, wash: 0 }); drawXY(); renderPerfSliders(); sendPerf(); });
  renderPerfSliders();
}
function renderPerfSliders() {
  const sl = (label, key, min, max) => range(label, perf[key], min, max, 0.01, (v) => { perf[key] = v; sendPerf(); }, (v) => (v > 0 ? '+' : '') + v.toFixed(2));
  $('#perf-sliders').replaceChildren(
    sl('Swing', 'swing', -0.06, 0.12), sl('Filter', 'filter', -0.7, 0.3),
    el('div', { class: 'ctl wide' }, sl('Wash (delay + reverb)', 'wash', -0.9, 1)));
}

// ---------------------------------------------------------------- part editor
const ROWS = {
  kick: [['Kick', null]],
  toms: [['Ab2', 44], ['F2', 41], ['Eb2', 39], ['C2', 36]],
  sub: [['Root', 'R']],
  hats: [['Open', 1], ['Pedal', 2], ['Closed', 0]],
  perc: [['Clap', 0], ['Snare', 6], ['Rim', 1], ['Shaker', 2], ['Conga', 3], ['Bell', 4], ['Glitch', 5]],
  stabs: [['Chord', 'C']],
  fx: [['Riser', 0], ['Down', 1], ['Wash', 2], ['Stutter', 3]],
};
const SCALE = [0, 2, 3, 5, 7, 8, 10].map((x) => (x + 5) % 12); // F minor
function rowsFor(tid) {
  if (tid === 'lead') { const r = []; for (let n = 84; n >= 55; n--) r.push([noteName(n), n]); return r; }
  return ROWS[tid] ?? [];
}
function defaultVel(tid, n) {
  const tok = Object.values(TOKENS[tid] ?? {}).find((t) => t[0] === n);
  return tok ? tok[1] : 0.75;
}
function renderEditor() {
  const tools = $('#ed-tools'), body = $('#ed-body');
  if (ui.master) { $('#ed-title').textContent = 'Master'; tools.replaceChildren(); body.replaceChildren(el('p', { class: 'hint' }, 'Master settings are on the right. Select a cell in the song to edit its part.')); return; }
  const track = song.tracks.find((t) => t.id === ui.track);
  const sec = song.sections.find((s) => s.id === ui.section);
  const cell = song.arrangement[track.id][sec.id];
  $('#ed-title').textContent = `${track.name} · ${sec.name}`;
  const parts = Object.keys(song.parts[track.id]);
  const partSel = el('select', { 'aria-label': 'Part', onchange: (e) => {
    const v = e.target.value;
    commit((s) => {
      if (v === '__off') { s.arrangement[track.id][sec.id] = null; return; }
      if (v === '__copy') {
        const from = cell?.part ?? parts[0];
        let id = 'A'; while (s.parts[track.id][id]) id = String.fromCharCode(id.charCodeAt(0) + 1);
        s.parts[track.id][id] = JSON.parse(JSON.stringify(s.parts[track.id][from]));
        s.arrangement[track.id][sec.id] = { part: id, energy: cell?.energy ?? 0.7 };
        return;
      }
      s.arrangement[track.id][sec.id] = { part: v, energy: cell?.energy ?? 0.7 };
    });
  } }, el('option', { value: '__off' }, 'Off'), ...parts.map((p) => el('option', { value: p }, `Part ${p}`)), el('option', { value: '__copy' }, 'New part (copy of this one)'));
  partSel.value = cell ? cell.part : '__off';
  const usedIn = cell ? song.sections.filter((s) => song.arrangement[track.id][s.id]?.part === cell.part).map((s) => s.name) : [];
  tools.replaceChildren(partSel, cell && usedIn.length > 1 ? el('span', { class: 'sub' }, `Part ${cell.part} also plays in ${usedIn.filter((n) => n !== sec.name).join(', ')}`) : null);
  if (!cell) { body.replaceChildren(el('p', { class: 'hint' }, `${track.name} is off in the ${sec.name}. Pick a part above to switch it on.`)); return; }
  const part = song.parts[track.id][cell.part];
  const blocks = [];
  if (part.follow === 'chords') blocks.push(el('p', { class: 'hint' }, 'Pads play each chord of this section for its full length. Edit the chords below.'));
  else blocks.push(roll(track, part));
  if (['stabs', 'pads', 'sub', 'lead'].includes(track.id)) blocks.push(chordEditor(sec));
  body.replaceChildren(...blocks);
}
function roll(track, part) {
  const rows = rowsFor(track.id);
  const cw = part.len > 32 ? 14 : 22, rh = track.id === 'lead' ? 12 : 20, lw = 52;
  const w = lw + part.len * cw, h = rows.length * rh;
  const cv = el('canvas', { class: 'roll', width: w * (window.devicePixelRatio || 1), height: h * (window.devicePixelRatio || 1), style: `width:${w}px;height:${h}px` });
  const draw = () => {
    const c = cv.getContext('2d'); const dpr = window.devicePixelRatio || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    rows.forEach(([label, n], i) => {
      const inKey = track.id !== 'lead' || SCALE.includes(n % 12);
      c.fillStyle = inKey ? css('--inset') : '#151515'; c.fillRect(lw, i * rh, w - lw, rh);
      c.fillStyle = css('--label'); c.font = '11px system-ui'; c.fillText(label, 4, i * rh + rh * 0.7);
    });
    for (let s = 0; s <= part.len; s++) { c.fillStyle = s % 16 === 0 ? '#666' : s % 4 === 0 ? '#3a3a3a' : '#262626'; c.fillRect(lw + s * cw, 0, 1, h); }
    for (const ev of part.events) {
      const ri = rows.findIndex(([, n]) => n === ev.n);
      if (ri < 0) continue;
      c.globalAlpha = 0.35 + 0.65 * ev.v;
      c.fillStyle = css('--accent');
      c.fillRect(lw + ev.s * cw + 1, ri * rh + 2, Math.max(cw - 2, (ev.l ?? 1) * cw - 2), rh - 4);
      c.globalAlpha = 1;
    }
  };
  draw();
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const s = Math.floor((e.clientX - r.left - lw) / cw), ri = Math.floor((e.clientY - r.top) / rh);
    if (s < 0 || s >= part.len || !rows[ri]) return;
    const n = rows[ri][1];
    commit(() => {
      const hit = part.events.find((ev) => ev.n === n && s >= ev.s && s < ev.s + Math.max(1, ev.l ?? 1));
      if (hit && e.shiftKey) { hit.v = hit.v >= 0.95 ? 0.4 : hit.v >= 0.65 ? 1 : 0.7; return; }
      if (hit) { part.events.splice(part.events.indexOf(hit), 1); return; }
      const l = track.id === 'lead' ? 2 : track.id === 'stabs' ? 2 : track.id === 'fx' ? 32 : 1;
      const v = defaultVel(track.id, n);
      part.events.push({ s, n, v, l, p: 1, r: autoRank(s, v) });
      part.events.sort((a, b) => a.s - b.s);
    }, { redraw: 'editor' });
    draw();
  });
  return el('div', {}, el('div', { class: 'roll-wrap' }, cv),
    el('p', { class: 'hint' }, 'Click to add or remove a hit · Shift-click to change its strength · fainter hits drop out first when density is low.'));
}
function chordEditor(sec) {
  const prog = song.chords[sec.id] ?? (song.chords[sec.id] = []);
  const names = Object.keys(CHORDS);
  const items = prog.map((c, i) => el('div', { class: 'chord' },
    (() => { const s = el('select', { 'aria-label': 'Chord', onchange: (e) => commit(() => { c.name = e.target.value; c.notes = [...CHORDS[c.name]]; }) }, ...names.map((n) => el('option', { value: n }, n))); s.value = c.name; return s; })(),
    el('input', { type: 'number', min: 1, max: 16, value: c.bars, 'aria-label': 'Bars', title: 'bars', onchange: (e) => commit(() => { c.bars = clamp(Math.round(Number(e.target.value) || 1), 1, 16); }) }),
    el('span', { class: 'sub' }, 'bars'),
    el('button', { class: 'btn small', title: 'Remove chord', onclick: () => { if (prog.length > 1) commit(() => prog.splice(i, 1)); } }, '×')));
  return el('div', {},
    el('h2', { style: 'margin-top:12px' }, `Chords in the ${sec.name}`),
    el('div', { class: 'chords' }, ...items, el('button', { class: 'btn small', onclick: () => commit(() => prog.push({ bars: 4, name: 'Fm9', notes: [...CHORDS.Fm9] })) }, '+ Chord')),
    el('p', { class: 'hint' }, 'Chords cycle through the section. Stabs, pads, sub stabs and the lead all follow them.'));
}

// ---------------------------------------------------------------- track / master settings
function range(label, value, min, max, step, onInput, fmt = (v) => String(Math.round(v * 100) / 100), log = false) {
  const toS = (v) => (log ? Math.log(v / min) / Math.log(max / min) * 1000 : v);
  const fromS = (x) => (log ? min * Math.pow(max / min, x / 1000) : Number(x));
  const val = el('span', { class: 'val' }, fmt(value));
  const input = el('input', { type: 'range', min: log ? 0 : min, max: log ? 1000 : max, step: log ? 1 : step, value: toS(value), 'aria-label': label });
  input.addEventListener('input', () => { const v = fromS(input.value); val.textContent = fmt(v); onInput(v, false); });
  input.addEventListener('change', () => onInput(fromS(input.value), true));
  return el('div', { class: 'ctl' }, el('label', {}, el('span', {}, label), val), input);
}
// Live slider edits: one undo step per gesture.
let sliderSnap = null;
function liveEdit(apply, done) {
  if (!sliderSnap) sliderSnap = JSON.stringify(song);
  apply(song); sendSong();
  if (done) { undoStack.push(sliderSnap); redoStack.length = 0; sliderSnap = null; save(); updateUndo(); }
}
const MIX = [
  ['gain', 'Level', -30, 6, 0.5, (v) => `${v.toFixed(1)} dB`],
  ['pan', 'Pan', -1, 1, 0.01],
  ['lp', 'Low-pass', 200, 19000, 1, (v) => `${Math.round(v)} Hz`, true],
  ['hp', 'High-pass', 15, 2000, 1, (v) => `${Math.round(v)} Hz`, true],
  ['drive', 'Drive', 0, 1, 0.01],
  ['delay', 'Delay send', 0, 1, 0.01],
  ['reverb', 'Reverb send', 0, 1, 0.01],
  ['duck', 'Sidechain (duck to kick)', 0, 1, 0.01],
  ['duckRelease', 'Duck release', 0.03, 0.6, 0.01, (v) => `${Math.round(v * 1000)} ms`],
  ['filterFollow', 'Filter follows energy', 0, 1, 0.01],
];
const MASTER = [
  ['glue', 'Glue compression', 0, 1, 0.01], ['pump', 'Master pump', 0, 0.8, 0.01],
  ['pumpRelease', 'Pump release', 0.05, 0.5, 0.01, (v) => `${Math.round(v * 1000)} ms`],
  ['delayFeedback', 'Delay feedback', 0, 0.9, 0.01], ['delayGrit', 'Tape grit', 0, 1, 0.01],
  ['reverbDecay', 'Reverb decay', 0.5, 12, 0.1, (v) => `${v.toFixed(1)} s`], ['gainDb', 'Master level', -12, 6, 0.5, (v) => `${v.toFixed(1)} dB`],
];
function renderParams() {
  const body = $('#pa-body');
  if (ui.master) {
    $('#pa-title').textContent = 'Master';
    body.replaceChildren(...MASTER.map(([k, label, min, max, step, fmt]) => range(label, song.master[k] ?? 0, min, max, step, (v, done) => liveEdit((s) => { s.master[k] = v; }, done), fmt)),
      el('p', { class: 'hint ctl wide' }, 'Master changes rebuild the mix, so you may hear a short gap.'));
    return;
  }
  const t = song.tracks.find((x) => x.id === ui.track);
  $('#pa-title').textContent = `${t.name} settings`;
  const kids = MIX.map(([k, label, min, max, step, fmt, log]) => range(label, t.mix[k] ?? (k === 'filterFollow' ? 1 : 0), min, max, step, (v, done) => liveEdit((s) => { s.tracks.find((x) => x.id === t.id).mix[k] = v; }, done), fmt, log));
  if (t.instrument === 'poly') {
    const sel = el('select', { 'aria-label': 'Sound', onchange: (e) => commit((s) => { const tt = s.tracks.find((x) => x.id === t.id); tt.params.patch = presetPatch(e.target.value); tt.params.preset = e.target.value; }) },
      el('option', { value: '' }, 'Choose a Stab Lab sound…'), ...PRESETS.map((p) => el('option', { value: p.id }, p.name)));
    sel.value = t.params.preset ?? '';
    kids.unshift(el('div', { class: 'ctl wide' }, el('label', {}, 'Sound (Stab Lab character)'), sel));
  } else {
    for (const [k, v] of Object.entries(t.params)) {
      if (typeof v !== 'number') continue;
      const max = k === 'note' ? 48 : v > 1 ? Math.max(8, v * 3) : 1;
      const min = k === 'note' ? 24 : 0;
      kids.push(range(`Sound: ${k}`, v, min, max, k === 'note' ? 1 : 0.01, (x, done) => liveEdit((s) => { s.tracks.find((y) => y.id === t.id).params[k] = x; }, done),
        k === 'note' ? (x) => noteName(Math.round(x)) : undefined));
    }
  }
  body.replaceChildren(...kids);
}

// ---------------------------------------------------------------- export
function makeZip(files) {
  const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (d) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = T[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = new TextEncoder(); const parts = [], cen = []; let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), cr = crc(f.data), h = new DataView(new ArrayBuffer(30)), c = new DataView(new ArrayBuffer(46));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, cr, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, cr, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data); cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + f.data.length;
  }
  const size = cen.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)]);
}
const inArtifact = !!(window.claude && typeof window.claude.use === 'function');
async function exportSong() {
  const btn = $('#btn-export');
  let dir = null;
  if (!inArtifact && window.showDirectoryPicker) {
    try { dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'onesong-export' }); } catch (e) { if (e?.name === 'AbortError') return; }
  }
  btn.disabled = true;
  // eslint-disable-next-line no-undef
  const w = new Worker(URL.createObjectURL(new Blob([__EXPORT_SRC__], { type: 'text/javascript' })));
  w.onmessage = async (e) => {
    const m = e.data;
    if (m.type === 'progress') { btn.textContent = `Rendering ${Math.round(m.done * 100)}%`; return; }
    w.terminate();
    btn.textContent = 'Saving…';
    const title = (song.title || 'one-song').replace(/[^\w-]+/g, '-');
    try {
      if (dir) {
        const d = await dir.getDirectoryHandle(title, { create: true });
        for (const f of m.files) {
          const parts = f.name.split('/'); let dd = d;
          for (const p of parts.slice(0, -1)) dd = await dd.getDirectoryHandle(p, { create: true });
          const wr = await (await dd.getFileHandle(parts.at(-1), { create: true })).createWritable(); await wr.write(f.data); await wr.close();
        }
        toast(`Saved master and ${m.files.length - 1} stems to ${title}/`);
      } else if (inArtifact) {
        const dl = await window.claude.use('downloads');
        if (!dl) throw new Error('saving files is not available here');
        // Artifact pages can only save certain types; WAVs go out as one ZIP.
        await dl.save({ filename: `${title}.zip`, data: makeZip(m.files.map((f) => ({ name: `${title}/${f.name}`, data: f.data }))) });
        toast('Saved a ZIP with the master and stems');
      } else {
        for (const f of m.files) {
          const a = el('a', { href: URL.createObjectURL(new Blob([f.data], { type: 'audio/wav' })), download: `${title}-${f.name.replace('/', '-')}` });
          document.body.append(a); a.click(); a.remove();
          await new Promise((r) => setTimeout(r, 300));
        }
        toast(`Downloaded master and ${m.files.length - 1} stems`);
      }
    } catch (err) { if (err?.code !== 'declined') toast(`Export failed: ${err.message ?? err.code}`); }
    btn.disabled = false; btn.textContent = 'Export master + stems';
  };
  w.postMessage({ song, sr: 48000 });
}

// ---------------------------------------------------------------- misc
let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}
function renderAll() {
  $('#song-meta').textContent = `${song.bpm} BPM · ${song.key} ${song.scale} · ${songBars(song)} bars`;
  renderTabs(); renderRuler(); renderLabels(); renderMap(); drawCurve(); renderEditor(); renderParams(); updatePosition();
}

$('#btn-play').addEventListener('click', togglePlay);
$('#btn-rewind').addEventListener('click', () => seek(0));
$('#loop').addEventListener('change', updateLoop);
$('#btn-undo').addEventListener('click', undo);
$('#btn-redo').addEventListener('click', redo);
$('#btn-export').addEventListener('click', exportSong);
$('#btn-menu').addEventListener('click', () => { $('#menu').hidden = !$('#menu').hidden; });
document.addEventListener('click', (e) => { if (!e.target.closest('#menu, #btn-menu')) $('#menu').hidden = true; });
$('#menu').addEventListener('click', (e) => {
  const act = e.target.dataset?.act;
  if (act === 'save') {
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(song, null, 1)], { type: 'application/json' })), download: 'one-song.json' });
    document.body.append(a); a.click(); a.remove();
  }
  if (act === 'reset') commit((s) => { Object.assign(s, buildSong()); });
});
$('#file-load').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const s = JSON.parse(await f.text()); if (!s.sections) throw new Error('not a song file'); commit((cur) => { Object.keys(cur).forEach((k) => delete cur[k]); Object.assign(cur, s); }); toast('Song loaded'); }
  catch (err) { toast(`Could not load: ${err.message}`); }
  e.target.value = '';
});
$('#tl-body').addEventListener('dblclick', (e) => { if (e.target.closest('#ruler')) seek(0); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
});
window.addEventListener('resize', () => { drawCurve(); drawXY(); });

setupCurve();
setupPerf();
renderAll();
drawXY();
updateUndo();
setupAsk({ getSong: () => song, commit, toast, undo });
