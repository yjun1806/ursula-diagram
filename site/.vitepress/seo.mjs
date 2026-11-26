// What search engines and link previews read: the sitemap, a canonical URL, the en/ko alternates and the Open Graph
// and Twitter tags of every page. scripts/check-seo.mjs checks the built pages against this.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SITE_URL = 'https://yjun1806.github.io/ursula-diagram/';
export const OG_IMAGE = `${SITE_URL}og-image.png`;

const LOCALES = { en: 'en_US', ko: 'ko_KR' };

/** The path of a page under the site, as cleanUrls serves it: 'guide/why.md' -> 'guide/why', 'ko/index.md' -> 'ko/'. */
export const routeOf = (relativePath) => relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');

/** A redirect stub (a page whose head refreshes to another page): no canonical, no alternates, not in the sitemap. */
export const isRedirect = (frontmatter = {}) =>
  (frontmatter.head ?? []).some(([tag, attrs]) => tag === 'meta' && /refresh/i.test(attrs?.['http-equiv'] ?? ''));

/** The English and Korean source paths of a page, whichever language it is in. */
function twins(relativePath) {
  const en = relativePath.startsWith('ko/') ? relativePath.slice(3) : relativePath;
  return { en, ko: `ko/${en}` };
}

/** The head tags of one page, for VitePress's transformHead. */
export function seoHead({ pageData, siteConfig, title, description }) {
  const path = pageData.relativePath;
  if (path === '404.md' || isRedirect(pageData.frontmatter)) return [];
  const lang = path.startsWith('ko/') ? 'ko' : 'en';
  const url = SITE_URL + routeOf(path);
  const pages = new Set(siteConfig.pages.map((p) => siteConfig.rewrites.map[p] || p));
  const pair = twins(path);
  const alternates = pages.has(pair.en) && pages.has(pair.ko)
    ? [
        ['link', { rel: 'alternate', hreflang: 'en', href: SITE_URL + routeOf(pair.en) }],
        ['link', { rel: 'alternate', hreflang: 'ko', href: SITE_URL + routeOf(pair.ko) }],
        ['link', { rel: 'alternate', hreflang: 'x-default', href: SITE_URL + routeOf(pair.en) }],
      ]
    : [];
  const og = (property, content) => ['meta', { property, content }];
  const twitter = (name, content) => ['meta', { name, content }];
  // An English page names its Markdown twin, which llms/index.mjs writes beside it for AI agents.
  const markdown = lang === 'en' ? [['link', { rel: 'alternate', type: 'text/markdown', href: SITE_URL + path }]] : [];
  return [
    ['link', { rel: 'canonical', href: url }],
    ...alternates,
    ...markdown,
    og('og:type', path === 'index.md' || path === 'ko/index.md' ? 'website' : 'article'),
    og('og:site_name', siteConfig.site.title),
    og('og:title', title),
    og('og:description', description),
    og('og:url', url),
    og('og:locale', LOCALES[lang]),
    ...(alternates.length ? [og('og:locale:alternate', LOCALES[lang === 'en' ? 'ko' : 'en'])] : []),
    og('og:image', OG_IMAGE),
    og('og:image:width', '1200'),
    og('og:image:height', '630'),
    og('og:image:alt', 'ursula: Mermaid to SVG, terminal and HTML'),
    twitter('twitter:card', 'summary_large_image'),
    twitter('twitter:title', title),
    twitter('twitter:description', description),
    twitter('twitter:image', OG_IMAGE),
  ];
}

/** The title and description a dynamic route page sets through its params (the Examples type pages). */
export function pageDataFromParams(pageData) {
  const { params } = pageData;
  if (!params?.description) return undefined;
  return { title: params.title ?? pageData.title, description: params.description };
}

/** The sitemap config: every page but the redirect stubs, whose sources carry a refresh in their head. */
export function sitemap(srcDir) {
  const source = (url) => join(srcDir, url === '' || url.endsWith('/') ? `${url}index.md` : `${url}.md`);
  const redirect = (url) => existsSync(source(url)) && /http-equiv:\s*refresh/i.test(readFileSync(source(url), 'utf8'));
  return {
    hostname: SITE_URL,
    transformItems: (items) => items.filter((item) => !redirect(item.url)),
  };
}
