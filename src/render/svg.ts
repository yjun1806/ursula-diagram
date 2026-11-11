import type { Layout, LayoutEdge, LayoutLane, LayoutNode, Point } from '../types.ts';

export interface NodeHookResult {
  attrs?: Record<string, string>;
  className?: string;
  extra?: string;
}

export type NodeHook = (node: LayoutNode) => NodeHookResult | void;

export interface SvgOptions {
  node?: NodeHook;
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
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";

/** Rules are written once with $name placeholders and expanded per colour scheme. */
const RULES: readonly string[] = [
  `.ursula{background:$bg;font-family:${FONT};font-size:12px}`,
  '.ursula-lane{fill:$lane;stroke:$border;stroke-width:1}',
  '.ursula-lane-label{fill:$muted;font-size:12px;font-weight:600}',
  '.ursula-node-box{fill:$surface;stroke:$border;stroke-width:1}',
  '.ursula-node-title{fill:$fg;font-size:13px;font-weight:600}',
  '.ursula-node-line{fill:$muted;font-size:12px}',
  '.ursula-edge{fill:none;stroke:$line;stroke-width:1.25}',
  '.ursula-edge--thick{stroke:$accent;stroke-width:1.5}',
  '.ursula-edge--dotted{stroke-dasharray:5 4}',
  '.ursula-arrow{fill:$line}',
  '.ursula-arrow--accent{fill:$accent}',
  '.ursula-edge-label-bg{fill:$surface}',
  '.ursula-edge-label{fill:$muted;font-size:12px}',
];

function expand(rule: string, mode: 0 | 1): string {
  return rule.replace(/\$([a-z]+)/g, (_, name: string) => `var(--ursula-${name},${TOKENS[name]?.[mode] ?? 'inherit'})`);
}

function styleSheet(): string {
  const light = RULES.map((r) => expand(r, 0)).join('\n');
  const dark = RULES.map((r) => expand(r, 1)).join('\n');
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

function num(v: number): string {
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

function laneSvg(lane: LayoutLane): string {
  if (lane.label === '') return '';
  const box = lane.labelBox;
  return (
    `<g class="ursula-lane-group" data-lane="${escapeXml(lane.id)}">` +
    `<rect class="ursula-lane" x="${num(lane.x)}" y="${num(lane.y)}" width="${num(lane.w)}" height="${num(lane.h)}" rx="12"/>` +
    `<text class="ursula-lane-label" x="${num(box.x)}" y="${num(box.y + box.h / 2)}" dominant-baseline="central">${escapeXml(lane.label)}</text>` +
    '</g>'
  );
}

function edgeSvg(edge: LayoutEdge): string {
  const marker = edge.style === 'thick' ? 'ursula-arrow-accent' : 'ursula-arrow';
  return (
    `<path class="ursula-edge ursula-edge--${edge.style}" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}" ` +
    `d="${pathData(edge.points)}" marker-end="url(#${marker})"/>`
  );
}

function labelSvg(edge: LayoutEdge): string {
  const l = edge.label;
  if (!l) return '';
  return (
    `<g class="ursula-edge-label-group" data-from="${escapeXml(edge.from)}" data-to="${escapeXml(edge.to)}">` +
    `<rect class="ursula-edge-label-bg" x="${num(l.x)}" y="${num(l.y)}" width="${num(l.w)}" height="${num(l.h)}" rx="3"/>` +
    `<text class="ursula-edge-label" x="${num(l.x + l.w / 2)}" y="${num(l.y + l.h / 2)}" text-anchor="middle" dominant-baseline="central">${escapeXml(l.text)}</text>` +
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
  `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">` +
  `<path class="${cls}" d="M0 1L10 5L0 9z"/></marker>`;

export function renderSvg(layout: Layout, opts: SvgOptions = {}): string {
  const w = num(layout.width);
  const h = num(layout.height);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="ursula" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`,
    `<style>${styleSheet()}</style>`,
    `<defs>${MARKER('ursula-arrow', 'ursula-arrow')}${MARKER('ursula-arrow-accent', 'ursula-arrow ursula-arrow--accent')}</defs>`,
    ...layout.lanes.map(laneSvg),
    ...layout.edges.map(edgeSvg),
    ...layout.nodes.map((n) => nodeSvg(n, opts.node)),
    ...layout.edges.map(labelSvg),
    '</svg>',
  ].join('');
}
