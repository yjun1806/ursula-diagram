// Runs the playground's drawing code under Node against the engine file the site serves, for every example file,
// and counts the official examples the Examples pages draw.
// Run after `npm run build` (or `node scripts/prepare.mjs`).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { existsSync } from 'node:fs';
import { TABS, FILES, copyText, decodeState, draw, encodeState, resolveColours } from '../.vitepress/theme/playground/draw.js';
import { GALLERY_EN, GALLERY_KO } from '../.vitepress/theme/playground/gallery-texts.js';
import { isMermaid } from '../.vitepress/mermaid-fence.mjs';
import { CARDS } from '../.vitepress/theme/home/agents.js';
import { INSTALL } from '../.vitepress/theme/home/install.js';
import { colourRows } from '../.vitepress/theme/colours/colours.mjs';
import { checkCommands, documents } from '../../scripts/docs/commands.mjs';
import { listedIssues, openRoadmapIssues } from './roadmap.mjs';

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
  for (const [page, words] of [['playground.html', ['Copy link', 'Copy Mermaid', 'Copy SVG', 'Download .svg', 'Example']], ['ko/playground.html', ['링크 복사', 'Mermaid 복사', 'SVG 복사', '.svg 내려받기', '예시']]]) {
    const html = readFileSync(join(built, page), 'utf8');
    const missing = ['pg-input', ...words].filter((w) => !html.includes(w));
    if (missing.length) fail(`${page} lacks ${missing.join(', ')}`);
    else console.log(`ok   ${page}`);
  }
  const pages = (d, rel = '') =>
    readdirSync(join(d, rel), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (rel === '' && ['ko', 'assets'].includes(e.name) ? [] : pages(d, join(rel, e.name))) : e.name.endsWith('.html') && e.name !== '404.html' ? [join(rel, e.name)] : [],
    );
  // A file copied from public/ as it is (the search console verification file) is not a page and has no twin.
  const missingKo = pages(built).filter((p) => !existsSync(join(site, 'public', p)) && !existsSync(join(built, 'ko', p)));
  if (missingKo.length) fail(`no Korean page for ${missingKo.join(', ')}`);
  else console.log('ok   every English page has a Korean page');
  if (!readFileSync(join(built, 'index.html'), 'utf8').includes('ursula-lang')) fail('the language redirect is not in the page head');

  // Section links: every h2 and h3 with an id carries the anchor that section-link.js turns into a copy button,
  // pointing at that same id, and the built script carries the button's labels.
  const allPages = (d, rel = '') =>
    readdirSync(join(d, rel), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (rel === '' && e.name === 'assets' ? [] : allPages(d, join(rel, e.name))) : e.name.endsWith('.html') ? [join(rel, e.name)] : [],
    );
  let headings = 0;
  const unlinked = [];
  for (const page of allPages(built)) {
    const html = readFileSync(join(built, page), 'utf8');
    for (const [, , attrs, inner] of html.matchAll(/<(h[23])\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const id = /\sid="([^"]*)"/.exec(attrs)?.[1];
      if (id === undefined) continue;
      headings++;
      if (!inner.includes(`<a class="header-anchor" href="#${id}"`)) unlinked.push(`${page}#${id}`);
    }
  }
  if (unlinked.length) fail(`${unlinked.length} of ${headings} headings have no section link: ${unlinked.slice(0, 10).join(', ')}`);
  else console.log(`ok   section links: ${headings} of ${headings} h2/h3 headings with an id`);
  const labelled = readdirSync(join(built, 'assets'), { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .some((f) => {
      const js = readFileSync(join(built, 'assets', f), 'utf8');
      return js.includes('Copy link to this section') && js.includes('이 절의 링크 복사');
    });
  if (!labelled) fail('no built script carries the section link labels');
  else console.log('ok   section link script');
  // The button's rule must stand on its own in the built CSS; an unclosed rule above it would nest it and hide it.
  const styled = readdirSync(join(built, 'assets'))
    .filter((f) => f.endsWith('.css'))
    .some((f) => /}:is\(h2,h3\)\[id\]>a\.header-anchor\{position:absolute/.test(readFileSync(join(built, 'assets', f), 'utf8')));
  if (!styled) fail('the built CSS has no top-level rule for the section link button');
  else console.log('ok   section link style');
}

// The Examples pages: how many official examples the engine drew. A refused example shows its error on its page
// instead of failing the build, so the count here is where a regression shows.
const rendered = JSON.parse(readFileSync(join(site, '.vitepress', 'examples', 'rendered.json'), 'utf8')).types;
const items = rendered.flatMap((t) => t.items.map((i) => ({ ...i, type: t.id })));
const onDisk = rendered.reduce((n, t) => n + readdirSync(join(site, 'examples', 'official', t.id)).filter((f) => f.endsWith('.mmd')).length, 0);
if (onDisk !== items.length) fail(`rendered.json has ${items.length} examples but examples/official/ has ${onDisk}; run node scripts/prepare.mjs`);
const refused = items.filter((i) => i.error);
for (const i of refused) console.log(`WARN official example ${i.type}/${i.name}: ${i.error}`);
console.log(`ok   official examples as SVG: ${items.length - refused.length} of ${items.length} drawn, ${refused.length} errors, in ${rendered.length} types`);
const termRefused = items.filter((i) => i.termError);
for (const i of termRefused) console.log(`WARN official example ${i.type}/${i.name} in the terminal: ${i.termError}`);
console.log(`ok   official examples in the terminal at 80 columns: ${items.length - termRefused.length} of ${items.length} drawn, ${termRefused.length} errors`);
for (const i of items.filter((x) => x.term)) {
  for (const ext of ['svg', 'txt']) {
    if (!existsSync(join(site, 'public', `${i.term}.${ext}`))) fail(`${i.term}.${ext} is missing`);
  }
}
if (existsSync(built)) {
  for (const t of rendered) {
    for (const page of [`examples/${t.id}.html`, `ko/examples/${t.id}.html`]) {
      const path = join(built, page);
      const shown = existsSync(path) ? readFileSync(path, 'utf8').split('class="ex-item"').length - 1 : -1;
      if (shown !== t.items.length) fail(`${page} shows ${shown} examples, not ${t.items.length}`);
      const terms = existsSync(path) ? readFileSync(path, 'utf8').split('ex-view ex-only-term').length - 1 : -1;
      if (terms !== t.items.length) fail(`${page} has ${terms} terminal views, not ${t.items.length}`);
    }
  }
  console.log(`ok   ${rendered.length} type pages in each language show every example as SVG and in the terminal`);
  // The index page's "At a glance" section: one card per official example, in the order of the type pages, each
  // picture lazy and sized so the page does not jump while the pictures load.
  for (const [page, prefix] of [['examples/index.html', '/examples/'], ['ko/examples/index.html', '/ko/examples/']]) {
    const html = readFileSync(join(built, page), 'utf8');
    const cards = [...html.matchAll(/<div class="gl-card">([\s\S]*?)<\/a><\/div>/g)].map((m) => m[1]);
    const expected = items.map((i) => `/ursula-diagram${prefix}${i.type}#${encodeURIComponent(i.name)}`);
    const links = cards.map((c) => /class="gl-name" href="([^"]*)"/.exec(c)?.[1]);
    const unsized = cards.filter((c) => /<img\b/.test(c) && !/<img [^>]*width="\d+" height="\d+" loading="lazy" decoding="async"/.test(c));
    if (links.join('\n') !== expected.join('\n')) fail(`${page} lists ${cards.length} examples at a glance, not the ${items.length} of the type pages in their order`);
    else if (unsized.length) fail(`${page}: ${unsized.length} pictures at a glance are not lazy with a width and height`);
    else console.log(`ok   ${page} shows all ${cards.length} examples at a glance, each picture lazy with its size`);
  }
  for (const [page, target] of [['gallery.html', '/examples/'], ['ko/gallery.html', '/ko/examples/']]) {
    if (!readFileSync(join(built, page), 'utf8').includes(`url=/ursula-diagram${target}`)) fail(`${page} does not send the visitor to ${target}`);
  }
}

// The colour variables: every colour of the engine has a description (colourRows throws otherwise), and each Colours
// page shows a row with two swatches per colour.
const colours = colourRows();
if (existsSync(built)) {
  for (const page of ['guide/colours.html', 'ko/guide/colours.html']) {
    const html = readFileSync(join(built, page), 'utf8');
    const shown = html.split('class="ct-row"').length - 1;
    const swatches = (html.match(/class="ct-swatch-(colour|clear|none) ct-swatch"/g) ?? []).length;
    if (shown !== colours.length || swatches !== 2 * colours.length) {
      fail(`${page} shows ${shown} colour rows and ${swatches} swatches, not ${colours.length} and ${2 * colours.length}`);
    } else if (html.includes('<details')) fail(`${page} folds its colour table`);
    else console.log(`ok   ${page}: ${shown} colours, each with a light and a dark swatch`);
  }
}

// Every page: a code block (<pre>) sits in a VitePress code block wrapper with a copy button, and Mermaid text sits
// in a `mermaid` block, which custom.css wraps instead of scrolling sideways.
const unescape = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/**
 * The <pre> blocks of a page, each with the class of the <div> around it, the classes of every <div> it sits in, and
 * whether that <div> has a copy button.
 */
function preBlocks(html) {
  const blocks = [];
  const stack = [];
  const tag = /<(\/?)(div|pre|button)\b([^>]*)>/g;
  let m;
  while ((m = tag.exec(html))) {
    const [, close, name, attrs] = m;
    const cls = attrs.match(/\sclass="([^"]*)"/)?.[1] ?? '';
    if (name === 'div') {
      if (close) stack.pop();
      else stack.push({ cls, copy: false });
    } else if (name === 'button' && !close && /(^|\s)copy(\s|$)/.test(cls) && stack.length) {
      stack[stack.length - 1].copy = true;
    } else if (name === 'pre' && !close) {
      const end = html.indexOf('</pre>', tag.lastIndex);
      const parent = stack[stack.length - 1] ?? { cls: '', copy: false };
      blocks.push({ ...parent, outer: stack.map((d) => d.cls).join(' '), text: unescape(html.slice(tag.lastIndex, end)) });
      tag.lastIndex = end;
    }
  }
  return blocks;
}

// One command per shell block: a copy button copies the whole block, so a block of alternatives (install here or
// everywhere, one format or another) hands the reader every line at once. A command may run over several lines with
// a trailing `\\`, `&&`, `||` or `|`, or carry a here-document; a block whose lines must run together in order sits in
// a <div class="cmd-sequence">. A copied command carries no `# comment` either: the sentence before the block says
// what it is for.
const SHELL = /(^|\s)language-(bash|sh|shell|zsh|console)(\s|$)/;

/** The problems of a shell block's text: more than one command, or a command with a trailing comment. */
function shellProblems(text, console = false) {
  const commands = [];
  let heredoc = null;
  let joining = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (heredoc) {
      if (line === heredoc) heredoc = null;
      continue;
    }
    if (!line || line.startsWith('#')) continue;
    if (console && !joining && !line.startsWith('$')) continue;
    if (joining) commands[commands.length - 1] += ` ${line}`;
    else commands.push(line);
    heredoc = line.match(/<<-?\s*['"]?(\w+)['"]?/)?.[1] ?? null;
    joining = /(\\|&&|\|\||\|)$/.test(line);
  }
  const problems = [];
  if (commands.length > 1) problems.push(`${commands.length} commands in one block`);
  const commented = commands.filter((c) => /\s#\s/.test(c.replace(/'[^']*'|"[^"]*"/g, '')));
  if (commented.length) problems.push(`a comment after ${commented[0]}`);
  return problems;
}

// The READMEs have no tabs: a shell fence there holds one command too, unless the line before it is <!-- sequence -->.
for (const readme of ['README.md', 'README.ko.md']) {
  const lines = readFileSync(join(site, '..', readme), 'utf8').split('\n');
  let total = 0;
  let bad = 0;
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^(`{3,})(bash|sh|shell|zsh|console)\s*$/);
    if (!open) continue;
    const end = lines.findIndex((l, j) => j > i && l.trim() === open[1]);
    total++;
    const problems = lines[i - 1]?.trim() === '<!-- sequence -->' ? [] : shellProblems(lines.slice(i + 1, end).join('\n'), open[2] === 'console');
    if (problems.length) {
      bad++;
      fail(`${readme}:${i + 1}: ${problems.join(', ')}; give each command its own block and say what it is for before it`);
    }
    i = end;
  }
  console.log(`ok   ${readme}: ${total - bad} of ${total} shell blocks hold one command without a comment`);
}

// No callout boxes: no VitePress tip/info/warning/danger/details container and no GitHub alert on the site or in the
// READMEs, and no home card drawn apart from the others. Say the point in a plain paragraph instead. A raw <details>
// may still fold long reference material (the Mermaid text of each picture, the --charset ascii table).
const CALLOUT_HTML = /class="(?=[^"]*\bcustom-block\b)(?=[^"]*\b(?:tip|info|warning|danger|details|note|important|caution|github-alert)\b)[^"]*"|\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/;
for (const readme of ['README.md', 'README.ko.md']) {
  const lines = readFileSync(join(site, '..', readme), 'utf8').split('\n');
  const alerts = lines.flatMap((l, i) => (/^\s*>\s*\[!/.test(l) ? [i + 1] : []));
  if (alerts.length) fail(`${readme}:${alerts.join(',')}: a > [! alert; write it as a plain paragraph`);
  else console.log(`ok   ${readme} has no > [! alert`);
}
if (CARDS.some((c) => 'featured' in c || 'highlight' in c)) fail('home agent cards: a card is marked featured; every card looks the same');

for (const [where, commands] of [['home install tabs', INSTALL.map((m) => m.command)], ['home agent cards', CARDS.flatMap((c) => c.commands)]]) {
  for (const c of commands) for (const p of shellProblems(c)) fail(`${where}: ${p}`);
  console.log(`ok   ${where}: ${commands.length} commands, each with its own copy button`);
}

if (existsSync(built)) {
  const allPages = (d, rel = '') =>
    readdirSync(join(d, rel), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (rel === '' && e.name === 'assets' ? [] : allPages(d, join(rel, e.name))) : e.name.endsWith('.html') ? [join(rel, e.name)] : [],
    );
  let pres = 0;
  let mermaid = 0;
  let shells = 0;
  let sequences = 0;
  const mixed = [];
  const callouts = [];
  const noCopy = new Map();
  const noWrap = new Map();
  for (const page of allPages(built)) {
    const html = readFileSync(join(built, page), 'utf8');
    const callout = html.match(CALLOUT_HTML);
    if (callout) callouts.push(`${page}: ${callout[0]}`);
    for (const b of preBlocks(html)) {
      pres++;
      if (!(/language-/.test(b.cls) && b.copy)) noCopy.set(page, (noCopy.get(page) ?? 0) + 1);
      if (SHELL.test(b.cls)) {
        shells++;
        if (/(^|\s)cmd-sequence(\s|$)/.test(b.outer)) sequences++;
        else {
          const problems = shellProblems(b.text, /language-console/.test(b.cls));
          if (problems.length) mixed.push(`${page}: ${problems.join(', ')}`);
        }
      }
      if (isMermaid(b.text)) {
        mermaid++;
        if (!/language-mermaid/.test(b.cls)) noWrap.set(page, (noWrap.get(page) ?? 0) + 1);
      }
    }
  }
  for (const c of callouts) fail(`${c}; write it as a plain paragraph, not a callout box`);
  if (!callouts.length) console.log('ok   no built page carries a callout box (::: tip/info/warning/danger, > [!NOTE])');
  for (const [page, n] of noCopy) fail(`${page}: ${n} code blocks without a copy button`);
  for (const [page, n] of noWrap) fail(`${page}: ${n} Mermaid blocks not marked as mermaid, so they do not wrap`);
  for (const m of mixed) fail(`${m}; give each command its own block (or code-group tab) and say what it is for before it`);
  console.log(`ok   ${shells - mixed.length} of ${shells} shell blocks on the built pages hold one command without a comment (${sequences} marked as a sequence)`);
  const count = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`ok   ${pres - count(noCopy)} of ${pres} code blocks on the built pages have a copy button`);
  console.log(`ok   ${mermaid - count(noWrap)} of ${mermaid} Mermaid blocks on the built pages are mermaid blocks`);
  const css = readdirSync(join(built, 'assets')).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(built, 'assets', f), 'utf8')).join('');
  if (!/language-mermaid[^{}]*pre code\{[^}]*white-space:pre-wrap/.test(css)) fail('the built CSS does not wrap mermaid blocks');
  else console.log('ok   the built CSS wraps mermaid blocks');
}

const text = readFileSync(join(dir, 'order-flow.mmd'), 'utf8');
const expected = readFileSync(join(dir, 'order-flow.txt'), 'utf8').trimEnd();
const drawn = draw(engine, text, 'text', 100);
const joined = drawn.lines?.map((l) => l.map((s) => s.text).join('')).join('\n').trimEnd();
if (joined !== expected) fail('order-flow.mmd at width 100 differs from examples/order-flow.txt');
else console.log('ok   order-flow.mmd text at width 100 matches examples/order-flow.txt');

// The copy and download buttons hand over the engine's own output: the SVG markup as render() and renderTextSvg()
// return it, colour variables and all, and the text drawing as the plain lines renderText() returns.
const expectedCopy = {
  svg: engine.render(text),
  text: engine.renderText(text, 100).lines.join('\n'),
  ascii: engine.renderText(text, 100, { charset: 'ascii' }).lines.join('\n'),
  'text-svg': engine.renderTextSvg(text, 100).svg,
};
for (const { id } of TABS) {
  const copied = copyText(draw(engine, text, id, 100));
  if (!FILES[id]) fail(`the ${id} tab has no download file`);
  else if (copied !== expectedCopy[id]) fail(`the ${id} tab copies something other than the engine output`);
  else console.log(`ok   ${id} tab copies the engine output (${copied.length} characters) and downloads ${FILES[id].name}`);
}
if (!expectedCopy.svg.includes('var(--ursula-fg,')) fail('the copied SVG lost its colour variables');
const fixed = resolveColours(expectedCopy.svg, (name) => (name === 'ursula-fg' ? '#123456' : ''));
if (/var\(--/.test(fixed) || !fixed.includes('#123456') || !fixed.includes('#fcfcfa')) fail('resolveColours left a colour variable or ignored a value');
else console.log('ok   the image copy fixes every colour variable to the page colour or the engine fallback');
if (copyText(draw(engine, 'flowchart LR\n  A -->', 'svg', 80)) !== null) fail('an error gave something to copy');

const bad = draw(engine, 'flowchart LR\n  A -->', 'svg', 80);
const narrow = draw(engine, text, 'text', 20);
if (!bad.error) fail('a broken text gave no error');
if (!narrow.error) fail('a too narrow width gave no error');
console.log(`ok   errors: "${bad.error}" / "${narrow.error}"`);

// Every command the docs and the home page name: run against the built command, or on the allow-list with a reason
// (ALLOWED in scripts/docs/commands.mjs).
const commands = await checkCommands();
for (const p of commands.problems) fail(p);
const reasons = [...new Set(commands.allowed.map((a) => a.why))];
console.log(`ok   ${commands.ran.filter((r) => r.ok).length} of ${commands.ran.length} commands in the docs ran with their exit code; ${commands.allowed.length} not run:`);
for (const why of reasons) {
  const which = [...new Set(commands.allowed.filter((a) => a.why === why).map((a) => a.command))];
  console.log(`     ${why}: ${which.join(' | ')}`);
}

// The number of official examples the docs claim is the number on the Examples pages, and every one of them draws.
const root = join(site, '..');
const CLAIM = /\b(\d+) examples (?:in|of) the Mermaid documentation|\ball (\d+) examples\b|Mermaid 문서의 예(?:시|제) (\d+)개/g;
let claims = 0;
for (const doc of documents()) {
  for (const m of readFileSync(join(root, doc), 'utf8').matchAll(CLAIM)) {
    claims++;
    const n = Number(m[1] ?? m[2] ?? m[3]);
    if (n !== items.length) fail(`${doc} claims ${n} examples; the Examples pages have ${items.length}`);
  }
}
if (refused.length || termRefused.length) fail(`the docs claim every example draws, but ${refused.length} SVG and ${termRefused.length} terminal drawings failed`);
console.log(`ok   ${claims} claims of the number of examples in the docs say ${items.length}`);

// The roadmap pages list the same issues, and those are the open issues labelled `roadmap`. The second half needs
// GitHub; without it the check says it skipped, and the rule in RELEASING.md (move a shipped line in the same pull
// request) is what keeps the pages right. Only Planned and In progress are compared; Not planned links no issues.
const [listedEn, listedKo] = ['roadmap.md', 'ko/roadmap.md'].map((p) => listedIssues(readFileSync(join(site, p), 'utf8')));
const sorted = (set) => [...set].sort((a, b) => a - b).map((n) => `#${n}`).join(' ');
if (sorted(listedEn) !== sorted(listedKo)) fail(`roadmap.md lists ${sorted(listedEn)} but ko/roadmap.md lists ${sorted(listedKo)}`);
const roadmap = await openRoadmapIssues();
if (roadmap.skipped) console.log(`skip the roadmap against GitHub: ${roadmap.skipped}`);
else {
  const closed = [...listedEn].filter((n) => !roadmap.open.has(n));
  const missing = [...roadmap.open].filter((n) => !listedEn.has(n));
  if (closed.length) fail(`the roadmap pages list ${sorted(closed)} under Planned or In progress, but GitHub has no open roadmap issue with that number: remove the line (shipped work goes in CHANGELOG.md)`);
  if (missing.length) fail(`the open roadmap issues ${sorted(missing)} are not on the roadmap pages: add a line to Planned`);
  if (!closed.length && !missing.length) console.log(`ok   the roadmap pages list the ${roadmap.open.size} open roadmap issues`);
}

if (failed) process.exit(1);
console.log('all playground checks passed');
