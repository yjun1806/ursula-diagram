// Runs the playground's drawing code under Node against the engine file the site serves, for every example file,
// and counts the official examples the Examples pages draw.
// Run after `npm run build` (or `node scripts/prepare.mjs`).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { existsSync } from 'node:fs';
import { TABS, decodeState, draw, encodeState } from '../.vitepress/theme/playground/draw.js';
import { GALLERY_EN, GALLERY_KO } from '../.vitepress/theme/playground/gallery-texts.js';

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

for (const [lang, gallery] of [['en', GALLERY_EN], ['ko', GALLERY_KO]]) {
  for (const [name, src] of Object.entries(gallery)) {
    for (const { id } of TABS) {
      const out = draw(engine, src, id, 100);
      if (out.error) fail(`${lang} gallery ${name} ${id}: ${out.error}`);
    }
  }
  console.log(`ok   ${lang} gallery: ${Object.keys(gallery).length} texts in ${TABS.length} outputs`);
}

// The built pages: both playground routes carry the component, and every English page has a Korean twin.
const built = join(site, '.vitepress', 'dist');
if (existsSync(built)) {
  for (const [page, words] of [['playground.html', ['Copy link', 'Example']], ['ko/playground.html', ['링크 복사', '예시']]]) {
    const html = readFileSync(join(built, page), 'utf8');
    const missing = ['pg-input', ...words].filter((w) => !html.includes(w));
    if (missing.length) fail(`${page} lacks ${missing.join(', ')}`);
    else console.log(`ok   ${page}`);
  }
  const pages = (d, rel = '') =>
    readdirSync(join(d, rel), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (rel === '' && ['ko', 'assets'].includes(e.name) ? [] : pages(d, join(rel, e.name))) : e.name.endsWith('.html') && e.name !== '404.html' ? [join(rel, e.name)] : [],
    );
  const missingKo = pages(built).filter((p) => !existsSync(join(built, 'ko', p)));
  if (missingKo.length) fail(`no Korean page for ${missingKo.join(', ')}`);
  else console.log('ok   every English page has a Korean page');
  if (!readFileSync(join(built, 'index.html'), 'utf8').includes('ursula-lang')) fail('the language redirect is not in the page head');
}

// The Examples pages: how many official examples the engine drew. A refused example shows its error on its page
// instead of failing the build, so the count here is where a regression shows.
const rendered = JSON.parse(readFileSync(join(site, '.vitepress', 'examples', 'rendered.json'), 'utf8')).types;
const items = rendered.flatMap((t) => t.items.map((i) => ({ ...i, type: t.id })));
const onDisk = rendered.reduce((n, t) => n + readdirSync(join(site, 'examples', 'official', t.id)).filter((f) => f.endsWith('.mmd')).length, 0);
if (onDisk !== items.length) fail(`rendered.json has ${items.length} examples but examples/official/ has ${onDisk}; run node scripts/prepare.mjs`);
const refused = items.filter((i) => i.error);
for (const i of refused) console.log(`WARN official example ${i.type}/${i.name}: ${i.error}`);
console.log(`ok   official examples: ${items.length - refused.length} of ${items.length} drawn, ${refused.length} errors, in ${rendered.length} types`);
if (existsSync(built)) {
  for (const t of rendered) {
    for (const page of [`examples/${t.id}.html`, `ko/examples/${t.id}.html`]) {
      const path = join(built, page);
      const shown = existsSync(path) ? readFileSync(path, 'utf8').split('class="ex-item"').length - 1 : -1;
      if (shown !== t.items.length) fail(`${page} shows ${shown} examples, not ${t.items.length}`);
    }
  }
  console.log(`ok   ${rendered.length} type pages in each language show every example`);
  for (const [page, target] of [['gallery.html', '/examples/'], ['ko/gallery.html', '/ko/examples/']]) {
    if (!readFileSync(join(built, page), 'utf8').includes(`url=/ursula-diagram${target}`)) fail(`${page} does not send the visitor to ${target}`);
  }
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
