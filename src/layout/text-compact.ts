import type { Layout, LayoutEdge, LayoutNode, Point } from '../types.ts';

/** Blank cells kept between two boxes side by side, and between any two other things side by side. */
const BOX_GAP = 3;
const LINE_GAP = 1;
/** The width a label on a level line is counted with when labels may be cut. */
const SHORT_LABEL = 10;

/** Marks drawn in two cells at an end of a line. */
const TWO_CELLS: ReadonlySet<string> = new Set(['one', 'zero-one', 'one-many', 'zero-many']);
const startCells = (e: LayoutEdge): number => (e.startEnd === undefined || e.startEnd === 'none' ? 0 : TWO_CELLS.has(e.startEnd) ? 2 : 1);
const endCells = (e: LayoutEdge): number => (e.end === 'none' ? 0 : e.end !== undefined && TWO_CELLS.has(e.end) ? 2 : 1);

/** A thing that takes cells of some rows: `left..right` are its first and last column, `group` what it moves with. */
interface Thing {
  group: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  box: boolean;
}

/**
 * Terminal drawings: the drawing pushed to the left as far as it goes. Boxes keep their size, upright lines stay
 * upright and keep their place on their boxes, level lines get shorter. Two things side by side keep the gap they
 * had when it was smaller than the least gap, the order from left to right stays, and a level line keeps the cells
 * its label and the marks at its ends need; with `shortLabels` a label counts as no wider than ten cells, and is cut
 * to its room afterwards. Rows are not changed. A drawing with named lanes is left as it is.
 */
export function compactColumns(l: Layout, shortLabels = false): Layout {
  if (l.clusters !== undefined || l.lanes.some((lane) => lane.label !== '') || l.nodes.length === 0) return l;
  const nodes = new Map(l.nodes.map((n, i) => [n.id, { n, i }] as const));
  // Elements of the groups: every box, then every point of every line, then every label that moves on its own.
  const parent: number[] = [];
  const make = (): number => parent.push(parent.length) - 1;
  const find = (a: number): number => {
    let r = a;
    while (parent[r] !== r) r = parent[r] as number;
    while (parent[a] !== r) [parent[a], a] = [r, parent[a] as number];
    return r;
  };
  const union = (a: number, b: number): void => {
    parent[find(a)] = find(b);
  };
  l.nodes.forEach(() => make());
  const cellOf = (e: LayoutEdge, i: number): [number, number] => {
    const p = e.points[i] as Point;
    let x = Math.floor(p.x + 1e-9);
    let y = Math.floor(p.y + 1e-9);
    const n = i === 0 ? nodes.get(e.from)?.n : i === e.points.length - 1 ? nodes.get(e.to)?.n : undefined;
    if (n) {
      if (Math.abs(p.x - n.x) < 1e-9) x -= 1;
      if (Math.abs(p.y - n.y) < 1e-9) y -= 1;
    }
    return [x, y];
  };
  const things: Thing[] = l.nodes.map((n, i) => ({ group: i, left: Math.round(n.x), right: Math.round(n.x) + Math.round(n.w) - 1, top: Math.round(n.y), bottom: Math.round(n.y) + Math.round(n.h) - 1, box: true }));
  /** `to` stands at least `least` further right than `from` does, each counted from where it stood. */
  const rules: Array<{ from: number; to: number; least: number }> = [];
  const pointId: number[][] = [];
  const labelId: Array<number | undefined> = [];
  interface Level {
    edge: number;
    a: number;
    b: number;
    left: number;
    right: number;
    row: number;
    need: number;
    low: number;
    high: number;
    labelled: boolean;
  }
  const levels: Level[] = [];
  const uprights: Array<{ group: number; x: number; top: number; bottom: number }> = [];
  l.edges.forEach((e, ei) => {
    const ids = e.points.map(() => make());
    pointId.push(ids);
    labelId.push(undefined);
    if (e.points.length === 0) return;
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (from) union(ids[0] as number, from.i);
    if (to) union(ids[ids.length - 1] as number, to.i);
    if (e.invisible) {
      for (let i = 0; i + 1 < ids.length; i++) union(ids[i] as number, ids[i + 1] as number);
      return;
    }
    const cells = e.points.map((_, i) => cellOf(e, i));
    const label = e.label;
    const lx = label === undefined ? 0 : Math.round(label.x);
    const lw = label === undefined ? 0 : Math.round(label.w);
    const counted = shortLabels ? Math.min(lw, SHORT_LABEL) : lw;
    const ly = label === undefined ? 0 : Math.round(label.y);
    let labelHome: number | undefined;
    for (let i = 0; i + 1 < cells.length; i++) {
      const [x1, y1] = cells[i] as [number, number];
      const [x2, y2] = cells[i + 1] as [number, number];
      const a = ids[i] as number;
      const b = ids[i + 1] as number;
      if (y1 !== y2 || x1 === x2) {
        // Upright, of one cell, or slanted: the two points move together.
        union(a, b);
        if (x1 === x2) {
          uprights.push({ group: a, x: x1, top: Math.min(y1, y2), bottom: Math.max(y1, y2) });
          if (label !== undefined && labelHome === undefined && ly >= Math.min(y1, y2) && ly <= Math.max(y1, y2)) labelHome = a;
        }
        continue;
      }
      const forward = x2 > x1;
      const tail = i === 0 ? startCells(e) : 0;
      const head = i + 2 === cells.length ? endCells(e) : 0;
      const [low, high] = forward ? [tail, head] : [head, tail];
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const labelled = label !== undefined && Math.round(label.h) === 1 && ly === y1 && lx + lw - 1 >= left && lx <= right;
      levels.push({ edge: ei, a: forward ? a : b, b: forward ? b : a, left, right, row: y1, need: (labelled ? counted + 2 : 1) + low + high, low, high, labelled });
      if (labelled) labelHome = -1;
    }
    if (label !== undefined) {
      const id = make();
      labelId[ei] = id;
      // A label beside an upright stretch moves with it; one on a level stretch stays between the ends of that stretch.
      if (labelHome !== undefined && labelHome >= 0) union(id, labelHome);
      else if (labelHome === undefined) union(id, ids[0] as number);
      things.push({ group: id, left: lx, right: lx + Math.max(1, labelHome === -1 ? counted : lw) - 1, top: ly, bottom: ly + Math.max(1, Math.round(label.h)) - 1, box: false });
    }
    for (const [t, anchor] of [[e.startLabel, ids[0]], [e.endLabel, ids[ids.length - 1]]] as const) {
      if (t === undefined || anchor === undefined) continue;
      things.push({ group: anchor, left: Math.round(t.x), right: Math.round(t.x) + Math.max(1, Math.round(t.w)) - 1, top: Math.round(t.y), bottom: Math.round(t.y) + Math.max(1, Math.round(t.h)) - 1, box: false });
    }
  });
  for (const u of uprights) things.push({ group: u.group, left: u.x, right: u.x, top: u.top, bottom: u.bottom, box: false });
  for (const s of levels) {
    things.push({ group: s.a, left: s.left, right: s.left, top: s.row, bottom: s.row, box: false });
    things.push({ group: s.b, left: s.right, right: s.right, top: s.row, bottom: s.row, box: false });
    const cells = s.right - s.left + 1;
    rules.push({ from: s.a, to: s.b, least: Math.min(cells, s.need) - cells });
    const id = labelId[s.edge];
    const label = l.edges[s.edge]?.label;
    if (s.labelled && id !== undefined && label !== undefined && !shortLabels) {
      const lx = Math.round(label.x);
      const lw = Math.round(label.w);
      rules.push({ from: s.a, to: id, least: Math.min(0, s.low + 1 - (lx - s.left)) });
      rules.push({ from: id, to: s.b, least: Math.min(0, s.high + 1 - (s.right - (lx + lw - 1))) });
    }
    // An upright line that crosses this stretch stays between its ends.
    for (const u of uprights) {
      if (u.top > s.row || u.bottom < s.row || u.x <= s.left || u.x >= s.right) continue;
      rules.push({ from: s.a, to: u.group, least: 1 - (u.x - s.left) });
      rules.push({ from: u.group, to: s.b, least: 1 - (s.right - u.x) });
    }
  }
  // Two things that share a row keep their order, and the gap they had up to the least gap.
  for (const a of things) {
    for (const b of things) {
      if (a === b || a.right >= b.left || a.bottom < b.top || b.bottom < a.top) continue;
      const gap = b.left - a.right - 1;
      rules.push({ from: a.group, to: b.group, least: Math.min(gap, a.box && b.box ? BOX_GAP : LINE_GAP) - gap });
    }
  }
  // The least move to the right of every group, counted from the place where nothing has a column left of the first.
  const floor = new Map<number, number>();
  for (const t of things) {
    const g = find(t.group);
    floor.set(g, Math.max(floor.get(g) ?? -Infinity, -t.left));
  }
  const move = new Map<number, number>([...floor].map(([g, v]) => [g, v] as const));
  const linked = rules.map((r) => ({ from: find(r.from), to: find(r.to), least: r.least })).filter((r) => r.from !== r.to);
  for (let pass = 0, changed = true; changed && pass <= move.size + 1; pass++) {
    changed = false;
    for (const r of linked) {
      const want = (move.get(r.from) ?? 0) + r.least;
      if (want > (move.get(r.to) ?? -Infinity) + 1e-9) {
        move.set(r.to, want);
        changed = true;
      }
    }
    // More passes than groups: the rules disagree, and the drawing stays as it is.
    if (changed && pass === move.size + 1) return l;
  }
  const by = (id: number): number => Math.min(0, move.get(find(id)) ?? 0);
  if (![...move.values()].some((v) => v < 0)) return l;
  const edges = l.edges.map((e, ei) => {
    const ids = pointId[ei] ?? [];
    const lid = labelId[ei];
    const first = ids[0];
    const last = ids[ids.length - 1];
    return {
      ...e,
      points: e.points.map((p, i) => ({ x: p.x + by(ids[i] as number), y: p.y })),
      ...(e.label && lid !== undefined ? { label: { ...e.label, x: e.label.x + by(lid) } } : {}),
      ...(e.startLabel && first !== undefined ? { startLabel: { ...e.startLabel, x: e.startLabel.x + by(first) } } : {}),
      ...(e.endLabel && last !== undefined ? { endLabel: { ...e.endLabel, x: e.endLabel.x + by(last) } } : {}),
    };
  });
  const moved = l.nodes.map((n, i): LayoutNode => ({ ...n, x: n.x + by(i) }));
  const width = Math.max(
    0,
    ...moved.map((n) => Math.ceil(n.x + n.w)),
    ...edges.flatMap((e) => [...(e.invisible ? [] : e.points.map((p) => Math.floor(p.x + 1e-9) + 1)), ...[e.label, e.startLabel, e.endLabel].map((t) => (t === undefined || e.invisible ? 0 : Math.ceil(t.x + t.w)))]),
    ...(l.legend ? [Math.ceil(l.legend.w)] : []),
  );
  if (width >= l.width) return l;
  return { ...l, width, nodes: moved, edges, lanes: l.lanes.map((lane) => ({ ...lane, w: Math.max(0, lane.w - (l.width - width)) })), ...(l.legend ? { legend: { ...l.legend, base: { ...l.legend.base, width: Math.min(l.legend.base.width, width) } } } : {}) };
}
