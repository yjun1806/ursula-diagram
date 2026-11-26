// Checks what search engines and link previews read on the built site: every page has its own description, a canonical
// URL, Open Graph and Twitter tags and the right <html lang>; an English page and its Korean twin name each other with
// hreflang; and the sitemap lists every page but the redirect stubs. Run after `npm run build`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OG_IMAGE, SITE_URL } from '../.vitepress/seo.mjs';
import { GOOGLE_SITE_VERIFICATION, NAVER_SITE_VERIFICATION } from '../.vitepress/verification.mjs';

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

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** The <meta> and <link> tags of a page's head, each as an object of its attributes. */
function headTags(html) {
  const head = html.slice(0, html.indexOf('</head>'));
  return [...head.matchAll(/<(meta|link)\b([^>]*)>/g)].map(([, tag, attrs]) => ({
    tag,
    ...Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k, unescape(v)])),
  }));
}

// A file copied from public/ as it is (a search console verification file) is not a page.
const isStatic = (file) => existsSync(join(site, 'public', file));
const htmlFiles = (rel = '') =>
  readdirSync(join(built, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? rel === '' && e.name === 'assets' ? [] : htmlFiles(join(rel, e.name))
      : e.name.endsWith('.html') && !(rel === '' && e.name === '404.html') ? [join(rel, e.name)] : [],
  );

/** The URL cleanUrls serves a built file at: 'guide/why.html' -> SITE_URL + 'guide/why', 'ko/index.html' -> '.../ko/'. */
const urlOf = (file) => SITE_URL + file.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');

const pages = htmlFiles().filter((file) => !isStatic(file)).map((file) => {
  const html = readFileSync(join(built, file), 'utf8');
  const tags = headTags(html);
  const meta = (key) => tags.find((t) => t.tag === 'meta' && (t.name === key || t.property === key))?.content;
  return {
    file,
    url: urlOf(file),
    ko: file.startsWith('ko/'),
    lang: /<html lang="([^"]*)"/.exec(html)?.[1],
    title: unescape(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''),
    redirect: tags.some((t) => t.tag === 'meta' && /refresh/i.test(t['http-equiv'] ?? '')),
    tags,
    meta,
    canonical: tags.filter((t) => t.tag === 'link' && t.rel === 'canonical').map((t) => t.href),
    alternates: Object.fromEntries(tags.filter((t) => t.tag === 'link' && t.rel === 'alternate' && t.hreflang).map((t) => [t.hreflang, t.href])),
  };
});
const indexed = pages.filter((p) => !p.redirect);
const byFile = new Map(pages.map((p) => [p.file, p]));

// Titles, languages and descriptions.
const descriptions = new Map();
for (const p of indexed) {
  if (!p.title || /ursula-diagram \| ursula-diagram/.test(p.title)) fail(`${p.file}: title "${p.title}"`);
  const want = p.ko ? 'ko-KR' : 'en-US';
  if (p.lang !== want) fail(`${p.file}: <html lang="${p.lang}">, not ${want}`);
  const d = p.meta('description')?.trim() ?? '';
  if (!d) fail(`${p.file}: no meta description`);
  else if (d.length > 160) fail(`${p.file}: description of ${d.length} characters, more than 160`);
  descriptions.set(d, [...(descriptions.get(d) ?? []), p.file]);
}
for (const [d, files] of descriptions) if (d && files.length > 1) fail(`${files.length} pages share the description "${d}": ${files.join(', ')}`);
console.log(`ok   titles, <html lang> and descriptions: ${descriptions.size} distinct descriptions on ${indexed.length} pages`);

// Canonical, Open Graph and Twitter.
const ogImageFile = join(built, OG_IMAGE.slice(SITE_URL.length));
if (!existsSync(ogImageFile)) fail(`${OG_IMAGE} is not in the build`);
let tagged = 0;
for (const p of indexed) {
  const problems = [];
  if (p.canonical.length !== 1 || p.canonical[0] !== p.url) problems.push(`canonical ${JSON.stringify(p.canonical)}, not ${p.url}`);
  for (const key of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:image', 'twitter:card', 'twitter:image']) {
    if (!p.meta(key)?.trim()) problems.push(`no ${key}`);
  }
  if (p.meta('og:url') !== p.url) problems.push(`og:url ${p.meta('og:url')}`);
  if (p.meta('og:title') !== p.title) problems.push(`og:title "${p.meta('og:title')}" is not the title`);
  if (p.meta('og:description') !== p.meta('description')) problems.push('og:description is not the description');
  if (p.meta('og:image') !== OG_IMAGE) problems.push(`og:image ${p.meta('og:image')}`);
  if (p.meta('twitter:card') !== 'summary_large_image') problems.push(`twitter:card ${p.meta('twitter:card')}`);
  if (problems.length) fail(`${p.file}: ${problems.join('; ')}`);
  else tagged++;
}
console.log(`ok   canonical, Open Graph and Twitter tags: ${tagged} of ${indexed.length} pages`);

// hreflang: an English page and its Korean twin each name both, and x-default is the English one.
let pairs = 0;
for (const en of indexed.filter((p) => !p.ko)) {
  const ko = byFile.get(`ko/${en.file}`);
  if (!ko || ko.redirect) {
    if (Object.keys(en.alternates).length) fail(`${en.file} has hreflang links but no Korean twin`);
    continue;
  }
  const want = { en: en.url, ko: ko.url, 'x-default': en.url };
  const wrong = [en, ko].filter((p) => JSON.stringify(p.alternates, Object.keys(want)) !== JSON.stringify(want) || Object.keys(p.alternates).length !== 3);
  for (const p of wrong) fail(`${p.file}: hreflang ${JSON.stringify(p.alternates)}, not ${JSON.stringify(want)}`);
  if (!wrong.length) pairs++;
}
const orphanKo = indexed.filter((p) => p.ko && !byFile.has(p.file.slice(3)));
for (const p of orphanKo) if (Object.keys(p.alternates).length) fail(`${p.file} has hreflang links but no English twin`);
console.log(`ok   hreflang: ${pairs} English and Korean pairs name each other`);

// The sitemap: every page but the redirect stubs, each once.
const sitemapFile = join(built, 'sitemap.xml');
if (!existsSync(sitemapFile)) fail('sitemap.xml is missing');
else {
  const listed = [...readFileSync(sitemapFile, 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => unescape(m[1]));
  const want = new Set(indexed.map((p) => p.url));
  const missing = [...want].filter((u) => !listed.includes(u));
  const extra = listed.filter((u) => !want.has(u));
  const twice = listed.filter((u, i) => listed.indexOf(u) !== i);
  if (missing.length) fail(`sitemap.xml lacks ${missing.length} pages: ${missing.slice(0, 5).join(', ')}`);
  if (extra.length) fail(`sitemap.xml lists ${extra.length} URLs that are not indexed pages: ${extra.slice(0, 5).join(', ')}`);
  if (twice.length) fail(`sitemap.xml lists ${twice.join(', ')} more than once`);
  if (!missing.length && !extra.length && !twice.length) {
    console.log(`ok   sitemap.xml lists all ${listed.length} pages; ${pages.length - indexed.length} redirect stubs left out`);
  }
}

// Search console verification: a tag on the home page for each token set in .vitepress/verification.mjs.
const home = byFile.get('index.html');
for (const [name, token] of [['google-site-verification', GOOGLE_SITE_VERIFICATION], ['naver-site-verification', NAVER_SITE_VERIFICATION]]) {
  const got = home.meta(name);
  if (token.trim() && got !== token.trim()) fail(`index.html: ${name} is ${got}, not the token in verification.mjs`);
  if (!token.trim() && got !== undefined) fail(`index.html carries ${name} though verification.mjs leaves it empty`);
}
console.log(`ok   search console tags: ${[GOOGLE_SITE_VERIFICATION, NAVER_SITE_VERIFICATION].filter((t) => t.trim()).length} of 2 tokens set`);

if (failed) process.exit(1);
console.log('all search checks passed');
