import type { Layout } from '../types.ts';
import { COLORS } from './colors.ts';
import { escapeXml, FONT_STACK } from './svg.ts';

export type Theme = 'auto' | 'light' | 'dark';

export interface HtmlOptions {
  /** Title of the page and of the file names that are saved; the page is called `Diagram` when absent. */
  title?: string;
  /** Light or dark of the page; `auto` follows the viewer's system setting. */
  theme?: Theme;
}

const PAPER: readonly [string, string] = ['#ffffff', '#16181d'];

/**
 * Declarations of one colour scheme: every colour of a drawing and the page background. The background of a drawing
 * is left out, so that the page shows through a drawing that paints none.
 */
function variables(mode: 0 | 1): string {
  const colours = Object.entries(COLORS)
    .filter(([name]) => name !== 'bg')
    .map(([name, pair]) => `--ursula-${name}:${pair[mode]}`);
  return [...colours, `--ursula-paper:${PAPER[mode]}`].join(';');
}

/**
 * Replaces every colour variable of an SVG text by the value `get` gives for its name. The function is written
 * as source text so that the page and the tests run the same code.
 */
export const BAKE_SOURCE = `function ursulaBake(text, get) {
  return text.replace(/var\\(--ursula-([a-z-]+)\\s*(?:,[^)]*)?\\)/g, function (_, name) { return get(name); });
}`;

/** Source text kept inside a `<script>` element: the sequences that would end or confuse it are escaped, and a backslash is doubled. */
export function encodeSource(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

export function decodeSource(text: string): string {
  return text.replace(/\\([\\/!])/g, '$1');
}

/** Name of a saved file: the title in lower case with hyphens, or `diagram`. */
export function fileBase(title: string | undefined): string {
  const slug = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9ㄱ-ㆎ가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'diagram' : slug;
}

const STYLE = `
*{box-sizing:border-box}
:root{${variables(0)};color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${variables(1)};color-scheme:dark}}
:root[data-theme="dark"]{${variables(1)};color-scheme:dark}
body{margin:0;padding:16px;background:var(--ursula-paper);color:var(--ursula-fg);font-family:${FONT_STACK}}
h1{margin:0 0 8px;font-size:16px;font-weight:600}
.ursula-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px}
.ursula-tools button{font:inherit;font-size:12px;padding:4px 10px;border:1px solid var(--ursula-border);border-radius:6px;background:var(--ursula-surface);color:var(--ursula-fg);cursor:pointer}
.ursula-tools button:hover{border-color:var(--ursula-accent)}
.ursula-tools button:focus-visible,[data-node]:focus-visible{outline:2px solid var(--ursula-accent);outline-offset:2px}
#ursula-note{font-size:12px;color:var(--ursula-muted)}
.ursula-viewport{overflow-x:auto}
.ursula-viewport svg{display:block;max-width:none}
[data-node]{cursor:pointer}
svg[data-focus] [data-node]:not([data-on]),svg[data-focus] [data-from]:not([data-on]){opacity:.25}
#ursula-raw{margin:12px 0 0;padding:8px;white-space:pre-wrap;border:1px solid var(--ursula-border);border-radius:6px;background:var(--ursula-surface);color:var(--ursula-fg);font-size:12px}
@media print{:root,:root:not([data-theme="light"]),:root[data-theme="dark"]{${variables(0)};color-scheme:light}.ursula-tools,#ursula-raw,#ursula-note{display:none}svg[data-focus] [data-node]:not([data-on]),svg[data-focus] [data-from]:not([data-on]){opacity:1}}
`.trim();

const SCRIPT = `
(function () {
  ${BAKE_SOURCE}
  var root = document.documentElement;
  var svg = document.querySelector('.ursula-viewport svg');
  var note = document.getElementById('ursula-note');
  var base = document.body.getAttribute('data-file') || 'diagram';
  var links = {};
  try { links = JSON.parse(document.getElementById('ursula-links').textContent) || {}; } catch (e) {}

  function theme() {
    var set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function remember(value) { try { localStorage.setItem('ursula-theme', value); } catch (e) {} }
  if (root.getAttribute('data-auto') === 'true') {
    try { var saved = localStorage.getItem('ursula-theme'); if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved); } catch (e) {}
  }
  document.getElementById('ursula-theme').addEventListener('click', function () {
    var next = theme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    remember(next);
  });

  function value(name) {
    var v = getComputedStyle(root).getPropertyValue('--ursula-' + name).trim();
    return v === '' ? 'transparent' : v;
  }
  function baked() {
    var copy = svg.cloneNode(true);
    copy.setAttribute('style', 'font-family:' + getComputedStyle(svg).fontFamily);
    copy.removeAttribute('data-focus');
    var all = copy.querySelectorAll('[data-on]');
    for (var i = 0; i < all.length; i++) all[i].removeAttribute('data-on');
    return ursulaBake(new XMLSerializer().serializeToString(copy), value);
  }
  function fail() {
    note.textContent = 'Could not save in this browser.';
    setTimeout(function () { note.textContent = ''; }, 3000);
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  document.getElementById('ursula-svg').addEventListener('click', function () {
    try { download(new Blob([baked()], { type: 'image/svg+xml;charset=utf-8' }), base + '.svg'); } catch (e) { fail(); }
  });
  document.getElementById('ursula-png').addEventListener('click', function () {
    try {
      var box = svg.viewBox.baseVal;
      var w = box.width, h = box.height;
      var url = URL.createObjectURL(new Blob([baked()], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); fail(); };
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w * 2);
          canvas.height = Math.round(h * 2);
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = value('paper');
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob(function (blob) {
            if (!blob) { fail(); return; }
            try { download(blob, base + '.png'); } catch (e) { fail(); }
          }, 'image/png');
        } catch (e) { fail(); }
      };
      img.src = url;
    } catch (e) { fail(); }
  });

  function source() {
    return decode(document.getElementById('ursula-source').textContent);
  }
  function decode(text) { return text.replace(/\\\\([\\\\/!])/g, '$1'); }
  document.getElementById('ursula-copy').addEventListener('click', function () {
    var text = source();
    function spread() {
      var pre = document.getElementById('ursula-raw');
      if (!pre) {
        pre = document.createElement('pre');
        pre.id = 'ursula-raw';
        document.body.appendChild(pre);
      }
      pre.textContent = text;
      var range = document.createRange();
      range.selectNodeContents(pre);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    try {
      if (!navigator.clipboard) { spread(); return; }
      navigator.clipboard.writeText(text).then(function () {
        note.textContent = 'Copied.';
        setTimeout(function () { note.textContent = ''; }, 3000);
      }, spread);
    } catch (e) { spread(); }
  });

  var nodes = svg.querySelectorAll('[data-node]');
  var current = null;
  function clear() {
    current = null;
    svg.removeAttribute('data-focus');
    var on = svg.querySelectorAll('[data-on]');
    for (var i = 0; i < on.length; i++) on[i].removeAttribute('data-on');
    for (var j = 0; j < nodes.length; j++) nodes[j].setAttribute('aria-pressed', 'false');
  }
  function select(id) {
    if (current === id) { clear(); return; }
    clear();
    current = id;
    svg.setAttribute('data-focus', id);
    var near = links[id] || [];
    for (var i = 0; i < nodes.length; i++) {
      var own = nodes[i].getAttribute('data-node');
      if (own === id || near.indexOf(own) >= 0) nodes[i].setAttribute('data-on', '');
      if (own === id) nodes[i].setAttribute('aria-pressed', 'true');
    }
    var edges = svg.querySelectorAll('[data-from]');
    for (var k = 0; k < edges.length; k++) {
      if (edges[k].getAttribute('data-from') === id || edges[k].getAttribute('data-to') === id) edges[k].setAttribute('data-on', '');
    }
  }
  svg.addEventListener('click', function (event) {
    var node = event.target.closest ? event.target.closest('[data-node]') : null;
    if (node) select(node.getAttribute('data-node'));
    else clear();
  });
  svg.addEventListener('keydown', function (event) {
    var node = event.target.closest ? event.target.closest('[data-node]') : null;
    if (node && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      select(node.getAttribute('data-node'));
    }
  });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') clear(); });
  for (var n = 0; n < nodes.length; n++) nodes[n].setAttribute('aria-pressed', 'false');
  var match = /^#focus=(.+)$/.exec(location.hash);
  if (match) { try { select(decodeURIComponent(match[1])); } catch (e) {} }
})();
`.trim();

/** Ids of the nodes each node shares an edge with. */
function neighbours(layout: Layout | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of layout?.edges ?? []) {
    if (e.from === e.to) continue;
    (out[e.from] ??= []).push(e.to);
    (out[e.to] ??= []).push(e.from);
  }
  for (const [id, list] of Object.entries(out)) out[id] = [...new Set(list)].sort();
  return out;
}

/**
 * One HTML file around an SVG drawing: the drawing in the page, a theme switch, saving as PNG or SVG, copying the
 * source, and following the edges of a node by pressing it. Nothing is loaded from outside; the same input gives the
 * same bytes. `#focus=<node id>` in the address opens the page with that node chosen.
 */
export function renderHtmlDocument(svg: string, layout: Layout | undefined, source: string, opts: HtmlOptions = {}): string {
  const title = opts.title ?? 'Diagram';
  const theme = opts.theme ?? 'auto';
  const pressable = svg.replace(/(<g class="[^"]*" )(data-node=)/g, '$1tabindex="0" role="button" $2');
  const links = JSON.stringify(neighbours(layout)).replace(/</g, '\\u003c');
  return [
    '<!doctype html>',
    `<html lang="en"${theme === 'auto' ? ' data-auto="true"' : ` data-theme="${theme}"`}>`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeXml(title)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    `<body data-file="${escapeXml(fileBase(opts.title))}">`,
    ...(opts.title === undefined ? [] : [`<h1>${escapeXml(opts.title)}</h1>`]),
    '<div class="ursula-tools">' +
      '<button type="button" id="ursula-theme">Theme</button>' +
      '<button type="button" id="ursula-png">PNG</button>' +
      '<button type="button" id="ursula-svg">SVG</button>' +
      '<button type="button" id="ursula-copy">Copy source</button>' +
      '<span id="ursula-note" role="status"></span></div>',
    `<div class="ursula-viewport">${pressable}</div>`,
    `<script type="text/plain" id="ursula-source">${encodeSource(source)}</script>`,
    `<script type="application/json" id="ursula-links">${links}</script>`,
    `<script>${SCRIPT}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
