import type { LegendOption } from '../layout/legend.ts';
import { withLegend } from '../layout/legend.ts';
import { pixelRuler } from '../metrics.ts';
import type { Layout, LayoutEdge, LayoutLane, LayoutNode, Legend, Point, Scene, SceneItem } from '../types.ts';

export interface NodeHookResult {
  attrs?: Record<string, string>;
  className?: string;
  extra?: string;
}

export type NodeHook = (node: LayoutNode) => NodeHookResult | void;

export interface SvgOptions {
  node?: NodeHook;
  /** Accessible name of the drawing; defaults to a short summary. */
  title?: string;
  /** Re-captions the legend of the layout, or removes it with `false`. */
  legend?: LegendOption;
}

const TITLE_LINE = 18;
const BODY_LINE = 16;
const CORNER_RADIUS = 8;

const TOKENS: Record<string, readonly [string, string]> = {
  bg: ['transparent', 'transparent'],
  fg: ['#1f2937', '#e5e7eb'],
  muted: ['#6b7280', '#9ca3af'],
  line: ['#9ca3af', '#6b7280'],
  accent: ['#2563eb', '#60a5fa'],
  surface: ['#ffffff', '#1f2937'],
  border: ['#d1d5db', '#4b5563'],
  lane: ['#f3f4f6', '#161b22'],
  hair: ['#e5e7eb', '#2d333b'],
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";

/** Rules are written once with $name placeholders and expanded per colour scheme. */
const RULES: readonly string[] = [
  `.ursula{background:$bg;font-family:${FONT};font-size:12px}`,
  '.ursula-lane{fill:$surface;stroke:$hair;stroke-width:1}',
  '.ursula-lane--tint{fill:$lane}',
  '.ursula-lane-label{fill:$muted;font-size:12px;font-weight:600}',
  '.ursula-node-box{fill:$surface;stroke:$border;stroke-width:1}',
  '.ursula-node-title{fill:$fg;font-size:13px;font-weight:600}',
  '.ursula-node-line{fill:$muted;font-size:12px;font-weight:400}',
  '.ursula-edge{fill:none;stroke:$line;stroke-width:1.2}',
  '.ursula-edge--thick{stroke:$accent}',
  '.ursula-edge--dotted{stroke-dasharray:5 4}',
  '.ursula-arrow{fill:$line}',
  '.ursula-arrow--accent{fill:$accent}',
  '.ursula-edge-label-bg{fill:$surface}',
  '.ursula-edge-label{fill:$muted;font-size:12px;font-weight:500}',
  '.ursula-edge-label--thick{fill:$accent}',
  '.ursula-legend-rule{stroke:$hair;stroke-width:1}',
  '.ursula-legend-text{fill:$muted;font-size:12px;font-weight:400}',
];

function expand(rule: string, mode: 0 | 1): string {
  return rule.replace(/\$([a-z]+)/g, (_, name: string) => `var(--ursula-${name},${TOKENS[name]?.[mode] ?? 'inherit'})`);
}

function styleSheet(rules: readonly string[] = RULES): string {
  const light = rules.map((r) => expand(r, 0)).join('\n');
  const dark = rules.map((r) => expand(r, 1)).join('\n');
  return `${light}\n@media (prefers-color-scheme: dark){\n${dark}\n}`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r === 0 ? 0 : r);
}

export function pathData(points: Point[], radius = CORNER_RADIUS): string {
  const first = points[0];
  if (!first) return '';
  let d = `M${num(first.x)} ${num(first.y)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (!prev || !cur) continue;
    if (!next) {
      d += ` L${num(cur.x)} ${num(cur.y)}`;
      continue;
    }
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    if (r <= 0) {
      d += ` L${num(cur.x)} ${num(cur.y)}`;
      continue;
    }
    const inX = (cur.x - prev.x) / lenIn;
    const inY = (cur.y - prev.y) / lenIn;
    const outX = (next.x - cur.x) / lenOut;
    const outY = (next.y - cur.y) / lenOut;
    const sweep = inX * outY - inY * outX > 0 ? 1 : 0;
    d += ` L${num(cur.x - inX * r)} ${num(cur.y - inY * r)}`;
    d += ` A${num(r)} ${num(r)} 0 0 ${sweep} ${num(cur.x + outX * r)} ${num(cur.y + outY * r)}`;
  }
  return d;
}

function laneSvg(lane: LayoutLane, tint: boolean, centred: boolean): string {
  if (lane.label === '') return '';
  const box = lane.labelBox;
  return (
    `<g class="ursula-lane-group" data-lane="${escapeXml(lane.id)}">` +
    `<rect class="ursula-lane${tint ? ' ursula-lane--tint' : ''}" x="${num(lane.x)}" y="${num(lane.y)}" width="${num(lane.w)}" height="${num(lane.h)}" rx="8"/>` +
    `<text class="ursula-lane-label" x="${num(centred ? box.x + box.w / 2 : box.x)}" y="${num(box.y + box.h / 2)}"${centred ? ' text-anchor="middle"' : ''} dominant-baseline="central">${escapeXml(lane.label)}</text>` +
    '</g>'
  );
}

function edgeSvg(edge: LayoutEdge): string {
  const marker = markerId(edge.style);
  return (
    `<path class="ursula-edge ursula-edge--${edge.style}" data-style="${edge.style}" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}" ` +
    `d="${pathData(edge.points)}" marker-end="url(#${marker})"/>`
  );
}

function labelSvg(edge: LayoutEdge): string {
  const l = edge.label;
  if (!l) return '';
  return (
    `<g class="ursula-edge-label-group" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}">` +
    `<rect class="ursula-edge-label-bg" x="${num(l.x)}" y="${num(l.y)}" width="${num(l.w)}" height="${num(l.h)}" rx="3"/>` +
    `<text class="ursula-edge-label${edge.style === 'thick' ? ' ursula-edge-label--thick' : ''}" x="${num(l.x + l.w / 2)}" y="${num(l.y + l.h / 2)}" text-anchor="middle" dominant-baseline="central">${escapeXml(l.text)}</text>` +
    '</g>'
  );
}

function nodeSvg(node: LayoutNode, hook: NodeHook | undefined): string {
  const extra = hook?.(node) ?? {};
  const attrs = Object.entries(extra.attrs ?? {})
    .map(([k, v]) => ` ${k.replace(/[^A-Za-z0-9:_-]/g, '')}="${escapeXml(v)}"`)
    .join('');
  const className = ['ursula-node', extra.className ?? ''].filter((c) => c !== '').join(' ');
  const block = TITLE_LINE + node.lines.length * BODY_LINE;
  let y = node.y + (node.h - block) / 2;
  const cx = node.x + node.w / 2;
  const texts = [
    `<text class="ursula-node-title" x="${num(cx)}" y="${num(y + TITLE_LINE / 2)}" text-anchor="middle" dominant-baseline="central">${escapeXml(node.title)}</text>`,
  ];
  y += TITLE_LINE;
  for (const line of node.lines) {
    texts.push(
      `<text class="ursula-node-line" x="${num(cx)}" y="${num(y + BODY_LINE / 2)}" text-anchor="middle" dominant-baseline="central">${escapeXml(line)}</text>`,
    );
    y += BODY_LINE;
  }
  return (
    `<g class="${escapeXml(className)}" data-node="${escapeXml(node.id)}"${attrs}>` +
    `<rect class="ursula-node-box" x="${num(node.x)}" y="${num(node.y)}" width="${num(node.w)}" height="${num(node.h)}" rx="6"/>` +
    texts.join('') +
    (extra.extra ?? '') +
    '</g>'
  );
}

const MARKER = (id: string, cls: string): string =>
  `<marker id="${id}" viewBox="0 0 8 6" refX="8" refY="3" markerWidth="8" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto">` +
  `<path class="${cls}" d="M0 0L8 3L0 6z"/></marker>`;

function markerId(style: string): string {
  return style === 'thick' ? 'ursula-arrow-accent' : 'ursula-arrow';
}

function legendSvg(legend: Legend, margin: number): string {
  const parts = [
    `<line class="ursula-legend-rule" x1="${num(margin)}" y1="${num(legend.y)}" x2="${num(legend.w - margin)}" y2="${num(legend.y)}"/>`,
  ];
  for (const item of legend.items) {
    parts.push(
      `<path class="ursula-edge ursula-edge--${item.style}" d="M${num(item.x)} ${num(item.y)} L${num(item.x + item.sampleW)} ${num(item.y)}" marker-end="url(#${markerId(item.style)})"/>` +
        `<text class="ursula-legend-text" x="${num(item.captionX)}" y="${num(item.y)}" dominant-baseline="central">${escapeXml(item.caption)}</text>`,
    );
  }
  return `<g class="ursula-legend">${parts.join('')}</g>`;
}

export function renderSvg(input: Layout, opts: SvgOptions = {}): string {
  const layout = opts.legend === undefined ? input : withLegend(input, pixelRuler(), opts.legend);
  const w = num(layout.width);
  const h = num(layout.height);
  const title = opts.title ?? `Flowchart: ${layout.nodes.length} nodes, ${layout.edges.length} edges`;
  const labelled = layout.lanes.filter((l) => l.label !== '');
  const margin = Math.min(...layout.lanes.map((l) => l.x), ...layout.nodes.map((n) => n.x), layout.width);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="ursula" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`,
    `<title>${escapeXml(title)}</title>`,
    `<style>${styleSheet()}</style>`,
    `<defs>${MARKER('ursula-arrow', 'ursula-arrow')}${MARKER('ursula-arrow-accent', 'ursula-arrow ursula-arrow--accent')}</defs>`,
    ...layout.lanes.map((lane) =>
      laneSvg(lane, labelled.length < 2 || lane === labelled[0], layout.laneAxis === 'along' && layout.direction === 'LR'),
    ),
    ...layout.edges.map(edgeSvg),
    ...layout.nodes.map((n) => nodeSvg(n, opts.node)),
    ...layout.edges.map(labelSvg),
    ...(layout.legend ? [legendSvg(layout.legend, margin)] : []),
    '</svg>',
  ].join('');
}

const SCENE_RULES: readonly string[] = [
  RULES[0] ?? '',
  '.ursula-box{fill:$surface;stroke:$border;stroke-width:1}',
  '.ursula-box--note{fill:$lane}',
  '.ursula-box--bar{fill:$lane;stroke:$line}',
  '.ursula-box--frame{fill:none}',
  '.ursula-tab{fill:$lane;stroke:$border;stroke-width:1}',
  '.ursula-line{fill:none;stroke:$line;stroke-width:1.2}',
  '.ursula-line--weak{stroke:$border;stroke-width:1}',
  '.ursula-line--dash{stroke-dasharray:5 4}',
  '.ursula-line--weak.ursula-line--dash{stroke-dasharray:4 4}',
  '.ursula-arrow{fill:$line}',
  '.ursula-arrow-open{fill:none;stroke:$line;stroke-width:1.2}',
  '.ursula-text{fill:$fg;font-size:12px;font-weight:400}',
  '.ursula-text--muted{fill:$muted}',
  '.ursula-text--title{font-size:13px;font-weight:600}',
  '.ursula-text--label{font-weight:500}',
  '.ursula-text--halo{stroke:$surface;stroke-width:4;stroke-linejoin:round;paint-order:stroke}',
];

function dataAttrs(data: Record<string, string> | undefined): string {
  return Object.entries(data ?? {})
    .map(([k, v]) => ` data-${k.replace(/[^A-Za-z0-9_-]/g, '')}="${escapeXml(v)}"`)
    .join('');
}

const SCENE_MARKERS: Record<string, string> = {
  filled: MARKER('ursula-arrow', 'ursula-arrow'),
  open:
    '<marker id="ursula-arrow-open" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">' +
    '<path class="ursula-arrow-open" d="M0 0L8 4L0 8"/></marker>',
  cross:
    '<marker id="ursula-arrow-cross" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">' +
    '<path class="ursula-arrow-open" d="M1 1L7 7M7 1L1 7"/></marker>',
};

function sceneItemSvg(item: SceneItem): string {
  if (item.kind === 'box') {
    const rx = item.style === 'box' ? 6 : item.style === 'frame' ? 4 : 2;
    const rect =
      `<rect class="ursula-box ursula-box--${item.style}"${item.dash ? ' stroke-dasharray="5 4"' : ''} x="${num(item.x)}" y="${num(item.y)}" ` +
      `width="${num(item.w)}" height="${num(item.h)}" rx="${rx}"${dataAttrs(item.data)}/>`;
    if (!item.tab) return rect;
    const t = item.tab;
    return (
      rect +
      `<rect class="ursula-tab" x="${num(item.x)}" y="${num(item.y)}" width="${num(t.w)}" height="${num(t.h)}" rx="3"/>` +
      `<text class="ursula-text ursula-text--label" x="${num(item.x + t.w / 2)}" y="${num(item.y + t.h / 2)}" text-anchor="middle" dominant-baseline="central">${escapeXml(t.text)}</text>`
    );
  }
  if (item.kind === 'text') {
    const cls = [
      'ursula-text',
      item.tone === 'muted' ? 'ursula-text--muted' : '',
      item.font === 'title' ? 'ursula-text--title' : item.font === 'label' ? 'ursula-text--label' : '',
      item.halo ? 'ursula-text--halo' : '',
    ]
      .filter((c) => c !== '')
      .join(' ');
    return (
      `<text class="${cls}" x="${num(item.x)}" y="${num(item.y)}" text-anchor="${item.anchor ?? 'start'}" dominant-baseline="central"` +
      `${dataAttrs(item.data)}>${escapeXml(item.text)}</text>`
    );
  }
  const arrow = item.arrow ?? 'none';
  const cls = ['ursula-line', item.weak ? 'ursula-line--weak' : '', item.dash ? 'ursula-line--dash' : ''].filter((c) => c !== '').join(' ');
  const marker = arrow === 'none' ? '' : ` marker-end="url(#${arrow === 'filled' ? 'ursula-arrow' : `ursula-arrow-${arrow}`})"`;
  return `<path class="${cls}" d="${pathData(item.points, 6)}"${marker}${dataAttrs(item.data)}/>`;
}

/** Draws a scene with the same style tokens, fonts and dark block as the flowchart renderer. */
export function renderSceneSvg(scene: Scene, opts: Pick<SvgOptions, 'title'> = {}): string {
  const w = num(scene.width);
  const h = num(scene.height);
  const used = new Set<string>();
  for (const it of scene.items) if (it.kind === 'line' && it.arrow && it.arrow !== 'none') used.add(it.arrow);
  const defs = ['filled', 'open', 'cross'].filter((k) => used.has(k)).map((k) => SCENE_MARKERS[k] ?? '');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="ursula" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`,
    `<title>${escapeXml(opts.title ?? scene.title)}</title>`,
    `<style>${styleSheet(SCENE_RULES)}</style>`,
    ...(defs.length > 0 ? [`<defs>${defs.join('')}</defs>`] : []),
    ...scene.items.map(sceneItemSvg),
    '</svg>',
  ].join('');
}
