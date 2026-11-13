import { TITLE_CENTRE, TITLE_ROW, widthWithTitle } from '../front/title.ts';
import { SCENE_THEME_SPECS } from './scene-theme.ts';
import type { Arrow, SceneThemeSpec } from './scene-theme.ts';
import { escapeXml, num, pathData } from './svg.ts';
import { DEFAULT_THEME, SHADOW_FILTER, THEMES } from './theme.ts';
import type { Theme } from './theme.ts';
import { UrsulaError } from '../types.ts';
import type { Point, Scene, SceneBox, SceneCircle, SceneItem, SceneLine, ScenePath, SceneText, SceneTextSpan } from '../types.ts';

const FONT = "'IBM Plex Sans KR', 'Apple SD Gothic Neo', 'Noto Sans KR', -apple-system, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";

const SERIES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Rules of a themed drawing, written once with `$name` colour placeholders and `%name` metric placeholders.
 * A role `x` is the class `ursula-x`.
 */
function sceneRules(spec: SceneThemeSpec, peak: boolean): string[] {
  const arrow = spec.arrow;
  const head =
    arrow.kind === 'filled'
      ? [`.ursula-head{stroke-width:${arrow.stroke};stroke-linejoin:round}`, '.ursula-head--edge{fill:$edge;stroke:$edge}', '.ursula-head--accent{fill:$accent;stroke:$accent}', '.ursula-head--msg{fill:$edge-msg;stroke:$edge-msg}']
      : [
          '.ursula-head{fill:none;stroke-width:%edge-w;stroke-linecap:round;stroke-linejoin:round}',
          '.ursula-head--edge{stroke:$edge}',
          '.ursula-head--accent{stroke:$accent}',
          '.ursula-head--msg{stroke:$edge-msg}',
        ];
  // A message call whose head the theme fills while every other head is open.
  const msg = spec.msgArrow;
  const msgHead = msg?.kind === 'filled' ? [`.ursula-head.ursula-head--msg{fill:$edge-msg;stroke:$edge-msg;stroke-width:${msg.stroke};stroke-linejoin:round}`] : [];
  // A series mark is written `series-N--tint` or as the two roles `series-N`, `tint`; both reach the same rule.
  const seriesRules = SERIES.flatMap((n) => {
    const form = (modifier: string, body: string): string => `.ursula-series-${n}--${modifier},.ursula-series-${n}.ursula-${modifier}{${body}}`;
    return [
      `.ursula-series-${n}{fill:$s${n}}`,
      form('tint', `fill:$s${n}-tint;stroke:$s${n};stroke-width:%tint-stroke-w`),
      form('overlap', `fill:$s${n};fill-opacity:%overlap;stroke:$s${n};stroke-width:%overlap-w;stroke-linejoin:round`),
      form('line', `fill:none;stroke:$s${n};stroke-width:%data-w;stroke-linejoin:round;stroke-linecap:round`),
      form('dot', `fill:$s${n};stroke:$halo;stroke-width:2.5`),
    ];
  });
  return [
    `.ursula{font-family:${FONT}}`,
    '.ursula-bg{fill:$bg}',
    '.ursula-panel{fill:$panel}',
    `.ursula-title{font:600 15px ${FONT};fill:$ink}`,
    `.ursula-name{font:600 13px ${FONT};fill:$ink;text-anchor:middle}`,
    `.ursula-sub{font:400 12px ${FONT};fill:$ink-2;text-anchor:middle}`,
    `.ursula-body{font:400 12px ${FONT};fill:$ink}`,
    `.ursula-mono{font:400 12px ${FONT_MONO};fill:$ink}`,
    `.ursula-label{font:500 12px ${FONT};fill:$ink-2;text-anchor:middle}`,
    '.ursula-label--accent{fill:$accent}',
    `.ursula-zone-name{font:600 13px ${FONT};fill:$ink}`,
    `.ursula-zone-sub{font:500 12px ${FONT};fill:$ink-2}`,
    `.ursula-legend{font:500 12px ${FONT};fill:$ink-2}`,
    `.ursula-axis-name{font:500 12px ${FONT};fill:$ink-2}`,
    `.ursula-tick{font:400 11px ${FONT};fill:$ink-2;font-variant-numeric:tabular-nums}`,
    `.ursula-value{font:%value-weight 11px ${FONT};fill:$value;text-anchor:middle;font-variant-numeric:tabular-nums;paint-order:stroke;stroke:$halo;stroke-width:3px;stroke-linejoin:round}`,
    '.ursula-value--bare{stroke:none}',
    '.ursula-value--plain{stroke:none}',
    '.ursula-tick--halo{paint-order:stroke;stroke:$halo;stroke-width:3px;stroke-linejoin:round}',
    `.ursula-tag-text{font:500 11px ${FONT};fill:$ink-2;text-anchor:middle}`,
    '.ursula-faint{fill:$ink-3}',
    '.ursula-start{text-anchor:start}',
    '.ursula-middle{text-anchor:middle}',
    '.ursula-end{text-anchor:end}',
    '.ursula-on-start{fill:$start-ink}',
    '.ursula-on-decision{fill:$decision-ink}',
    '.ursula-box{fill:$box-fill;stroke:$box-stroke;stroke-width:%box-w;stroke-linejoin:round}',
    '.ursula-box--in-zone{fill:$box-in-zone}',
    '.ursula-box--start{fill:$start-fill;stroke:$start-stroke;stroke-width:%start-w}',
    '.ursula-box--decision{fill:$decision-fill;stroke:$decision-stroke;stroke-width:%decision-w}',
    '.ursula-box--pending{stroke:$zone-dash;stroke-width:%zone-dash-w;stroke-dasharray:%dash;stroke-linecap:round}',
    '.ursula-active{fill:$active-fill;stroke:$active-stroke;stroke-width:%active-w}',
    '.ursula-note{fill:$note-fill;stroke:$note-stroke;stroke-width:%note-w}',
    '.ursula-note--in-zone{fill:$note-in-zone}',
    '.ursula-token{fill:$box-fill;stroke:$box-stroke;stroke-width:%box-w}',
    '.ursula-tile{fill:$box-fill;stroke:$box-stroke;stroke-width:%box-w}',
    '.ursula-tile--in-zone{fill:$box-in-zone}',
    '.ursula-ellipse{fill:$box-fill;stroke:$box-stroke;stroke-width:%box-w}',
    '.ursula-start-dot{fill:$accent}',
    '.ursula-end-ring{fill:$bg;stroke:$ink;stroke-width:%edge-w}',
    '.ursula-end-dot{fill:$ink}',
    '.ursula-rule{fill:none;stroke:$rule;stroke-width:%rule-w}',
    // A rule of the page colour is a gap; on a white box in a filled zone it would vanish, so there it is a hairline.
    '.ursula-rule--in-zone{stroke:$rule-in-zone;stroke-width:1}',
    '.ursula-tag{fill:$tag-fill}',
    '.ursula-tag--in-zone{fill:$tag-fill-zone}',
    '.ursula-edge{fill:none;stroke:$edge;stroke-width:%edge-w;stroke-linecap:round;stroke-linejoin:round}',
    '.ursula-edge--accent{stroke:$accent}',
    '.ursula-edge--pending{stroke-dasharray:%dash}',
    '.ursula-edge--msg{stroke:$edge-msg}',
    '.ursula-edge--msg.ursula-edge--pending{stroke-dasharray:%dash-msg}',
    '.ursula-port{display:%port;fill:$halo;stroke:$edge;stroke-width:%edge-w}',
    '.ursula-port--accent{stroke:$accent}',
    '.ursula-port--msg{stroke:$edge-msg}',
    '.ursula-end-open{fill:$bg;stroke:$edge;stroke-width:%edge-w;stroke-linejoin:round}',
    '.ursula-end-fill{fill:$edge;stroke:$edge;stroke-width:%edge-w;stroke-linejoin:round}',
    '.ursula-end-open--accent{stroke:$accent}',
    '.ursula-end-fill--accent{fill:$accent;stroke:$accent}',
    '.ursula-lifeline{fill:none;stroke:$lifeline;stroke-width:%lifeline-w;stroke-linecap:round}',
    '.ursula-guide{fill:none;stroke:$guide;stroke-width:%guide-w;stroke-linecap:round;stroke-linejoin:round}',
    '.ursula-chip{fill:$chip-fill;stroke:$chip-stroke;stroke-width:%chip-w}',
    '.ursula-chip--accent{fill:$chip-accent-fill;stroke:$chip-accent-stroke}',
    '.ursula-zone{fill:$zone-fill;stroke:$zone-stroke;stroke-width:%zone-w}',
    '.ursula-zone--plain{fill:$zone-plain;stroke:$zone-plain-stroke;stroke-width:%zone-plain-w}',
    '.ursula-zone-face{fill:$zone-fill}',
    '.ursula-zone--dashed{fill:none;stroke:$zone-dash;stroke-width:%zone-dash-w;stroke-dasharray:%dash;stroke-linecap:round}',
    '.ursula-frame{fill:none;stroke:$frame;stroke-width:%frame-w}',
    '.ursula-frame-split{fill:none;stroke:$frame;stroke-width:%frame-w;stroke-dasharray:%dash;stroke-linecap:round}',
    '.ursula-axis{fill:none;stroke:$axis;stroke-width:1.25;stroke-linecap:round}',
    '.ursula-grid{fill:none;stroke:$grid;stroke-width:%grid-w;stroke-dasharray:%grid-dash;stroke-linecap:round}',
    '.ursula-mark{fill:$bar}',
    '.ursula-mark-line{fill:none;stroke:$data;stroke-width:%data-w;stroke-linejoin:round;stroke-linecap:round}',
    '.ursula-mark-dot{fill:$dot-fill;stroke:$dot-stroke;stroke-width:2.5}',
    '.ursula-dot{fill:$dot-neutral}',
    ...(peak
      ? [
          '.ursula-mark--peak{fill:$accent-mid}',
          '.ursula-mark--ink{fill:$ink}',
          '.ursula-mark-line--ink{fill:none;stroke:$ink;stroke-width:%data-w;stroke-linejoin:round;stroke-linecap:round}',
          '.ursula-mark-dot--ink{fill:$bg;stroke:$ink;stroke-width:1.5}',
        ]
      : []),
    ...seriesRules,
    ...head,
    ...msgHead,
  ];
}

/** Fills a rule's `%metric` and `$colour` placeholders for one colour scheme. */
function expand(rule: string, spec: SceneThemeSpec, mode: 0 | 1): string {
  return rule
    .replace(/%([a-z][a-z-]*)/g, (_, name: string) => spec.metrics[name] ?? 'inherit')
    .replace(/\$([a-z][a-z0-9-]*)/g, (_, name: string) => `var(--ursula-${name},${spec.colors[name]?.[mode] ?? 'inherit'})`);
}

function sceneStyleSheet(spec: SceneThemeSpec, peak: boolean): string {
  const rules = sceneRules(spec, peak);
  const light = rules.map((r) => expand(r, spec, 0)).join('\n');
  const dark = rules.map((r) => expand(r, spec, 1)).join('\n');
  return `${light}\n@media (prefers-color-scheme: dark){\n${dark}\n}`;
}

type Variant = 'edge' | 'accent' | 'msg';
type End = 'end' | 'start';

const markerId = (variant: Variant, end: End): string => `ursula-arrow-${variant}-${end}`;

/** Head a line of `variant` takes. */
const arrowOf = (spec: SceneThemeSpec, variant: Variant): Arrow => (variant === 'msg' ? (spec.msgArrow ?? spec.arrow) : spec.arrow);

/** The arrowhead: the line stops `arrow.length` short of the tip and the marker draws the head from there. */
function markerSvg(spec: SceneThemeSpec, variant: Variant, end: End): string {
  const a = arrowOf(spec, variant);
  const s = end === 'end' ? 1 : -1;
  const cy = a.width / 2;
  const x = (v: number): string => num(s * v);
  const path =
    a.kind === 'filled'
      ? `M0 0L${x(a.length)} ${num(cy)}L0 ${num(a.width)}Z`
      : `M0 ${num(cy)}H${x(a.length)}M${x(a.length - a.wing)} 0L${x(a.length)} ${num(cy)}L${x(a.length - a.wing)} ${num(a.width)}`;
  const viewBoxX = end === 'end' ? 0 : -a.length;
  return (
    `<marker id="${markerId(variant, end)}" viewBox="${num(viewBoxX)} 0 ${num(a.length)} ${num(a.width)}" refX="0" refY="${num(cy)}" ` +
    `markerWidth="${num(a.length)}" markerHeight="${num(a.width)}" markerUnits="userSpaceOnUse" orient="auto" overflow="visible">` +
    `<path class="ursula-head ursula-head--${variant}" d="${path}"/></marker>`
  );
}

/** Corner radius of a rectangle by role; the last matching entry wins, like the later rule of a style sheet. */
function rectRadius(roles: readonly string[], spec: SceneThemeSpec): number | undefined {
  const table: [string, number][] = [
    ['panel', spec.zoneRadius],
    ['box', spec.boxRadius],
    ['box--round', spec.roundRadius],
    ['active', 4],
    ['note', 8],
    ['token', 8],
    ['token--terminal', 16],
    ['tile', 8],
    ['band', 6],
    ['swatch', 3],
    ['tag', 10],
    ['chip', 12],
    ['zone', spec.zoneRadius],
    ['frame', 12],
  ];
  let found: number | undefined;
  for (const [role, radius] of table) if (roles.includes(role)) found = radius;
  return found;
}

/** Roles that cast the card shadow. */
const SHADOWED = ['box', 'tile', 'chip', 'panel', 'ellipse'];

const cleanRole = (role: string): string => role.replace(/[^A-Za-z0-9_-]/g, '');

function classOf(roles: readonly string[], extra: readonly string[] = []): string {
  return [...roles, ...extra].map((r) => `ursula-${cleanRole(r)}`).join(' ');
}

function dataAttrs(data: Record<string, string> | undefined): string {
  return Object.entries(data ?? {})
    .map(([k, v]) => ` data-${k.replace(/[^A-Za-z0-9_-]/g, '')}="${escapeXml(v)}"`)
    .join('');
}

function shadowAttr(roles: readonly string[], spec: SceneThemeSpec): string {
  return spec.shadow && roles.some((r) => SHADOWED.includes(r)) ? ' filter="url(#ursula-shadow)"' : '';
}

function boxSvg(item: SceneBox, spec: SceneThemeSpec): string {
  const roles = item.role ?? ['box'];
  const rx = item.radius ?? rectRadius(roles, spec);
  const round = rx === undefined ? '' : ` rx="${num(rx)}"`;
  return (
    `<rect class="${classOf(roles)}" x="${num(item.x)}" y="${num(item.y)}" width="${num(item.w)}" height="${num(item.h)}"${round}` +
    `${shadowAttr(roles, spec)}${dataAttrs(item.data)}/>`
  );
}

function spanSvg(span: SceneTextSpan): string {
  const weight = span.weight === undefined ? '' : ` font-weight="${span.weight}"`;
  const slant = span.italic === true ? ' font-style="italic"' : '';
  const cls = span.role === undefined || span.role.length === 0 ? '' : ` class="${classOf(span.role)}"`;
  return `<tspan${weight}${slant}${cls}>${escapeXml(span.text)}</tspan>`;
}

function textSvg(item: SceneText): string {
  const roles = item.role ?? ['body'];
  const anchor = item.anchor === undefined ? [] : [item.anchor];
  const turn = item.rotate === undefined ? '' : ` transform="rotate(${num(item.rotate)} ${num(item.x)} ${num(item.y)})"`;
  const body = item.spans === undefined ? escapeXml(item.text) : item.spans.map(spanSvg).join('');
  return (
    `<text class="${classOf(roles, anchor)}" x="${num(item.x)}" y="${num(item.y)}" dominant-baseline="central"` +
    `${turn}${dataAttrs(item.data)}>${body}</text>`
  );
}

/** Variant of the arrowhead a line takes, and which of its ends carry one. */
function arrowsOf(roles: readonly string[]): { variant: Variant; end: boolean; start: boolean } {
  const variant: Variant = roles.includes('edge--accent') ? 'accent' : roles.includes('edge--msg') ? 'msg' : 'edge';
  return { variant, end: roles.includes('edge--arrow'), start: roles.includes('edge--arrow-start') };
}

/** `points` with the first point moved `by` along the first piece, keeping at least 1 of it. */
function trimStart(points: readonly Point[], by: number): Point[] {
  const [a, b, ...rest] = points;
  if (a === undefined || b === undefined) return [...points];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const cut = len === 0 ? 0 : Math.min(by, Math.max(0, len - 1));
  return [{ x: a.x + ((b.x - a.x) / (len || 1)) * cut, y: a.y + ((b.y - a.y) / (len || 1)) * cut }, b, ...rest];
}

function lineSvg(item: SceneLine, spec: SceneThemeSpec): string {
  const roles = Array.isArray(item.role) ? item.role : ['edge'];
  const { variant, end, start } = arrowsOf(roles);
  const head = arrowOf(spec, variant).length;
  const points = start ? trimStart(item.points, head) : item.points;
  const d = pathData(points, item.radius ?? spec.bend, end ? head : 0);
  const markers = `${start ? ` marker-start="url(#${markerId(variant, 'start')})"` : ''}${end ? ` marker-end="url(#${markerId(variant, 'end')})"` : ''}`;
  return `<path class="${classOf(roles)}" d="${d}"${markers}${dataAttrs(item.data)}/>`;
}

function pathSvg(item: ScenePath, spec: SceneThemeSpec): string {
  return `<path class="${classOf(item.role)}" d="${item.d}"${shadowAttr(item.role, spec)}${dataAttrs(item.data)}/>`;
}

function circleSvg(item: SceneCircle, spec: SceneThemeSpec): string {
  // A theme may size the ring at the start of a message line itself.
  const r = item.role?.includes('port') === true && spec.metrics['port-r'] !== undefined ? spec.metrics['port-r'] : num(item.r);
  return `<circle class="${classOf(item.role)}" cx="${num(item.cx)}" cy="${num(item.cy)}" r="${r}"${dataAttrs(item.data)}/>`;
}

function itemSvg(item: SceneItem, spec: SceneThemeSpec): string {
  switch (item.kind) {
    case 'box':
      return boxSvg(item, spec);
    case 'text':
      return textSvg(item);
    case 'line':
      return lineSvg(item, spec);
    case 'path':
      return pathSvg(item, spec);
    case 'circle':
      return circleSvg(item, spec);
  }
}

/** Arrowhead markers the lines of a scene use. */
function markersUsed(scene: Scene): [Variant, End][] {
  const found = new Set<string>();
  for (const it of scene.items) {
    if (it.kind !== 'line' || !Array.isArray(it.role)) continue;
    const { variant, end, start } = arrowsOf(it.role);
    if (end) found.add(`${variant}:end`);
    if (start) found.add(`${variant}:start`);
  }
  return [...found].map((k) => k.split(':') as [Variant, End]);
}

/** The left edge of what a scene draws: the smallest x of its boxes, lines and left-anchored texts; 24 when it has none. */
function contentLeft(scene: Scene): number {
  const xs = scene.items.flatMap((it) => {
    switch (it.kind) {
      case 'box':
        return [it.x];
      case 'line':
        return it.points.map((p) => p.x);
      case 'text':
        return it.anchor === 'start' && it.rotate === undefined ? [it.x] : [];
      case 'circle':
        return [it.cx - it.r];
      case 'path':
        return [];
    }
  });
  return xs.length === 0 ? 24 : Math.max(0, Math.min(...xs));
}

/** Draws a scene in one of the three themes; the colours are variables with dark values for `prefers-color-scheme`. */
export function renderThemedScene(scene: Scene, opts: { title?: string; theme?: Theme; drawTitle?: string } = {}): string {
  const theme = opts.theme ?? scene.theme ?? DEFAULT_THEME;
  const spec = SCENE_THEME_SPECS[theme];
  if (spec === undefined) throw new UrsulaError(`Unknown theme "${String(theme)}"; use one of ${THEMES.join(', ')}.`, 'theme');
  const heading = opts.drawTitle === undefined || opts.drawTitle === '' ? undefined : opts.drawTitle;
  const left = heading === undefined ? 0 : contentLeft(scene);
  const rowH = heading === undefined ? 0 : TITLE_ROW;
  const w = num(heading === undefined ? scene.width : widthWithTitle(scene.width, left, heading));
  const h = num(scene.height + rowH);
  const defs = [...markersUsed(scene).map(([variant, end]) => markerSvg(spec, variant, end)), ...(spec.shadow ? [SHADOW_FILTER] : [])];
  const items = scene.items.map((it) => itemSvg(it, spec));
  // The rules of a neutral chart with an emphasised bar are written only into a drawing that uses them.
  const peak = spec.peakBar && items.some((it) => /ursula-mark(--peak|--ink|-line--ink|-dot--ink)/.test(it));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="ursula" data-theme="${theme}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`,
    `<title>${escapeXml(opts.title ?? scene.title)}</title>`,
    `<style>${sceneStyleSheet(spec, peak)}</style>`,
    ...(defs.length > 0 ? [`<defs>${defs.join('')}</defs>`] : []),
    `<rect class="ursula-bg" x="0" y="0" width="${w}" height="${h}"/>`,
    ...(heading === undefined ? [] : [textSvg({ kind: 'text', x: left, y: TITLE_CENTRE, text: heading, anchor: 'start', role: ['title', 'diagram-title'] }), `<g transform="translate(0 ${rowH})">`]),
    ...items,
    ...(heading === undefined ? [] : ['</g>']),
    '</svg>',
  ].join('');
}
