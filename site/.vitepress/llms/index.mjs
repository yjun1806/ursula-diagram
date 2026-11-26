// What AI agents read of the site (https://llmstxt.org), written into the build by config.mjs's buildEnd:
//
// - llms.txt: the title, a summary and every English page with its description, grouped as the sidebar groups them.
// - llms-full.txt: the Markdown of every page in that order, in one file.
// - a .md twin of every English page beside its HTML: /guide/quick-start.md, /examples/flowchart.md, /index.md.
//
// English pages only; the Korean pages under ko/ and the redirect stubs are left out. scripts/check-llms.mjs checks the
// build against this.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createContentLoader } from 'vitepress';
import { SITE_URL, isRedirect, routeOf } from '../seo.mjs';
import { EXAMPLE_STRINGS, readRendered } from '../examples/pages.mjs';
import { MERMAID_DOCS, TYPES } from '../examples/types.mjs';
import { agentMarkdown, withIncludes } from './markdown.mjs';
import { homeTop } from './components.mjs';

/** A site path ('/guide/why', '/assets/x.svg') as an absolute URL; other links stay as they are. */
const url = (href) => (href.startsWith('/') && !href.startsWith('//') ? SITE_URL + href.slice(1) : href);

/** The URL of a page's Markdown twin: 'guide/why.md' -> '.../guide/why.md', 'examples/index.md' as it is. */
export const markdownUrl = (relativePath) => SITE_URL + relativePath;

const SUMMARY =
  'ursula-diagram reads the Mermaid text of all 35 diagram types in the Mermaid documentation and draws it as SVG, as ' +
  'text for a terminal, as one HTML page or as PNG, on Node alone with no browser. It is made for AI coding agents: ' +
  '`--check` draws and checks in one call, every error names the line, what is wrong and how to fix it, ' +
  '`ursula-diagram syntax <type>` prints the rules of a type, and the same text always gives the same drawing. It ships ' +
  'as a command (`npx ursula-diagram`), a library (`render`, `renderText`), an agent skill (`npx skills add ' +
  'yjun1806/ursula-diagram`) and an MCP server (`ursula-diagram mcp`).';

/** The Markdown of one Examples type page: the Mermaid text of every example; the pictures stay on the web page. */
function examplePage(type) {
  const t = EXAMPLE_STRINGS.en;
  const { items } = readRendered().find((r) => r.id === type.id);
  const doc = `[${type.doc}](${MERMAID_DOCS}${type.doc}.html)`;
  const lead =
    `${items.length === 1 ? 'The example' : `All ${items.length} examples`} of the Mermaid documentation's ${doc} page, ` +
    `each drawn by ursula. Below is the Mermaid text of each; the SVG and the terminal drawing at 80 columns are on the ` +
    `web page, ${SITE_URL}examples/${type.id}.`;
  const body = [`# ${type.name}`, '', lead, ''];
  if (type.term) body.push(t.termNote[type.term], '');
  for (const it of items) {
    // A fence longer than any run of backticks in the text, so a text that holds ``` stays inside it.
    const fence = '`'.repeat(Math.max(3, ...[...it.src.matchAll(/`+/g)].map((m) => m[0].length + 1)));
    body.push(`## ${it.name}`, '', `${fence}mermaid`, it.src.replace(/\n+$/, ''), fence, '');
    if (it.error) body.push(`${t.failed} ${it.error}`, '');
  }
  body.push(`[${t.all}](${url('/examples/index.md')})`, '');
  return body.join('\n');
}

/** Every English page but the redirect stubs: { path, markdown, description }, in no particular order. */
async function englishPages(siteConfig) {
  const examplePaths = new Map(TYPES.map((type) => [`examples/${type.id}.md`, type]));
  const english = siteConfig.pages.filter((p) => !p.startsWith('ko/') && p !== '404.md');
  const params = new Map((siteConfig.dynamicRoutes?.routes ?? []).map((r) => [r.path, r.params]));
  const sources = english.filter((p) => !examplePaths.has(p)).map((p) => join(siteConfig.srcDir, p));
  const loaded = await createContentLoader('**/*.md', { includeSrc: true }).load(sources);
  const pages = [];
  for (const page of loaded) {
    const path = page.url === '/' ? 'index.md' : page.url.endsWith('/') ? `${page.url.slice(1)}index.md` : `${page.url.slice(1)}.md`;
    if (isRedirect(page.frontmatter)) continue;
    const file = join(siteConfig.srcDir, path);
    const body = withIncludes(page.src.replace(/^---\n[\s\S]*?\n---\n/, ''), file);
    let markdown = agentMarkdown(body, { url, where: path });
    if (page.frontmatter.layout === 'home') markdown = `${homeTop(page.frontmatter.hero, url)}\n\n${markdown}`;
    else if (!/^# /m.test(markdown)) markdown = `# ${page.frontmatter.title}\n\n${markdown}`;
    pages.push({ path, markdown, description: page.frontmatter.description });
  }
  for (const [path, type] of examplePaths) {
    if (!english.includes(path)) continue;
    pages.push({ path, markdown: examplePage(type), description: params.get(path)?.description });
  }
  for (const p of pages) if (!p.description) throw new Error(`llms: ${p.path} has no description`);
  return pages;
}

/** The sidebar as sections of llms.txt: [{ title, entries: [{ text, path, children }] }]. */
function sections(sidebar) {
  const entry = (item) => ({
    text: item.text,
    path: item.link.replace(/^\//, '').replace(/\/$/, '/index').replace(/^$/, 'index') + '.md',
    children: (item.items ?? []).filter((i) => i.link).map(entry),
  });
  const groups = sidebar.filter((g) => g.items).map((g) => ({ title: g.text, entries: g.items.filter((i) => i.link).map(entry) }));
  const loose = sidebar.filter((g) => !g.items && g.link).map(entry);
  return [...groups, ...(loose.length ? [{ title: 'More', entries: loose }] : [])];
}

/** Writes llms.txt, llms-full.txt and the .md twins into the build. */
export async function writeLlms(siteConfig, { sidebar, description, title }) {
  const pages = await englishPages(siteConfig);
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const groups = [{ title: 'Home', entries: [{ text: title, path: 'index.md', children: [] }] }, ...sections(sidebar)];
  const listed = new Set();
  const line = (e, indent = '') => {
    const page = byPath.get(e.path);
    if (!page) throw new Error(`llms: the sidebar links to ${e.path}, which is not an English page`);
    listed.add(e.path);
    return [`${indent}- [${e.text}](${markdownUrl(e.path)}): ${page.description}`, ...e.children.map((c) => line(c, `${indent}  `)).flat()];
  };
  const body = groups.map((g) => [`## ${g.title}`, '', ...g.entries.flatMap((e) => line(e)), ''].join('\n'));
  const rest = pages.filter((p) => !listed.has(p.path)).sort((a, b) => a.path.localeCompare(b.path));
  if (rest.length) {
    body.push(['## Other pages', '', ...rest.map((p) => `- [${p.markdown.match(/^# (.*)$/m)?.[1] ?? p.path}](${markdownUrl(p.path)}): ${p.description}`), ''].join('\n'));
    rest.forEach((p) => listed.add(p.path));
  }
  const order = [...listed];

  const llms = [
    `# ${title}`,
    '',
    `> ${description}`,
    '',
    SUMMARY,
    '',
    `Every link below is the Markdown of one page of the documentation; the web page is the same URL without \`.md\`. ` +
      `[llms-full.txt](${SITE_URL}llms-full.txt) holds all of them in one file, in this order. English only.`,
    '',
    ...body,
  ].join('\n');

  const full = [
    `# ${title}: the full documentation`,
    '',
    `> ${description}`,
    '',
    SUMMARY,
    '',
    ...order.map((path) => `---\n\nSource: ${SITE_URL}${routeOf(path)}\n\n${byPath.get(path).markdown}`),
  ].join('\n');

  const out = siteConfig.outDir;
  writeFileSync(join(out, 'llms.txt'), llms);
  writeFileSync(join(out, 'llms-full.txt'), full);
  for (const p of pages) {
    const file = join(out, p.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, p.markdown);
  }
  const size = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} kB`;
  siteConfig.logger.info(`llms.txt (${size(llms)}), llms-full.txt (${size(full)}) and ${pages.length} .md pages written`);
}
