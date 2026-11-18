#!/usr/bin/env node
// Minimal static server. `npm run dev` serves the built app on :5173;
// `node scripts/serve.mjs --src` serves the unbundled source for debugging.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const useSrc = process.argv.includes('--src');
const base = useSrc ? root : join(root, 'dist');
const port = Number(process.env.PORT ?? 5173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = useSrc ? '/src/ui/index.html' : '/index.html';
  const file = normalize(join(base, path));
  if (!file.startsWith(base)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => console.log(`Stab Lab on http://localhost:${port}${useSrc ? ' (source)' : ''}`));
