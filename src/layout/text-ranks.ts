import type { Ruler } from '../metrics.ts';
import type { EdgeEnd, Graph, GraphEdge, Layout, LayoutEdge, LayoutNode, NodeShape, Point } from '../types.ts';

/** Shapes a terminal draws as a plain box of its text. */
const PLAIN: ReadonlySet<NodeShape> = new Set<NodeShape>(['rect', 'round', 'stadium', 'circle', 'diamond', 'hexagon', 'cylinder', 'parallelogram', 'subroutine', 'asym', 'lean-l', 'trap-b', 'trap-t', 'dbl-circle']);

/** Ends of a line that take one cell. */
const ONE_CELL: ReadonlySet<EdgeEnd> = new Set<EdgeEnd>(['arrow', 'circle', 'cross', 'none']);

const MAX_NODES = 40;
const MAX_EDGES = 60;

/** Cells between two boxes side by side in a rank, and between a box and a line that passes it. */
const BOX_GAP = 3;
const LINE_GAP = 1;

interface Link {
  edge: number;
  /** The end in the earlier rank and the end in the later one. */
  a: number;
  b: number;
  /** The line runs from `b` to `a`: it closes a cycle. */
  flipped: boolean;
  len: number;
}

/** Ranks of the nodes: one more than the latest rank that leads to a node, cycles cut where a walk in written order closes them. */
function rankNodes(graph: Graph): { rank: number[]; links: Link[] } | undefined {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i] as const));
  const n = graph.nodes.length;
  const raw: Link[] = [];
  const pairs = new Set<string>();
  for (const [edge, e] of graph.edges.entries()) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) return undefined;
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (pairs.has(pair)) return undefined;
    pairs.add(pair);
    raw.push({ edge, a, b, flipped: false, len: Math.max(1, e.minLength ?? 1) });
  }
  const out = Array.from({ length: n }, (): Link[] => []);
  for (const l of raw) out[l.a]?.push(l);
  const state = new Uint8Array(n);
  const back = new Set<number>();
  const visit = (v: number): void => {
    state[v] = 1;
    for (const l of out[v] ?? []) {
      if (state[l.b] === 1) back.add(l.edge);
      else if (state[l.b] === 0) visit(l.b);
    }
    state[v] = 2;
  };
  for (let v = 0; v < n; v++) if (state[v] === 0) visit(v);
  const links = raw.map((l) => (back.has(l.edge) ? { ...l, a: l.b, b: l.a, flipped: true } : l));
  const into = Array.from({ length: n }, (): Link[] => []);
  const from = Array.from({ length: n }, (): Link[] => []);
  const waiting = new Array<number>(n).fill(0);
  for (const l of links) {
    into[l.b]?.push(l);
    from[l.a]?.push(l);
    waiting[l.b] = (waiting[l.b] ?? 0) + 1;
  }
  const sorted = Array.from({ length: n }, (_, v) => v).filter((v) => waiting[v] === 0);
  for (let k = 0; k < sorted.length; k++) {
    for (const l of from[sorted[k] as number] ?? []) {
      waiting[l.b] = (waiting[l.b] ?? 0) - 1;
      if (waiting[l.b] === 0) sorted.push(l.b);
    }
  }
  if (sorted.length < n) return undefined;
  const rank = new Array<number>(n).fill(0);
  for (const v of sorted) rank[v] = Math.max(0, ...(into[v] ?? []).map((l) => (rank[l.a] ?? 0) + l.len));
  // A node nothing leads to stands right before the first node it leads to.
  for (const v of [...sorted].reverse()) {
    if ((into[v] ?? []).length === 0 && (from[v] ?? []).length > 0) rank[v] = Math.min(...(from[v] ?? []).map((l) => (rank[l.b] ?? 0) - l.len));
  }
  return { rank, links };
}

interface Item {
  rank: number;
  /** Index of the node, or -1 for the place where a line passes a rank. */
  node: number;
  /** Extent across the reading direction. */
  size: number;
}

interface Segment {
  link: Link;
  /** Items in the rank before the band and in the rank after it. */
  a: number;
  z: number;
  /** The first and the last segment of the line. */
  first: boolean;
  last: boolean;
}

interface Net {
  segments: number[];
  /** Where its lines leave the rank before the band and where they reach the rank after it, across the reading direction. */
  stems: number[];
  drops: number[];
  shared?: 'start' | 'end';
}

interface Mark {
  segment: number;
  where: 'stem' | 'drop';
  text: string;
  width: number;
  /** A top-down drawing writes it left of its line instead of right of it. */
  left: boolean;
  /** Cells between the box and the label along a level line: one more where a mark stands at the box, so that a cell of line shows behind it. */
  after: number;
}

interface Band {
  nets: Net[];
  track: Map<Net, number>;
  tracks: number;
  /** Cells along the reading direction before the tracks and after them. */
  stem: number;
  drop: number;
}

const sum = (values: number[]): number => values.reduce((s, v) => s + v, 0);

/** Positions as near to `wanted` as the order and the least distances `apart` from one item to the next allow. */
function settle(wanted: number[], weight: number[], apart: number[]): number[] {
  const offset = wanted.reduce<number[]>((out, _d, i) => [...out, i === 0 ? 0 : (out[i - 1] as number) + (apart[i - 1] as number)], []);
  // Neighbours that want to stand closer than they may are pooled and share the mean of what they want.
  interface Pool {
    total: number;
    weight: number;
    count: number;
  }
  const pools = wanted.reduce<Pool[]>((done, d, i) => {
    let last: Pool = { total: (d - (offset[i] as number)) * (weight[i] as number), weight: weight[i] as number, count: 1 };
    let rest = done;
    for (let before = rest[rest.length - 1]; before !== undefined && before.total / before.weight > last.total / last.weight; before = rest[rest.length - 1]) {
      last = { total: before.total + last.total, weight: before.weight + last.weight, count: before.count + last.count };
      rest = rest.slice(0, -1);
    }
    return [...rest, last];
  }, []);
  return pools.flatMap((b) => new Array<number>(b.count).fill(Math.floor(b.total / b.weight + 0.5))).map((y, i) => y + (offset[i] as number));
}

/** A track for every net of a band that turns, or undefined when they cannot be told apart: a line that leaves a rank where another reaches the next one turns before that one does. */
function assignTracks(nets: Net[]): Map<Net, number> | undefined {
  const turning = nets.filter((n) => n.stems.length > 1 || n.drops.length > 1 || n.stems[0] !== n.drops[0]);
  const above = new Map<Net, Net[]>(turning.map((n) => [n, turning.filter((o) => o !== n && o.stems.some((x) => n.drops.includes(x)))] as const));
  const span = (n: Net): [number, number] => [Math.min(...n.stems, ...n.drops), Math.max(...n.stems, ...n.drops)];
  const track = new Map<Net, number>();
  let waiting = [...turning].sort((p, q) => span(p)[0] - span(q)[0] || span(q)[1] - span(p)[1]);
  while (waiting.length > 0) {
    const next = waiting.find((n) => (above.get(n) ?? []).every((o) => track.has(o)));
    if (next === undefined) return undefined;
    const [lo, hi] = span(next);
    let at = Math.max(-1, ...(above.get(next) ?? []).map((o) => track.get(o) ?? 0)) + 1;
    const taken = (t: number): boolean => [...track].some(([o, ot]) => ot === t && span(o)[0] <= hi + 1 && span(o)[1] >= lo - 1);
    while (taken(at)) at++;
    track.set(next, at);
    waiting = waiting.filter((n) => n !== next);
  }
  return track;
}

/**
 * A terminal drawing with the ranks of the graph one after another along the reading direction: the boxes a box leads
 * to stand side by side in the next rank with the box in the middle before them, the lines that leave a box leave it
 * as one line that splits, and the lines that reach a box join before it. Undefined for a graph it does not draw: one
 * with bands, clusters, boxes of another kind, two lines between the same boxes, or more line ends on a side than it holds.
 */
export function layoutRanks(graph: Graph, ruler: Ruler, limit?: number): Layout | undefined {
  const td = graph.direction === 'TD';
  if (graph.lanes.length !== 1 || (graph.lanes[0]?.label ?? '') !== '' || (graph.clusters ?? []).length > 0 || graph.placer !== undefined) return undefined;
  if (graph.nodes.length < 3 || graph.nodes.length > MAX_NODES || graph.edges.length > MAX_EDGES) return undefined;
  if (graph.nodes.some((n) => !PLAIN.has(n.shape) || n.compartments !== undefined || n.attach !== undefined || n.box !== undefined)) return undefined;
  const plainEnd = (end: EdgeEnd | undefined): boolean => end === undefined || ONE_CELL.has(end);
  if (graph.edges.some((e) => e.invisible === true || e.unranked === true || e.trunk !== undefined || (e.startLabel ?? '') !== '' || (e.endLabel ?? '') !== '' || !plainEnd(e.startEnd) || !plainEnd(e.end))) return undefined;
  const ranked = rankNodes(graph);
  if (ranked === undefined) return undefined;
  const { rank, links } = ranked;
  // A graph in which no box leads to two others and none is reached from two is a chain: it has nothing to set side by side.
  const ends = (pick: (l: Link) => number): boolean => graph.nodes.some((_n, i) => links.filter((l) => pick(l) === i).length >= 2);
  if (!ends((l) => l.a) && !ends((l) => l.b)) return undefined;
  const first = Math.min(...rank);
  const ranks = Math.max(...rank) - first + 1;

  const width = Math.max(...graph.nodes.map((n) => Math.max(ruler.textWidth(n.title, 'title'), ...n.lines.map((t) => ruler.textWidth(t, 'line'))))) + 2 * ruler.nodePadX + 2 * ruler.nodeBorder;
  const heights = graph.nodes.map((n) => 1 + n.lines.length + 2 * ruler.nodeBorder);
  const tallest = Array.from({ length: ranks }, (_, r) => Math.max(...graph.nodes.map((_n, i) => ((rank[i] as number) - first === r ? (heights[i] as number) : 0))));

  // Items: the boxes, and a place in every rank a longer line passes.
  const boxes: Item[] = graph.nodes.map((_n, i) => ({ rank: (rank[i] as number) - first, node: i, size: td ? width : (heights[i] as number) }));
  const laid = links.reduce<{ items: Item[]; segments: Segment[]; chains: Map<number, number[]> }>(
    (done, l) => {
      const passes = Array.from({ length: Math.max(0, (rank[l.b] as number) - (rank[l.a] as number) - 1) }, (_, k): Item => ({ rank: (rank[l.a] as number) - first + 1 + k, node: -1, size: 1 }));
      const chain = [l.a, ...passes.map((_p, k) => done.items.length + k), l.b];
      const parts = chain.slice(1).map((z, k): Segment => ({ link: l, a: chain[k] as number, z, first: k === 0, last: k === chain.length - 2 }));
      return { items: [...done.items, ...passes], segments: [...done.segments, ...parts], chains: new Map([...done.chains, [l.edge, chain] as const]) };
    },
    { items: boxes, segments: [], chains: new Map() },
  );
  const { items, segments, chains } = laid;
  const rankOf = (i: number): number => (items[i] as Item).rank;

  // Order in the ranks: the boxes in the order a walk along the lines as they are written first meets them.
  const met = new Map<number, number>();
  const leaving = graph.nodes.map((_n, i) => links.filter((l) => l.a === i));
  const walk = (v: number): void => {
    met.set(v, met.size);
    for (const l of leaving[v] ?? []) {
      for (const d of (chains.get(l.edge) ?? []).slice(1, -1)) met.set(d, met.size);
      if (!met.has(l.b)) walk(l.b);
    }
  };
  for (const v of graph.nodes.map((_n, i) => i).sort((p, q) => (rank[p] as number) - (rank[q] as number) || p - q)) if (!met.has(v)) walk(v);
  const written = Array.from({ length: ranks }, (_, r) => items.map((_it, i) => i).filter((i) => rankOf(i) === r).sort((p, q) => (met.get(p) ?? 0) - (met.get(q) ?? 0)));
  const crossingsOf = (rows: number[][]): number => {
    const at = new Map(rows.flatMap((row) => row.map((i, k) => [i, k] as const)));
    const place = (i: number): number => at.get(i) ?? 0;
    return sum(segments.map((s, i) => segments.slice(i + 1).filter((t) => rankOf(s.a) === rankOf(t.a) && (place(s.a) - place(t.a)) * (place(s.z) - place(t.z)) < 0).length));
  };
  /** Every rank but the first in turn, its items sorted by the middle of the items they are joined to in the rank before (or after, going up). */
  const sweep = (rows: number[][], down: boolean): number[][] =>
    Array.from({ length: ranks - 1 }, (_, k) => (down ? k + 1 : ranks - 2 - k)).reduce((next, r) => {
      const beside = next[down ? r - 1 : r + 1] as number[];
      const place = new Map(beside.map((i, at) => [i, at] as const));
      const row = next[r] as number[];
      const centre = new Map(
        row.map((i, at) => {
          const others = segments.flatMap((s) => (down ? (s.z === i ? [s.a] : []) : s.a === i ? [s.z] : [])).map((o) => place.get(o) ?? 0);
          return [i, others.length === 0 ? (at * beside.length) / Math.max(1, row.length) : sum(others) / others.length] as const;
        }),
      );
      const sorted = row.map((i, at) => ({ i, at })).sort((p, q) => (centre.get(p.i) ?? 0) - (centre.get(q.i) ?? 0) || p.at - q.at).map((p) => p.i);
      return next.map((old, k) => (k === r ? sorted : old));
    }, rows);
  let order = written;
  let crossed = crossingsOf(order);
  for (let round = 0, rows = order; round < 8 && crossed > 0; round++) {
    rows = sweep(rows, round % 2 === 0);
    const now = crossingsOf(rows);
    if (now < crossed) [order, crossed] = [rows, now];
  }
  const index = new Map(order.flatMap((row) => row.map((i, k) => [i, k] as const)));

  // Ports: the lines that leave a box alike leave it together, and so do the lines that reach it alike from boxes they
  // alone leave; every other line end has a port of its own.
  const edgeOf = (s: Segment): GraphEdge => graph.edges[s.link.edge] as GraphEdge;
  const outKey = (s: Segment): string => ((items[s.a] as Item).node < 0 || !s.first ? 'pass' : s.link.flipped ? `back|${s.link.edge}` : `out|${edgeOf(s).style}|${edgeOf(s).startEnd ?? 'none'}`);
  const together = (s: Segment): number => segments.filter((o) => o.a === s.a && outKey(o) === outKey(s)).length;
  const splits = (s: Segment): boolean => together(s) >= 2;
  const inKey = (s: Segment): string => ((items[s.z] as Item).node < 0 || !s.last ? 'pass' : s.link.flipped ? `back|${s.link.edge}` : splits(s) ? `own|${s.link.edge}` : `in|${edgeOf(s).style}|${edgeOf(s).end ?? 'arrow'}`);
  const outId = (s: Segment): string => `${s.a}|1|${outKey(s)}`;
  const inId = (s: Segment): string => `${s.z}|0|${inKey(s)}`;
  const portIds = [...new Set(segments.flatMap((s) => [outId(s), inId(s)]))];
  const portAt = new Map(portIds.map((id, k) => [id, k] as const));
  const outPort = segments.map((s) => portAt.get(outId(s)) as number);
  const inPort = segments.map((s) => portAt.get(inId(s)) as number);
  const sideOf = (p: number): string => (portIds[p] as string).split('|').slice(0, 2).join('|');
  const sides = new Map<string, number[]>();
  portIds.forEach((_id, p) => sides.set(sideOf(p), [...(sides.get(sideOf(p)) ?? []), p]));
  const offsets = new Map<number, number>();
  for (const [side, list] of sides) {
    const item = items[Number(side.split('|')[0])] as Item;
    const centre = Math.floor((item.size - 1) / 2);
    if (list.length > 1 && (!td || item.node < 0)) return undefined;
    // The ports of a side stand in the order of the items their lines lead to.
    const leaning = (p: number): number => {
      const others = segments.flatMap((s, k) => (outPort[k] === p ? [s.z] : inPort[k] === p ? [s.a] : [])).map((o) => ((index.get(o) ?? 0) + 0.5) / (order[rankOf(o)] as number[]).length);
      return sum(others) / Math.max(1, others.length);
    };
    for (const [k, p] of [...list].sort((a, b) => leaning(a) - leaning(b) || a - b).entries()) {
      const off = centre + 2 * k - (list.length - 1);
      if (item.node >= 0 && list.length > 1 && (off < 1 || off > item.size - 2)) return undefined;
      offsets.set(p, off);
    }
  }
  const off = (p: number | undefined): number => offsets.get(p ?? -1) ?? 0;
  const offsOn = (item: number, side: 0 | 1): number[] => (sides.get(`${item}|${side}`) ?? []).map(off);

  // Labels: beside the stretch of line that is the line's alone, next to the box the line leads to where it has one there.
  const labelled = segments.flatMap((s, k) => ((edgeOf(s).label ?? '') === '' || (s.link.flipped ? !s.first : !s.last) ? [] : [k]));
  const marks: Mark[] = [];
  for (const k of labelled) {
    const s = segments[k] as Segment;
    const where = splits(s) ? 'drop' : 'stem';
    const [item, side, at] = where === 'stem' ? [s.a, 1 as const, off(outPort[k])] : [s.z, 0 as const, off(inPort[k])];
    // Top-down, a label stands right of the last port of a side or left of the first one; a port between two others has no room for one.
    const left = td && at !== Math.max(...offsOn(item, side));
    if (left && at !== Math.min(...offsOn(item, side))) return undefined;
    const startMark = where === 'stem' && s.first && (s.link.flipped ? (edgeOf(s).end ?? 'arrow') : (edgeOf(s).startEnd ?? 'none')) !== 'none';
    marks.push({ segment: k, where, text: edgeOf(s).label ?? '', width: ruler.textWidth(edgeOf(s).label ?? '', 'edge'), left, after: !td && startMark ? 1 : 0 });
  }
  /** Cells a label takes beside its line: its text and a blank on either side. */
  const boxOf = (m: Mark): number => m.width + 2;
  const besideOf = (item: number, side: 0 | 1, left: boolean): number[] =>
    !td ? [] : marks.filter((m) => m.left === left && (m.where === 'stem' ? side === 1 && (segments[m.segment] as Segment).a === item : side === 0 && (segments[m.segment] as Segment).z === item)).map(boxOf);
  if (items.some((_it, i) => ([0, 1] as const).some((side) => besideOf(i, side, true).length > 1 || besideOf(i, side, false).length > 1))) return undefined;

  // Places across the reading direction: every rank is pulled towards the ports it is joined to in the rank before, then in the rank after.
  const reach = (i: number, side: 0 | 1): { first: number; last: number } => {
    const offs = offsOn(i, side);
    return offs.length === 0 ? { first: 0, last: (items[i] as Item).size - 1 } : { first: Math.min(...offs), last: Math.max(...offs) };
  };
  const apart = order.map((row) =>
    row.slice(1).map((j, k) => {
      const i = row[k] as number;
      const [p, q] = [items[i] as Item, items[j] as Item];
      const plain = p.size + (p.node >= 0 && q.node >= 0 ? (td ? BOX_GAP : 1) : LINE_GAP);
      const forLabels = ([0, 1] as const).map((side) => {
        const need = (besideOf(i, side, false)[0] ?? 0) + (besideOf(j, side, true)[0] ?? 0);
        return need === 0 ? 0 : reach(i, side).last + 1 + need - reach(j, side).first;
      });
      return Math.max(plain, ...forLabels);
    }),
  );
  const outAt = (pos: number[], k: number): number => (pos[(segments[k] as Segment).a] as number) + off(outPort[k]);
  const inAt = (pos: number[], k: number): number => (pos[(segments[k] as Segment).z] as number) + off(inPort[k]);
  const packed = new Map(order.flatMap((row, r) => row.map((i, k) => [i, sum((apart[r] as number[]).slice(0, k))] as const)));
  const pull = (pos: number[], r: number, down: boolean): number[] => {
    const row = order[r] as number[];
    const wants = row.map((i) => segments.flatMap((s, k) => (down ? (s.z === i ? [outAt(pos, k) - off(inPort[k])] : []) : s.a === i ? [inAt(pos, k) - off(outPort[k])] : [])));
    const settled = settle(wants.map((w, k) => (w.length === 0 ? (pos[row[k] as number] as number) : sum(w) / w.length)), wants.map((w) => (w.length === 0 ? 0.01 : 1)), apart[r] as number[]);
    const moved = new Map(row.map((i, k) => [i, settled[k] as number] as const));
    return pos.map((p, i) => moved.get(i) ?? p);
  };
  // A line of its own that is a cell or two off straight is made straight where the neighbours in the rank leave the room.
  const straighten = (pos: number[], r: number, down: boolean): number[] =>
    (order[r] as number[]).reduce((now, i, k, row) => {
      const towards = segments.flatMap((s, n) => ((down ? s.z : s.a) === i ? [n] : []));
      const away = segments.flatMap((s, n) => ((down ? s.a : s.z) === i ? [n] : []));
      const straight = (n: number): boolean => outAt(now, n) === inAt(now, n);
      const only = towards[0];
      if (towards.length !== 1 || only === undefined || straight(only) || away.some(straight)) return now;
      const want = (now[i] as number) + (down ? outAt(now, only) - inAt(now, only) : inAt(now, only) - outAt(now, only));
      const gaps = apart[r] as number[];
      const [before, after] = [row[k - 1], row[k + 1]];
      const free = (before === undefined || want >= (now[before] as number) + (gaps[k - 1] as number)) && (after === undefined || (now[after] as number) >= want + (gaps[k] as number));
      return Math.abs(want - (now[i] as number)) <= 2 && free ? now.map((p, n) => (n === i ? want : p)) : now;
    }, pos);
  const downward = Array.from({ length: ranks - 1 }, (_, k) => k + 1);
  const upward = Array.from({ length: ranks - 1 }, (_, k) => ranks - 2 - k);
  let pos = items.map((_it, i) => packed.get(i) ?? 0);
  for (let round = 0; round < 4; round++) {
    pos = downward.reduce((p, r) => pull(p, r, true), pos);
    pos = upward.reduce((p, r) => pull(p, r, false), pos);
  }
  pos = downward.reduce((p, r) => straighten(p, r, true), pos);
  pos = upward.reduce((p, r) => straighten(p, r, false), pos);
  const settled = pos;

  // Bands between the ranks: lines that share a port run as one net; each net that turns takes a track of the band.
  const bands: Band[] = [];
  for (let b = 0; b + 1 < ranks; b++) {
    const mine = segments.flatMap((s, k) => (rankOf(s.a) === b ? [k] : []));
    const byPort = new Map<string, number[]>();
    for (const k of mine) {
      const fork = mine.filter((o) => outPort[o] === outPort[k]).length >= 2;
      const join = mine.filter((o) => inPort[o] === inPort[k]).length >= 2;
      const key = fork ? `o${outPort[k]}` : join ? `i${inPort[k]}` : `s${k}`;
      byPort.set(key, [...(byPort.get(key) ?? []), k]);
    }
    const nets = [...byPort].map(([key, list]): Net => ({
      segments: list,
      stems: [...new Set(list.map((k) => outAt(settled, k)))],
      drops: [...new Set(list.map((k) => inAt(settled, k)))],
      ...(list.length < 2 ? {} : { shared: key.startsWith('o') ? ('start' as const) : ('end' as const) }),
    }));
    const track = assignTracks(nets);
    if (track === undefined) return undefined;
    const tracks = Math.max(-1, ...track.values()) + 1;
    // Along the reading direction a band holds the stems, its tracks, the stretch into the next rank where a label stands on it, and the cell of the arrowheads.
    const room = (where: Mark['where']): number[] => marks.filter((m) => m.where === where && mine.includes(m.segment)).map((m) => (td ? 1 : m.width + 4 + m.after));
    // A band without tracks is two cells long, a stem and an arrowhead; a level one, or one with a line that has a mark at either end, is three, so that a cell of line shows behind every mark.
    const marked = (e: GraphEdge): boolean => (e.startEnd ?? 'none') !== 'none' && (e.end ?? 'arrow') !== 'none';
    const long = tracks === 0 && (!td || mine.some((k) => marked(edgeOf(segments[k] as Segment)) && (segments[k] as Segment).first && (segments[k] as Segment).last));
    bands.push({ nets, track, tracks, stem: Math.max(long ? 2 : 1, ...room('stem')), drop: Math.max(0, ...room('drop')) });
  }
  const netOf = new Map(bands.flatMap((band, b) => band.nets.flatMap((net) => net.segments.map((k) => [k, { band: b, net }] as const))));

  const starts = Array.from({ length: ranks }, (_, r) => r).reduce<{ rank: number[]; band: number[]; at: number }>(
    (done, r) => {
      const band = bands[r];
      const after = done.at + (td ? (tallest[r] as number) : width);
      return { rank: [...done.rank, done.at], band: [...done.band, after], at: after + (band === undefined ? 0 : band.stem + band.tracks + band.drop + 1) };
    },
    { rank: [], band: [], at: 0 },
  );
  const point = (along: number, across: number): Point => (td ? { x: across, y: along } : { x: along, y: across });
  const nodes: LayoutNode[] = graph.nodes.map((n, i) => {
    const at = point(starts.rank[rankOf(i)] as number, settled[i] as number);
    return { id: n.id, lane: n.lane, rank: rankOf(i), span: 1, row: index.get(i) ?? 0, x: at.x, y: at.y, w: width, h: td ? (tallest[rankOf(i)] as number) : (heights[i] as number), title: n.title, lines: n.lines, shape: n.shape };
  });
  const trackAt = (b: number, net: Net): number => (starts.band[b] as number) + (bands[b] as Band).stem + ((bands[b] as Band).track.get(net) ?? 0);
  const edges: LayoutEdge[] = graph.edges.map((e, edge) => {
    const mine = segments.flatMap((s, k) => (s.link.edge === edge ? [k] : []));
    const flipped = (segments[mine[0] as number] as Segment).link.flipped;
    const points = mine.flatMap((k) => {
      const s = segments[k] as Segment;
      const { band: b, net } = netOf.get(k) as { band: number; net: Net };
      const [from, to] = [outAt(settled, k) + 0.5, inAt(settled, k) + 0.5];
      return [
        ...(s.first ? [point(starts.band[b] as number, from)] : []),
        ...(from === to ? [] : [point(trackAt(b, net) + 0.5, from), point(trackAt(b, net) + 0.5, to)]),
        ...(s.last ? [point(starts.rank[b + 1] as number, to)] : []),
      ];
    });
    const sharing = mine.flatMap((k) => {
      const { band: b, net } = netOf.get(k) as { band: number; net: Net };
      return net.shared === undefined ? [] : [{ id: `${b}|${net.shared}|${net.shared === 'start' ? outPort[k] : inPort[k]}`, at: net.shared }];
    })[0];
    const mark = marks.find((m) => mine.includes(m.segment));
    const labelOf = (m: Mark): NonNullable<LayoutEdge['label']> => {
      const b = (netOf.get(m.segment) as { band: number }).band;
      const band = bands[b] as Band;
      const start = (starts.band[b] as number) + (m.where === 'stem' ? 0 : band.stem + band.tracks);
      const line = m.where === 'stem' ? outAt(settled, m.segment) : inAt(settled, m.segment);
      return td ? { text: m.text, x: m.left ? line - boxOf(m) : line + 1, y: start, w: boxOf(m), h: 1 } : { text: m.text, x: start + 1 + m.after, y: line, w: boxOf(m), h: 1 };
    };
    return {
      from: e.from,
      to: e.to,
      style: e.style,
      ...(e.id === undefined ? {} : { id: e.id }),
      ...(e.startEnd === undefined ? {} : { startEnd: e.startEnd }),
      ...(e.end === undefined ? {} : { end: e.end }),
      points: flipped ? [...points].reverse() : points,
      ...(mark === undefined ? {} : { label: labelOf(mark) }),
      ...(sharing === undefined ? {} : { sharedPort: sharing }),
    };
  });

  // A label stands clear of every line and of the other labels.
  const labels = edges.flatMap((e) => (e.label === undefined ? [] : [e.label]));
  if (td) {
    const taken = new Set(
      edges.flatMap((e) =>
        e.points.slice(1).flatMap((q, i) => {
          const p = e.points[i] as Point;
          const [x0, x1, y0, y1] = [Math.floor(Math.min(p.x, q.x)), Math.floor(Math.max(p.x, q.x) - 1e-9), Math.floor(Math.min(p.y, q.y)), Math.floor(Math.max(p.y, q.y) - 1e-9)];
          return Array.from({ length: Math.max(1, x1 - x0 + 1) }, (_, dx) => Array.from({ length: Math.max(1, y1 - y0 + 1) }, (_d, dy) => `${x0 + dx},${y0 + dy}`)).flat();
        }),
      ),
    );
    const onLine = labels.some((l) => Array.from({ length: l.w }, (_, k) => l.x + k).some((x) => taken.has(`${x},${l.y}`)));
    const onLabel = labels.some((l, k) => labels.some((o, j) => j < k && o.y === l.y && o.x < l.x + l.w && l.x < o.x + o.w));
    if (onLine || onLabel) return undefined;
  }
  // The drawing starts in the first column and the first row: a label left of the first line moves it to the right.
  const left = Math.min(...nodes.map((n) => n.x), ...labels.map((l) => l.x), ...edges.flatMap((e) => e.points.map((p) => Math.floor(p.x))));
  const top = Math.min(...nodes.map((n) => n.y), ...edges.flatMap((e) => e.points.map((p) => Math.floor(p.y))));
  const moved = <T extends Point>(p: T): T => ({ ...p, x: p.x - left, y: p.y - top });
  const drawn = {
    nodes: nodes.map(moved),
    edges: edges.map((e) => ({ ...e, points: e.points.map(moved), ...(e.label === undefined ? {} : { label: moved(e.label) }) })),
  };
  const right = Math.max(...drawn.nodes.map((n) => n.x + n.w), ...drawn.edges.flatMap((e) => [...e.points.map((p) => Math.ceil(p.x)), ...(e.label === undefined ? [] : [e.label.x + e.label.w - 1])]));
  const bottom = Math.max(...drawn.nodes.map((n) => n.y + n.h), ...drawn.edges.flatMap((e) => e.points.map((p) => Math.ceil(p.y))));
  if (limit !== undefined && Number.isFinite(limit) && right > limit) return undefined;
  const lane = graph.lanes[0] ?? { id: '', label: '' };
  return {
    width: right,
    height: bottom,
    direction: graph.direction,
    laneAxis: 'across',
    composition: 'lanes',
    lanes: [{ id: lane.id, label: '', x: 0, y: 0, w: right, h: bottom, labelBox: { x: 0, y: 0, w: 0, h: 1 }, bare: true }],
    nodes: drawn.nodes,
    edges: drawn.edges,
    // As in every terminal drawing, a flow written right to left or bottom to top is drawn the other way round, and says so.
    diagnostics: graph.mirror === undefined ? [] : [{ kind: 'direction-mirrored-in-text', nodes: [], message: `The direction ${graph.mirror} is drawn as ${graph.direction} in text.` }],
  };
}
