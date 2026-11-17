// Gridforge build: bundle src/main.js (+ three) into one IIFE and inline it,
// together with src/styles.css, into src/index.html → dist/gridforge.html.
// The output is a single self-contained file with no network dependencies (GDD §18.5).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';

const dev = process.argv.includes('--dev');

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  sourcemap: false,
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/styles.css', 'utf8');
const tpl = readFileSync('src/index.html', 'utf8');
if (!tpl.includes('<!--BUNDLE-->') || !tpl.includes('/*STYLES*/')) throw new Error('template slots missing');

const html = tpl
  .replace('/*STYLES*/', () => css)
  .replace('<!--BUNDLE-->', () => `<script>${js}</script>`);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/gridforge.html', html);
const kb = (statSync('dist/gridforge.html').size / 1024).toFixed(0);
console.log(`dist/gridforge.html  ${kb} KB${dev ? ' (dev)' : ''}`);
