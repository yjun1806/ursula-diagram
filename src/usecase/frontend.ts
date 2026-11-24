import { withDescription } from '../front/accessibility.ts';
import { layout } from '../layout/index.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { RenderOptions } from '../registry.ts';
import { renderSvg } from '../render/svg.ts';
import type { NodeHook } from '../render/svg.ts';
import { renderTextLayout } from '../render/text.ts';
import type { GridSpec, Layout, LayoutNode } from '../types.ts';
import { emptySpec } from '../c4/grid-rows.ts';
import type { UsecaseModel } from './model.ts';
import { parseUsecase } from './parse.ts';
import { titledLines } from '../front/title.ts';

const num = (n: number): string => String(Math.round(n * 100) / 100);

/** Marks the engine has no shape for: the business slash, and the kind of an actor figure, which also stays in `data-` attributes. */
function nodeHook(model: UsecaseModel): NodeHook {
  return (node: LayoutNode) => {
    const m = model.meta.get(node.id);
    if (!m) return undefined;
    const attrs: Record<string, string> = { 'data-kind': m.kind };
    if (m.variant !== undefined && m.variant !== 'normal') attrs['data-variant'] = m.variant;
    if (m.business === true) attrs['data-business'] = 'true';
    if (m.stereotype !== undefined) attrs['data-stereotype'] = m.stereotype;
    let extra = '';
    if (m.business === true && m.kind === 'usecase' && node.shape === 'ellipse') {
      // The slash is a chord that cuts the lower-left of the ellipse, with both ends on the outline.
      const cx = node.x + node.w / 2;
      const cy = node.y + node.h / 2;
      const at = (t: number): string => `${num(cx + (node.w / 2) * Math.cos(t))} ${num(cy + (node.h / 2) * Math.sin(t))}`;
      extra = `<path class="ursula-actor" d="M${at(Math.PI * 0.93)}L${at(Math.PI * 0.62)}"/>`;
    } else if (m.business === true && m.kind === 'actor') {
      // The slash crosses the body of the figure.
      const cx = node.x + node.w / 2;
      extra = `<path class="ursula-actor" d="M${num(cx - 9)} ${num(node.y + 34)}L${num(cx + 9)} ${num(node.y + 18)}"/>`;
    }
    return { attrs, extra };
  };
}

function summary(model: UsecaseModel): string {
  const actors = [...model.meta.values()].filter((m) => m.kind === 'actor').length;
  return `Use case diagram: ${actors} actors, ${model.graph.nodes.length - actors} other elements, ${model.graph.edges.length} lines`;
}

const bendsIn = (l: Layout): number => l.edges.reduce((sum, e) => sum + Math.max(0, e.points.length - 2), 0);
const crossingsIn = (l: Layout): number =>
  l.diagnostics.reduce((sum, d) => sum + (d.kind !== 'crossing' ? 0 : Number(/\((\d+) times\)/.exec(d.message)?.[1] ?? 1)), 0);

function laidOut(model: UsecaseModel, opts: RenderOptions, text: boolean): Layout {
  const grid = text ? undefined : actorColumns(model);
  const draw = (columns: GridSpec | undefined): Layout =>
    layout(columns === undefined ? model.graph : { ...model.graph, placer: 'c4-grid', grid: columns }, text ? cellRuler() : pixelRuler(), {
      ...(opts.engine === undefined ? {} : { engine: opts.engine }),
      ...(opts.quality === undefined ? {} : { quality: opts.quality }),
      ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
      ...(text ? { fold: true } : {}),
      legend: false,
    });
  if (grid === undefined) return draw(undefined);
  const columns = draw(grid);
  const kind = (id: string): string | undefined => model.meta.get(id)?.kind;
  // Lines between two use cases can run a way round in the columns: the drawing of the layered engine is kept when it bends less and crosses no more.
  if (!model.graph.edges.some((e) => kind(e.from) !== 'actor' && kind(e.to) !== 'actor')) return columns;
  const free = draw(undefined);
  return bendsIn(free) < bendsIn(columns) && crossingsIn(free) <= crossingsIn(columns) ? free : columns;
}

registerFrontEnd({
  name: 'usecase',
  headers: ['usecase-beta'],
  svg(src, opts) {
    const model = parseUsecase(src);
    const title = opts.title ?? model.accTitle ?? opts.heading ?? summary(model);
    const svg = renderSvg(laidOut(model, opts, false), { ...opts, title, node: nodeHook(model), legend: false, ...(opts.heading === undefined ? {} : { drawTitle: opts.heading }) });
    return withDescription(svg, model.accDescr);
  },
  textLines(src, maxWidth, opts) {
    const model = parseUsecase(src);
    return titledLines(renderTextLayout(laidOut(model, { ...opts, ...(maxWidth === undefined ? {} : { maxWidth }) }, true)), opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    const model = parseUsecase(src);
    return { graph: model.graph, layout: laidOut(model, opts, mode === 'text') };
  },
});

/**
 * The cells of a drawing of actors and their use cases only (no boundary, no note, no line between two actors): the
 * actors in the first column, each in the middle of its use cases, and the use cases in the second, grouped by actor in
 * the order written; a use case no actor is joined to stands below them. Undefined for any other drawing, which keeps
 * the layered engine.
 */
/** The gap between two use cases of one actor, and between the use cases of two actors. */
const TOGETHER = 24;
const APART = 48;

function actorColumns(model: UsecaseModel): GridSpec | undefined {
  const g = model.graph;
  const kind = (id: string): string | undefined => model.meta.get(id)?.kind;
  if ((g.clusters ?? []).length > 0 || g.direction !== 'LR') return undefined;
  if (g.nodes.some((n) => kind(n.id) !== 'actor' && kind(n.id) !== 'usecase')) return undefined;
  if (g.edges.some((e) => kind(e.from) === 'actor' && kind(e.to) === 'actor')) return undefined;
  const cells: Record<string, { r: number; c: number }> = {};
  const shift: Record<string, number> = {};
  let row = 0;
  // The use cases of one actor stand close; a wider gap parts the actors.
  const rowGaps: Record<number, number> = {};
  for (const a of g.nodes.filter((n) => kind(n.id) === 'actor')) {
    const mine = g.edges.flatMap((e) => (e.from === a.id ? [e.to] : e.to === a.id ? [e.from] : [])).filter((u) => cells[u] === undefined);
    const first = row;
    if (first > 0) rowGaps[first] = APART;
    for (let k = first + 1; k < first + new Set(mine).size; k++) rowGaps[k] = TOGETHER;
    for (const u of [...new Set(mine)]) cells[u] = { r: row++, c: 1 };
    cells[a.id] = { r: first, c: 0 };
    shift[a.id] = Math.max(0, row - first - 1) / 2;
    if (row === first) row++;
  }
  for (const u of g.nodes.filter((n) => cells[n.id] === undefined)) cells[u.id] = { r: row++, c: 1 };
  return { ...emptySpec(g), cells, shift, rowGaps };
}
