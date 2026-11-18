// WAV encoding (from Stab Lab).

import { clamp } from '../dsp/util.js';

export function encodeWav(channels, sr, bitDepth = 24) {
  const nch = channels.length, n = channels[0].length;
  const bytes = bitDepth / 8;
  const fmt = bitDepth === 32 ? 3 : 1;
  const dataSize = n * nch * bytes;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, fmt, true); v.setUint16(22, nch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nch * bytes, true); v.setUint16(32, nch * bytes, true);
  v.setUint16(34, bitDepth, true);
  str(36, 'data'); v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const x = clamp(channels[c][i], -1, 1);
      if (bitDepth === 16) { v.setInt16(o, Math.round(x * 32767), true); o += 2; }
      else if (bitDepth === 24) {
        const s = Math.round(x * 8388607);
        v.setUint8(o, s & 0xff); v.setUint8(o + 1, (s >> 8) & 0xff); v.setUint8(o + 2, (s >> 16) & 0xff); o += 3;
      } else { v.setFloat32(o, x, true); o += 4; }
    }
  }
  return new Uint8Array(buf);
}

