// The "At a glance" section of the Examples index page: every official example as a small card, grouped by type in
// the order of TYPES. A fence on the page asks for it:
//
//   ```examples-glance ko
//   ```
//
// and becomes static HTML at build time. The pictures stay separate SVG files that load lazily; a click on one opens
// the shared lightbox (../theme/zoom/ZoomLayer.vue), a click on its name goes to the example on its type page.
import { EXAMPLE_STRINGS, readRendered } from './pages.mjs';
import { TYPES } from './types.mjs';

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function card(type, it, page, t) {
  const alt = `${type.name}: ${it.name}`;
  const pic = it.error
    ? `<div class="gl-pic gl-error ursula-frame">${escape(t.failed)}</div>`
    : `<button type="button" class="ex-zoom gl-pic ursula-frame" aria-label="${escape(t.enlarge)}"><img src="${it.svg}" alt="${escape(alt)}" width="${it.width}" height="${it.height}" loading="lazy" decoding="async"></button>`;
  return `<div class="gl-card">${pic}<a class="gl-name" href="${page}#${encodeURIComponent(it.name)}">${escape(type.name)} · ${escape(it.name)}</a></div>`;
}

/** The HTML of every example card of a language ('en' or 'ko'); `base` is the site's base path. */
export function glanceHtml(lang, base) {
  const t = EXAMPLE_STRINGS[lang];
  const rendered = readRendered();
  const prefix = `${base.replace(/\/$/, '')}${lang === 'ko' ? '/ko' : ''}/examples/`;
  const groups = TYPES.map((type) => {
    const { items } = rendered.find((r) => r.id === type.id);
    const page = `${prefix}${type.id}`;
    return [
      `<section class="gl-group">`,
      `<h3 class="gl-head"><a href="${page}">${escape(type.name)}</a> <span class="gl-count">${items.length}</span></h3>`,
      `<div class="gl-grid">${items.map((it) => card(type, it, page, t)).join('')}</div>`,
      `</section>`,
    ].join('');
  });
  return `<div class="gl">${groups.join('\n')}</div>\n`;
}

/** A markdown-it plugin: an `examples-glance <lang>` fence becomes the cards of that language. */
export function glanceFences(md, { base }) {
  md.core.ruler.after('block', 'examples-glance', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'fence') continue;
      const [kind, lang = 'en'] = token.info.trim().split(/\s+/);
      if (kind !== 'examples-glance') continue;
      token.type = 'html_block';
      token.tag = '';
      token.content = glanceHtml(lang, base);
    }
  });
}
