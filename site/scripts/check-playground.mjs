// Runs the playground's drawing code under Node against the engine file the site serves, for every example file.
// Run after `npm run build` (or `node scripts/prepare.mjs`).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { TABS, decodeState, draw, encodeState } from '../.vitepress/theme/playground/draw.js';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({});
vm.runInContext(readFileSync(join(site, 'public', 'ursula.global.js'), 'utf8'), context);
const engine = context.ursula;
if (!engine || typeof engine.render !== 'function') throw new Error('public/ursula.global.js did not define ursula.render');

let failed = 0;
const fail = (message) => {
  failed++;
  console.error(`FAIL ${message}`);
};

const dir = join(site, '..', 'examples');
for (const name of readdirSync(dir).filter((f) => f.endsWith('.mmd'))) {
  const src = readFileSync(join(dir, name), 'utf8');
  for (const { id } of TABS) {
    const out = draw(engine, src, id, 120);
    if (out.error) fail(`${name} ${id}: ${out.error}`);
    else if (out.svg !== undefined && !out.svg.startsWith('<svg')) fail(`${name} ${id}: not an SVG`);
    else if (out.lines !== undefined && out.lines.length === 0) fail(`${name} ${id}: no lines`);
    else console.log(`ok   ${name} ${id}`);
  }
  const back = await decodeState(`#${await encodeState({ src, tab: 'ascii', width: 120 })}`);
  if (back.src !== src || back.tab !== 'ascii' || back.width !== 120) fail(`${name}: the link does not bring the text back`);
  else console.log(`ok   ${name} link`);
}

const text = readFileSync(join(dir, 'order-flow.mmd'), 'utf8');
const expected = readFileSync(join(dir, 'order-flow.txt'), 'utf8').trimEnd();
const drawn = draw(engine, text, 'text', 100);
const joined = drawn.lines?.map((l) => l.map((s) => s.text).join('')).join('\n').trimEnd();
if (joined !== expected) fail('order-flow.mmd at width 100 differs from examples/order-flow.txt');
else console.log('ok   order-flow.mmd text at width 100 matches examples/order-flow.txt');

const bad = draw(engine, 'flowchart LR\n  A -->', 'svg', 80);
const narrow = draw(engine, text, 'text', 20);
if (!bad.error) fail('a broken text gave no error');
if (!narrow.error) fail('a too narrow width gave no error');
console.log(`ok   errors: "${bad.error}" / "${narrow.error}"`);

if (failed) process.exit(1);
console.log('all playground checks passed');
