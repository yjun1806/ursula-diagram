import { withDescription } from '../front/accessibility.ts';
import { layout } from '../layout/index.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { RenderOptions } from '../registry.ts';
import { renderSvg } from '../render/svg.ts';
import type { NodeHook } from '../render/svg.ts';
import { renderTextLayout, renderTextLayoutSpans } from '../render/text.ts';
import type { GridSpec, Layout, LayoutNode } from '../types.ts';
import { emptySpec } from '../c4/grid-rows.ts';
import { faults, worse } from './faults.ts';
import type { UsecaseModel } from './model.ts';
import { parseUsecase } from './parse.ts';
import { titledLines, titledSpans } from '../front/title.ts';

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
  const draw = (columns: GridSpec | undefined): Layout =>
    layout(columns === undefined ? model.graph : { ...model.graph, placer: 'c4-grid', grid: columns }, text ? cellRuler() : pixelRuler(), {
      ...(opts.engine === undefined ? {} : { engine: opts.engine }),
      ...(opts.quality === undefined ? {} : { quality: opts.quality }),
      ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
      ...(text ? { fold: true } : {}),
      legend: false,
    });
  const plain = text ? undefined : actorColumns(model, false);
  if (plain === undefined) return draw(undefined);
  const amid = orLayered(model, draw(plain), draw);
  const beside = actorColumns(model, true);
  if (beside === undefined) return amid;
  // Each actor beside one of its use cases and left by a side, unless that drawing has more of any fault than the one
  // with each actor in the middle of its use cases.
  const sided = draw(beside);
  const count = (l: Layout): number[] => faults(l, (name) => pixelRuler().textWidth(name, 'line'));
  return worse(count(sided), count(amid)) ? amid : sided;
}

/**
 * The drawing in columns, or the one of the layered engine. Lines between two use cases can run a way round in the
 * columns: the drawing of the layered engine is kept when it bends less, crosses no more and stands every actor to the
 * left of what it is joined to as well.
 */
function orLayered(model: UsecaseModel, columns: Layout, draw: (columns: GridSpec | undefined) => Layout): Layout {
  const kind = (id: string): string | undefined => model.meta.get(id)?.kind;
  if (!model.graph.edges.some((e) => kind(e.from) !== 'actor' && kind(e.to) !== 'actor')) return columns;
  const free = draw(undefined);
  const astray = (l: Layout): number => {
    const mid = new Map(l.nodes.map((n) => [n.id, n.x + n.w / 2]));
    return l.edges.filter((e) => {
      const [a, u] = kind(e.from) === 'actor' ? [e.from, e.to] : [e.to, e.from];
      return kind(a) === 'actor' && kind(u) !== 'actor' && (mid.get(a) ?? 0) >= (mid.get(u) ?? 0);
    }).length;
  };
  return bendsIn(free) < bendsIn(columns) && crossingsIn(free) <= crossingsIn(columns) && astray(free) <= astray(columns) ? free : columns;
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
  textSpans(src, maxWidth, opts) {
    const model = parseUsecase(src);
    return titledSpans(renderTextLayoutSpans(laidOut(model, { ...opts, ...(maxWidth === undefined ? {} : { maxWidth }) }, true)), opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    const model = parseUsecase(src);
    return { graph: model.graph, layout: laidOut(model, opts, mode === 'text') };
  },
});

/** The gap between two use cases of one actor, and between the use cases of two actors. */
const TOGETHER = 24;
const APART = 48;

/**
 * The cells of a drawing that reads from left to right with every actor outside the boundaries and no line between two
 * actors: the actors in the first column, each beside one of its use cases when `sided` and else in the middle of them,
 * and what they are joined to in the second, grouped by boundary and then by actor in the order written. What no actor
 * is joined to stands in the next column beside the first element a line joins it to, or below the rest. A boundary
 * covers the cells of what it holds. Undefined for any other drawing, and when a boundary would cover an element that
 * is not in it: the layered engine draws those.
 */
function actorColumns(model: UsecaseModel, sided: boolean): GridSpec | undefined {
  const g = model.graph;
  const kind = (id: string): string | undefined => model.meta.get(id)?.kind;
  const actor = (id: string): boolean => kind(id) === 'actor';
  if (g.direction !== 'LR') return undefined;
  if ((g.clusters ?? []).some((c) => c.parent !== undefined)) return undefined;
  if (g.nodes.some((n) => actor(n.id) && n.cluster !== undefined)) return undefined;
  if (g.edges.some((e) => actor(e.from) && actor(e.to))) return undefined;
  // A note stands beside what it is for, which the layered engine arranges.
  if (g.nodes.some((n) => kind(n.id) === 'note')) return undefined;
  const placed = g.nodes.filter((n) => n.attach === undefined);
  const actors = placed.filter((n) => actor(n.id));
  const others = placed.filter((n) => !actor(n.id));
  if (actors.length === 0) return undefined;

  // The second column: what the actors are joined to, by actor in the order written, then gathered by boundary.
  const owner = new Map<string, string>();
  for (const a of actors) for (const e of g.edges) {
    const u = e.from === a.id ? e.to : e.to === a.id ? e.from : undefined;
    if (u !== undefined && !actor(u) && !owner.has(u) && others.some((n) => n.id === u)) owner.set(u, a.id);
  }
  const clusterOf = new Map(g.nodes.map((n) => [n.id, n.cluster]));
  const joined = [...owner.keys()];
  const groups: Array<string | undefined> = [];
  for (const u of joined) if (!groups.includes(clusterOf.get(u))) groups.push(clusterOf.get(u));
  const second = groups.flatMap((c) => joined.filter((u) => clusterOf.get(u) === c));

  const cells: Record<string, { r: number; c: number }> = {};
  const rowGaps: Record<number, number> = {};
  second.forEach((u, r) => {
    cells[u] = { r, c: 1 };
    const before = second[r - 1];
    if (before !== undefined) rowGaps[r] = owner.get(before) === owner.get(u) && clusterOf.get(before) === clusterOf.get(u) ? TOGETHER : APART;
  });
  let rows = second.length;

  // The rest: beside the first placed element a line joins it to, one column on, when that cell is free; else below.
  const taken = (r: number, c: number): boolean => Object.values(cells).some((p) => p.r === r && p.c === c);
  let waiting = others.filter((n) => cells[n.id] === undefined);
  for (let moved = true; moved && waiting.length > 0; ) {
    moved = false;
    for (const n of waiting) {
      const beside = g.edges.flatMap((e) => (e.to === n.id ? [e.from] : e.from === n.id ? [e.to] : [])).map((id) => cells[id]).find((p) => p !== undefined && !taken(p.r, p.c + 1));
      if (beside === undefined) continue;
      cells[n.id] = { r: beside.r, c: beside.c + 1 };
      moved = true;
    }
    waiting = waiting.filter((n) => cells[n.id] === undefined);
  }
  for (const n of waiting) {
    rowGaps[rows] = APART;
    cells[n.id] = { r: rows++, c: 1 };
  }

  // The first column. The cell of an actor is the row of its first use case and the rest a shift, so the figure adds no
  // height to a row between.
  const ownRows = (a: string): number[] => second.flatMap((u, r) => (owner.get(u) === a ? [r] : []));
  const joinedTo = (a: string): string[] => [...new Set(g.edges.flatMap((e) => (e.from === a ? [e.to] : e.to === a ? [e.from] : [])))];
  const forks = (a: string): boolean => {
    const kinds = g.edges.flatMap((e) => (e.trunk !== undefined && e[e.trunk.end] === a ? [e.trunk.kind] : []));
    return kinds.some((k, i) => kinds.indexOf(k) !== i);
  };
  const column = { actors: actors.map((a) => ({ id: a.id, rows: ownRows(a.id), level: joinedTo(a.id).length === 1 ? second.indexOf(joinedTo(a.id)[0] as string) : -1, forks: forks(a.id) })), rows };
  const stood = sided ? besideUseCases(column) : amidUseCases(column);
  const shift: Record<string, number> = {};
  for (const [a, at] of stood.at) {
    rows = Math.max(rows, Math.floor(at) + 1);
    const first = second.findIndex((u) => owner.get(u) === a);
    const r = first === -1 || first > at ? Math.floor(at) : first;
    cells[a] = { r, c: 0 };
    if (at !== r) shift[a] = at - r;
  }
  for (const r of stood.apart) rowGaps[r] = APART;
  for (let r = Math.max(1, second.length); r < rows; r++) rowGaps[r] ??= APART;

  // A boundary covers the cells of what it holds; it may hold nothing else, and two may not share a cell.
  const rects = (g.clusters ?? []).flatMap((c) => {
    const inside = placed.filter((n) => n.cluster === c.id).map((n) => cells[n.id] as { r: number; c: number });
    return inside.length === 0 ? [] : [{ id: c.id, r0: Math.min(...inside.map((p) => p.r)), r1: Math.max(...inside.map((p) => p.r)), c0: Math.min(...inside.map((p) => p.c)), c1: Math.max(...inside.map((p) => p.c)) }];
  });
  if (rects.length !== (g.clusters ?? []).length) return undefined;
  const within = (q: (typeof rects)[number], p: { r: number; c: number }): boolean => p.r >= q.r0 && p.r <= q.r1 && p.c >= q.c0 && p.c <= q.c1;
  for (const q of rects) {
    if (placed.some((n) => n.cluster !== q.id && within(q, cells[n.id] as { r: number; c: number }))) return undefined;
    if (rects.some((o) => o !== q && o.r0 <= q.r1 && q.r0 <= o.r1 && o.c0 <= q.c1 && q.c0 <= o.c1)) return undefined;
  }
  return { ...emptySpec(g), cells, shift, rowGaps, ...(sided ? { figureSides: true } : {}), ...(rects.length === 0 ? {} : { rects: Object.fromEntries(rects.map(({ id, ...q }) => [id, q])) }) };
}

/** The actors of the first column: the rows of the use cases each one owns, the row of the only element it is joined to (or -1), whether its lines fork from a trunk; and the rows there are. */
interface ActorColumn {
  actors: ReadonlyArray<{ id: string; rows: readonly number[]; level: number; forks: boolean }>;
  rows: number;
}
/** The row each actor stands at (a half between two), and the rows that need the wider gap above them. */
interface Stood {
  at: Map<string, number>;
  apart: number[];
}

const middleOf = (rows: readonly number[]): number => (rows.length === 0 ? Infinity : ((rows[0] as number) + (rows[rows.length - 1] as number)) / 2);

/**
 * Each actor in the middle of its use cases, pushed down where two would stand closer than a row. An actor with no use
 * case of its own stands below every row, and so does one pushed past the last: each takes a whole row.
 */
function amidUseCases(column: ActorColumn): Stood {
  const at = new Map<string, number>();
  let [floor, rows] = [0, column.rows];
  for (const a of [...column.actors].sort((x, y) => middleOf(x.rows) - middleOf(y.rows))) {
    const wished = Math.max(floor, a.rows.length === 0 ? rows : middleOf(a.rows));
    const row = wished > rows - 1 ? Math.ceil(wished) : wished;
    at.set(a.id, row);
    rows = Math.max(rows, Math.floor(row) + 1);
    floor = row + 1;
  }
  return { at, apart: [] };
}

/**
 * Each actor beside its use cases: in their middle when its lines fork from one trunk, and else level with the one
 * nearest that middle, the upper of two, so that the line to it runs straight. Two actors keep a row between them. An
 * actor with no use case of its own stands level with the only one it is joined to, where no other actor is within a
 * row of it; the rest stand below every row, each on a row of its own.
 */
function besideUseCases(column: ActorColumn): Stood {
  const at = new Map<string, number>();
  const apart: number[] = [];
  let [floor, rows] = [0, column.rows];
  const stand = (id: string, row: number): void => {
    at.set(id, row);
    rows = Math.max(rows, Math.floor(row) + 1);
  };
  const wish = (a: ActorColumn['actors'][number]): number => (a.forks ? middleOf(a.rows) : a.rows.reduce((best, r) => (Math.abs(r - middleOf(a.rows)) < Math.abs(best - middleOf(a.rows)) ? r : best)));
  for (const a of column.actors.filter((x) => x.rows.length > 0).sort((x, y) => wish(x) - wish(y))) {
    // One pushed past the last row takes a whole row.
    const wished = Math.max(floor, wish(a));
    const row = wished > rows - 1 ? Math.ceil(wished) : wished;
    stand(a.id, row);
    floor = row + 1;
  }
  for (const a of column.actors) {
    if (at.has(a.id) || a.level === -1 || [...at.values()].some((row) => Math.abs(row - a.level) < 1)) continue;
    // The name under the upper of two figures a row apart needs the wider gap.
    for (const row of at.values()) if (Math.abs(row - a.level) === 1) apart.push(Math.max(row, a.level));
    stand(a.id, a.level);
  }
  for (const a of column.actors) if (!at.has(a.id)) stand(a.id, Math.max(Math.ceil(floor), rows));
  return { at, apart };
}
