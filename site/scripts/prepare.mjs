// Copies the engine build and the README pictures into public/, so the site always shows the engine of this checkout,
// then draws the official examples with it (scripts/render-examples.mjs).
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

// The Examples pages: every official example drawn with this engine.
const { renderExamples } = await import('./render-examples.mjs');
renderExamples();
