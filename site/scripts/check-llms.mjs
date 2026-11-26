// Checks what AI agents read of the built site (.vitepress/llms/index.mjs): llms.txt lists the Markdown twin of every
// English page but the redirect stubs and no Korean URL; every twin it lists is in the build and reads as Markdown,
// with no component tag or build-time fence left in it; and every English page names its twin in its head. Run after
// `npm run build`.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_URL } from '../.vitepress/seo.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const built = join(site, '.vitepress', 'dist');
if (!existsSync(built)) {
  console.error('FAIL .vitepress/dist is missing; run npm run build first');
  process.exit(1);
}

let failed = 0;
const fail = (message) => {
  failed++;
  console.error(`FAIL ${message}`);
};

const files = (rel = '') =>
  readdirSync(join(built, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (rel === '' && e.name === 'assets' ? [] : files(join(rel, e.name))) : [join(rel, e.name)],
  );
const all = files();
const isStatic = (file) => existsSync(join(site, 'public', file));
const WEB_ONLY = ['click a picture', 'enlarge', 'in its own tab', 'buttons above'];
const isRedirect = (html) => /<meta[^>]*http-equiv="refresh"/i.test(html);

// The English pages: every built HTML page outside ko/ but 404.html, the files copied from public/ and the redirects.
const english = all
  .filter((f) => f.endsWith('.html') && !f.startsWith('ko/') && f !== '404.html' && !isStatic(f))
  .map((file) => ({ file, html: readFileSync(join(built, file), 'utf8') }))
  .filter((p) => !isRedirect(p.html))
  .map((p) => ({ ...p, twin: p.file.replace(/\.html$/, '.md') }));

const llmsFile = join(built, 'llms.txt');
const fullFile = join(built, 'llms-full.txt');
for (const f of [llmsFile, fullFile]) if (!existsSync(f)) fail(`${f.slice(built.length + 1)} is missing`);
if (failed) process.exit(1);

const llms = readFileSync(llmsFile, 'utf8');
const listed = [...llms.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]);
const twins = listed.filter((u) => u.startsWith(SITE_URL) && u.endsWith('.md')).map((u) => u.slice(SITE_URL.length));

// llms.txt: a title, every English page once, nothing Korean.
if (!/^# \S/.test(llms)) fail('llms.txt does not start with a # title');
const missing = english.filter((p) => !twins.includes(p.twin));
if (missing.length) fail(`llms.txt lacks ${missing.length} English pages: ${missing.slice(0, 5).map((p) => p.twin).join(', ')}`);
const twice = twins.filter((t, i) => twins.indexOf(t) !== i);
if (twice.length) fail(`llms.txt lists ${twice.join(', ')} more than once`);
const korean = [llms, readFileSync(fullFile, 'utf8')].flatMap((text) => [...text.matchAll(new RegExp(`${SITE_URL}ko(/[^)\\s]*)?`, 'g'))].map((m) => m[0]));
const fullWeb = WEB_ONLY.filter((words) => readFileSync(fullFile, 'utf8').toLowerCase().includes(words));
if (fullWeb.length) fail(`llms-full.txt has web-only words: ${fullWeb.join(', ')}`);
if (korean.length) fail(`llms.txt or llms-full.txt links to Korean pages: ${[...new Set(korean)].slice(0, 5).join(', ')}`);
const koTwins = all.filter((f) => f.startsWith('ko/') && f.endsWith('.md'));
if (koTwins.length) fail(`the build has Korean Markdown twins: ${koTwins.slice(0, 5).join(', ')}`);
if (!missing.length && !twice.length && !korean.length && !koTwins.length) {
  console.log(`ok   llms.txt lists all ${english.length} English pages once and no Korean page`);
}

// Every listed twin is in the build and reads as Markdown: no component tag and no build-time fence outside code.
let readable = 0;
for (const twin of twins) {
  const file = join(built, twin);
  if (!existsSync(file)) {
    fail(`llms.txt lists ${twin}, which is not in the build`);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  const prose = text.replace(/^(\s*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2\s*$/gm, '');
  const problems = [];
  if (!/^# \S/m.test(text)) problems.push('no # title');
  const tag = /<[A-Z][A-Za-z]+\b[^>]*\/?>/.exec(prose);
  if (tag) problems.push(`component tag ${tag[0]}`);
  const fence = /^\s*```(ursula-output|ursula-input|examples-glance)\b.*$/m.exec(text);
  if (fence) problems.push(`build-time fence ${fence[0].trim()}`);
  if (/^:::/m.test(prose)) problems.push('a ::: container');
  // Words that only make sense on the web page; mark them with <WebOnly> (theme/web-only/WebOnly.vue).
  const web = WEB_ONLY.find((words) => text.toLowerCase().includes(words));
  if (web) problems.push(`web-only words "${web}"`);
  if (problems.length) fail(`${twin}: ${problems.join('; ')}`);
  else readable++;
}
console.log(`ok   ${readable} of ${twins.length} listed Markdown pages are in the build and read as Markdown`);

// Every English page names its twin.
let named = 0;
for (const p of english) {
  const href = /<link rel="alternate" type="text\/markdown" href="([^"]*)"/.exec(p.html)?.[1];
  if (href !== SITE_URL + p.twin) fail(`${p.file}: Markdown alternate ${href}, not ${SITE_URL + p.twin}`);
  else named++;
}
console.log(`ok   ${named} English pages name their Markdown twin in the head`);

const kB = (f) => `${(statSync(f).size / 1024).toFixed(0)} kB`;
console.log(`ok   llms.txt ${kB(llmsFile)}, llms-full.txt ${kB(fullFile)}`);
if (failed) process.exit(1);
console.log('all llms checks passed');
