// Copies the engine build and the README pictures into public/, so the site always shows the engine of this checkout,
// then draws the home page's loop (scripts/render-loop.mjs), the official examples (scripts/render-examples.mjs) and the
// terminal texts of the picture grids (scripts/render-compare.mjs) with it.
// Run `bun scripts/build.ts` in the repository root first.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(site, '..');
const engine = join(root, 'dist', 'ursula.global.js');

if (!existsSync(engine)) {
  console.error('dist/ursula.global.js is missing. Build the engine first: bun scripts/build.ts');
  process.exit(1);
}

const pub = join(site, 'public');
mkdirSync(pub, { recursive: true });
copyFileSync(engine, join(pub, 'ursula.global.js'));

const assets = join(pub, 'assets');
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
for (const name of readdirSync(join(root, 'assets'))) {
  if (/\.(svg|png)$/.test(name)) copyFileSync(join(root, 'assets', name), join(assets, name));
}
console.log('copied dist/ursula.global.js and assets/ into site/public/');

// The home page's loop, drawn with this engine.
const { renderLoop } = await import('./render-loop.mjs');
renderLoop();

// The Examples pages: every official example drawn with this engine.
const { renderExamples } = await import('./render-examples.mjs');
renderExamples();

// The picture grids next to the speed numbers: the terminal texts of the Compared page and the size of every picture.
const { renderCompare } = await import('./render-compare.mjs');
renderCompare();
