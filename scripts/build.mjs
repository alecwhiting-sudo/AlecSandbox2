#!/usr/bin/env node
// Builds dist/index.html (one self-contained file: app, live audio engine and
// export worker inlined) and dist/artifact.html (the same page for claude.ai,
// where the Ask box can use Claude).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });
const bundle = async (entry, define = {}) => (await build({
  entryPoints: [join(root, entry)], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', define,
})).outputFiles[0].text;

const worklet = await bundle('src/engine/worklet.js');
const exporter = await bundle('src/engine/export-worker.js');
const js = (await bundle('src/ui/app.js', { __WORKLET_SRC__: JSON.stringify(worklet), __EXPORT_SRC__: JSON.stringify(exporter) }))
  .replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'src/ui/style.css'), 'utf8');
let html = readFileSync(join(root, 'src/ui/index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="./style.css">', () => `<style>\n${css}</style>`);
html = html.replace('<script type="module" src="./app.js"></script>', () => `<script>\n${js}</script>`);
writeFileSync(join(out, 'index.html'), html);

const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
writeFileSync(join(out, 'artifact.html'), `${head.trim()}\n${body.trim()}\n`);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KB`);
