import { describe, expect, it } from 'vitest';
import { cellRuler, cellWidth, layout, parse, pixelRuler, renderText } from '../src/index.ts';
import type { Ruler } from '../src/metrics.ts';
import { align } from '../src/layered/align.ts';
import { gapLines, layeredRuler } from '../src/layered/index.ts';
import type { Ladder } from '../src/layered/model.ts';
import { buildLadder } from '../src/layered/dummies.ts';
import { orderLayers } from '../src/layered/order.ts';
import { assignLayers } from '../src/layered/rows.ts';
import { assignTracks } from '../src/layered/route.ts';
import type { Graph } from '../src/types.ts';
import * as fixtures from './fixtures.ts';
import { endpointViolations as portViolations, geometryViolations, widthForColumns } from './helpers.ts';
import type { Layout } from '../src/types.ts';

/** Stages are placed in the transposed reading direction, so ports are checked against that graph. */
const endpointViolations = (l: Layout, ruler: Ruler, g: Graph): string[] =>
  portViolations(l, ruler, l.composition === 'stages' ? { ...g, direction: g.direction === 'LR' ? 'TD' : 'LR' } : g);

const units = (g: Graph): number[] => g.nodes.map(() => 2);
const rowsOf = (src: string, capacity = Infinity) => {
  const g = parse(src);
  return { g, rows: assignLayers(g, units(g), capacity) };
};

describe('layered rows', () => {
  it('puts the longest path of a lane on one row', () => {
    const { g, rows } = rowsOf('flowchart LR\n  A[Order] --> B[Pay]\n  B --> C[Ship]\n  C --> D[Done]\n  B --> E[Refund]');
    const layer = (id: string): number => rows.layer[g.nodes.findIndex((n) => n.id === id)] ?? -1;
    expect(new Set(['A', 'B', 'C', 'D'].map(layer)).size).toBe(1);
    expect(rows.layerLane.length).toBe(2);
  });

  it('cuts a path that is longer than a row', () => {
    const { rows } = rowsOf('flowchart LR\n  A[One] --> B[Two]\n  B --> C[Three]\n  C --> D[Four]\n  D --> E[Five]', 6);
    expect(rows.layerLane.length).toBe(2);
    expect(rows.layer).toEqual([0, 0, 0, 1, 1]);
  });

  it('puts independent chains of a lane side by side on one row', () => {
    const { rows } = rowsOf('flowchart LR\n  A[One] --> B[Two]\n  C[Three] --> D[Four]\n  E[Five]');
    expect(rows.layerLane.length).toBe(1);
    expect(new Set(rows.layer).size).toBe(1);
  });

  it('anchors a node without in-lane edges toward the lane its partner is in', () => {
    const src = `flowchart LR
  subgraph top[Top]
    a[Above]
  end
  subgraph mid[Middle]
    p[Start] --> q[Next]
    p --> s[Branch]
    t1[Up partner]
    t2[Down partner]
  end
  subgraph low[Low]
    b[Below]
  end
  a --> t1
  t2 --> b`;
    const { g, rows } = rowsOf(src);
    const at = (id: string): number => rows.layer[g.nodes.findIndex((n) => n.id === id)] ?? -1;
    expect(at('t1')).toBe(at('p'));
    expect(at('t2')).toBe(at('s'));
    expect(at('s')).toBe(at('p') + 1);
  });

  it('stacks blocks that face opposite lanes instead of widening the row', () => {
    const src = `flowchart LR
  subgraph top[Top]
    a[Above]
  end
  subgraph mid[Middle]
    t1[Up partner]
    t2[Down partner]
  end
  subgraph low[Low]
    b[Below]
  end
  a --> t1
  t2 --> b`;
    const g = parse(src);
    const rows = assignLayers(g, units(g), [Infinity, 2, Infinity]);
    const at = (id: string): number => rows.layer[g.nodes.findIndex((n) => n.id === id)] ?? -1;
    expect(at('t2')).toBe(at('t1') + 1);
    expect(rows.layerLane.filter((lane) => lane === 1).length).toBe(2);
  });

  it('moves blocks to a further shelf of rows when a row overflows', () => {
    const { rows } = rowsOf('flowchart LR\n  A[One]\n  B[Two]\n  C[Three]', 4);
    expect(rows.layerLane.length).toBe(2);
    const counts = [0, 1].map((k) => rows.layer.filter((l) => l === k).length);
    expect(counts.sort()).toEqual([1, 2]);
  });

  it('turns a back edge around instead of failing on a cycle', () => {
    const { g, rows } = rowsOf(fixtures.cycle);
    expect(rows.reversed.filter(Boolean).length).toBeGreaterThan(0);
    expect(g.edges.length).toBe(5);
  });
});

describe('layered dummies', () => {
  it('gives an edge over three layers two dummies', () => {
    const src = `flowchart LR
  subgraph a[A]
    n1[First]
  end
  subgraph b[B]
    n2[Second]
  end
  subgraph c[C]
    n3[Third]
  end
  subgraph d[D]
    n4[Fourth]
  end
  n1 --> n2
  n2 --> n3
  n3 --> n4
  n1 --> n4`;
    const g = parse(src);
    const ladder = buildLadder(g, assignLayers(g, units(g), Infinity), units(g));
    const long = ladder.chains.find((c) => c.edge === 3);
    expect(long?.nodes.length).toBe(4);
    expect(ladder.nodes.length - ladder.realCount).toBe(2);
    expect(ladder.nodes.slice(ladder.realCount).map((n) => n.units)).toEqual([1, 1]);
  });
});

describe('layered ordering', () => {
  const two = `flowchart LR
  subgraph top[Top]
    a1[A1]
    a2[A2]
  end
  subgraph bottom[Bottom]
    b1[B1]
    b2[B2]
  end
  a1 --> b2
  a2 --> b1`;

  it('reaches no crossing where one order has none', () => {
    const g = parse(two);
    const rows = assignLayers(g, units(g), 2);
    const ladder = buildLadder(g, rows, units(g));
    expect(orderLayers(g, ladder, rows).crossings).toBe(0);
  });

  it('never puts the right end of a flat edge left of its left end', () => {
    for (const src of [fixtures.twoLanes, fixtures.cycle, fixtures.library]) {
      const g = parse(src);
      const rows = assignLayers(g, units(g), Infinity);
      const ladder = buildLadder(g, rows, units(g));
      const { layers } = orderLayers(g, ladder, rows);
      for (const f of ladder.flat) {
        const row = layers[ladder.nodes[f.lo]?.layer ?? 0] ?? [];
        expect(row.indexOf(f.lo)).toBeLessThan(row.indexOf(f.hi));
      }
    }
  });
});

describe('layered alignment', () => {
  const prepare = (src: string, capacity = Infinity) => {
    const g = parse(src);
    const rows = assignLayers(g, units(g), capacity);
    const ladder = buildLadder(g, rows, units(g));
    const { layers } = orderLayers(g, ladder, rows);
    return { g, ladder, layers, ...align(ladder, layers) };
  };
  const lanes3 = `flowchart LR
  subgraph a[A]
    x[Top]
  end
  subgraph b[B]
    y[Middle]
  end
  subgraph c[C]
    z[Bottom]
  end
  x --> y
  y --> z`;

  it('gives a chain over three layers one shared start', () => {
    const { start } = prepare(lanes3);
    expect(new Set(start.slice(0, 3)).size).toBe(1);
  });

  it('puts a node with two partners in its layer over the median one and keeps integer starts and separations', () => {
    const src = `flowchart LR
  subgraph a[A]
    p[Left] --> q[Right]
  end
  subgraph b[B]
    m[Both]
  end
  p --> m
  q --> m`;
    const { g, ladder, layers, start } = prepare(src);
    const at = (id: string): number => start[g.nodes.findIndex((n) => n.id === id)] ?? NaN;
    expect([at('p'), at('q')]).toContain(at('m'));
    expect(start.every(Number.isInteger)).toBe(true);
    for (const row of layers) {
      for (let k = 1; k < row.length; k++) {
        const prev = row[k - 1] as number;
        expect((start[row[k] as number] ?? 0) - (start[prev] ?? 0)).toBeGreaterThanOrEqual(1);
      }
    }
    expect(ladder.nodes.length).toBe(3);
  });
});

describe('layered straightening', () => {
  const lay = (src: string) => layout(parse(src), pixelRuler(), { engine: 'layered', composition: 'lanes' });
  const edge = (l: ReturnType<typeof lay>, from: string, to: string) => l.edges.find((e) => e.from === from && e.to === to);

  it('keeps the best of the four alignments instead of a half-step average', () => {
    const l = lay(`flowchart LR
  subgraph top[Top]
    a[Receive] --> b[Check]
    b --> c[Approve]
  end
  subgraph bottom[Bottom]
    d[Archive]
    e[Notify]
  end
  b --> d
  c --> e`);
    expect(edge(l, 'b', 'd')?.points.length).toBe(2);
    expect(edge(l, 'c', 'e')?.points.length).toBe(2);
  });

  it('aligns a pair when the cells are free', () => {
    const l = lay(`flowchart LR
  subgraph top[Top]
    a[One] --> b[Two] --> c[Three]
  end
  subgraph bottom[Bottom]
    x[Lone]
  end
  c --> x`);
    expect(edge(l, 'c', 'x')?.points.length).toBe(2);
  });

  it('refuses a move that would break another straight piece', () => {
    const l = lay(`flowchart LR
  subgraph top[Top]
    p[Left] --> q[Right]
  end
  subgraph bottom[Bottom]
    m[Both]
  end
  p --> m
  q --> m`);
    const straight = [edge(l, 'p', 'm'), edge(l, 'q', 'm')].filter((e) => e?.points.length === 2);
    expect(straight.length).toBe(1);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('puts the line of a partner on a port of a wide node', () => {
    const g = parse(`flowchart LR
  subgraph top[Top]
    w[A very long title that needs a much wider box than the others]
  end
  subgraph bottom[Bottom]
    n[Short]
  end
  w --> n`);
    const l = layout(g, pixelRuler(), { engine: 'layered', composition: 'lanes' });
    const e = l.edges[0];
    const wide = l.nodes.find((n) => n.id === 'w');
    expect(wide && wide.w > 160).toBe(true);
    expect(e?.points.length).toBe(2);
    expect(e?.points[0]?.x).toBe(e?.points[1]?.x);
    expect(endpointViolations(l, layeredRuler(pixelRuler()), g)).toEqual([]);
  });
});

describe('layered ports on a box side', () => {
  const hub = (flip: boolean): string => {
    const hubLane = '  subgraph hubs[Hub]\n    h[Hub box]\n  end';
    const partners = '  subgraph ring[Partners]\n    p1[One]\n    p2[Two]\n    p3[Three]\n    p4[Four]\n    p5[Five]\n  end';
    return `flowchart LR\n${flip ? `${hubLane}\n${partners}` : `${partners}\n${hubLane}`}\n  p1 --> h\n  h --> p2\n  p3 --> h\n  h --> p4\n  p5 --> h`;
  };
  for (const flip of [false, true]) {
    it(`gives pieces of a hub with five partners ports in the order of their other ends (partners ${flip ? 'below' : 'above'})`, () => {
      const g = parse(hub(flip));
      const l = layout(g, pixelRuler(), { engine: 'layered' });
      expect(l.diagnostics.filter((d) => d.kind === 'crossing')).toEqual([]);
      expect(geometryViolations(l)).toEqual([]);
      expect(endpointViolations(l, layeredRuler(pixelRuler()), g)).toEqual([]);
    });
  }
});

describe('layered fitting a lane into the width', () => {
  it('moves a one-row block into free cells of a taller block before adding a row', () => {
    const g = parse('flowchart LR\n  A[One] --> B[Two]\n  B --> C[Three]\n  C --> D[Four]\n  B --> E[Five]\n  S[Lone]');
    const rows = assignLayers(g, units(g), 8);
    const at = (id: string): number => rows.layer[g.nodes.findIndex((n) => n.id === id)] ?? -1;
    expect(rows.layerLane.length).toBe(2);
    expect(at('S')).toBe(at('E'));
    expect(new Set(['A', 'B', 'C', 'D'].map(at)).size).toBe(1);
  });

  it('keeps a path whole while blocks move to another shelf, and cuts it only when it is wider than the row', () => {
    const g = parse('flowchart LR\n  A[One] --> B[Two]\n  B --> C[Three]\n  D[Four] --> E[Five]');
    const shelved = assignLayers(g, units(g), 6, 0);
    expect(new Set(['A', 'B', 'C'].map((id) => shelved.layer[g.nodes.findIndex((n) => n.id === id)])).size).toBe(1);
    expect(shelved.layerLane.length).toBe(2);
    const cut = assignLayers(g, units(g), 4);
    expect(new Set(['A', 'B', 'C'].map((id) => cut.layer[g.nodes.findIndex((n) => n.id === id)])).size).toBe(2);
  });

  it('keeps a narrower canvas valid by closing gaps or adding rows', () => {
    const g = parse('flowchart LR\n  A[One] --> B[Two]\n  B --> C[Three]\n  C --> D[Four]');
    const wide = layout(g, cellRuler(), { engine: 'layered', maxWidth: 200 });
    const tight = layout(g, cellRuler(), { engine: 'layered', maxWidth: wide.width - 2 });
    expect(new Set(wide.nodes.map((n) => n.y)).size).toBe(1);
    expect(tight.width).toBeLessThanOrEqual(wide.width);
    expect(geometryViolations(tight)).toEqual([]);
  });
});

describe('layered pass-through lines', () => {
  const row = (count: number): Ladder => ({
    nodes: [0, 1, ...Array.from({ length: count }, (_, i) => i + 2)].map((idx) => ({ idx, layer: 0, units: idx < 2 ? 2 : 1, origin: idx, chain: -1 })),
    realCount: 2,
    layers: [[0, ...Array.from({ length: count }, (_, i) => i + 2), 1]],
    chains: [],
    layerLane: [0],
    layerRow: [0],
    flat: [],
  });

  it('counts the lines that share a gap from the track gap', () => {
    expect(gapLines(pixelRuler(), 48)).toBe(4);
    expect(gapLines(pixelRuler(), 40)).toBe(3);
    expect(gapLines(cellRuler(), 4)).toBe(3);
    expect(gapLines(cellRuler(), 2)).toBe(1);
  });

  it('needs no room for a line between two boxes', () => {
    const l = row(1);
    const { start } = align(l, l.layers);
    expect(start[1]).toBe((start[0] ?? 0) + 2);
    expect(start[2]).toBe((start[0] ?? 0) + 1);
  });

  it('lets M lines share a start and moves the next one on', () => {
    const l = row(5);
    const { start } = align(l, l.layers, () => 0, { lines: 3 });
    expect([start[2], start[3], start[4]]).toEqual([start[2], start[2], start[2]]);
    expect(start[5]).toBe((start[2] ?? 0) + 1);
    expect(start[6]).toBe(start[5]);
    expect(start[1] ?? 0).toBeGreaterThanOrEqual((start[6] ?? 0) + 1);
  });

  it('keeps every line out of the boxes and the drawing inside the canvas', () => {
    const src = `flowchart LR
  subgraph top[Top]
    a1[Receive] --> a2[Check]
    a3[Plan]
    a4[Review]
  end
  subgraph mid[Middle]
    b1[Pack] --> b2[Label] --> b3[Ship]
  end
  subgraph low[Bottom]
    c1[Archive]
    c2[Notify]
    c3[Report]
    c4[Audit]
  end
  a1 --> c1
  a2 --> c2
  a3 --> c3
  a4 --> c4
  a1 --> b1
  b3 --> c1`;
    const g = parse(src);
    for (const maxWidth of [1280, 800]) {
      const l = layout(g, pixelRuler(), { engine: 'layered', maxWidth });
      expect(geometryViolations(l)).toEqual([]);
      expect(endpointViolations(l, layeredRuler(pixelRuler()), g)).toEqual([]);
      expect(l.width).toBeLessThanOrEqual(maxWidth);
    }
  });
});

describe('layered grid and width remedies', () => {
  it('snaps to half the node grid for pixels and leaves cells alone', () => {
    expect(layeredRuler(pixelRuler()).nodeGrid).toBe(8);
    expect(layeredRuler(pixelRuler()).rankGapMin).toBe(24);
    // A terminal counts in whole cells, with the gap of one arrow between neighbouring boxes.
    expect(layeredRuler(cellRuler()).nodeGrid).toBe(1);
    expect(layeredRuler(cellRuler()).rankGap).toBe(3);
  });

  it('closes the pixel gap before dropping a box from a row', () => {
    const g = parse('flowchart LR\n  A[Receive order] --> B[Check stock]\n  B --> C[Pack parcel]\n  C --> D[Ship parcel]\n  D --> E[Notify buyer]\n  E --> F[Close order]');
    const natural = layout(g, pixelRuler(), { engine: 'layered', maxWidth: Infinity });
    const narrower = layout(g, pixelRuler(), { engine: 'layered', maxWidth: natural.width - 16 });
    expect(new Set(natural.nodes.map((n) => n.y)).size).toBe(1);
    expect(new Set(narrower.nodes.map((n) => n.y)).size).toBe(1);
    expect(narrower.width).toBeLessThanOrEqual(natural.width - 16);
  });

  it('keeps a four-box main path horizontal in a crowded lane with a branch, a wide box and a singleton', () => {
    const src = `flowchart LR
  subgraph top[Top]
    t1[Filed] --> t2[Applied] --> t3[Limited]
    t4[Closed early]
    t5[Cleared]
    t6[Released]
  end
  subgraph low[Bottom]
    m1[Queue list] --> m2[Find content] --> m3[Content card] --> m4[Decide content]
    m1 --> b1[Profile list] --> b2[Decide profile]
    w[Closed reports list overview]
    s[Sync release]
  end
  t1 --> m1
  m4 --> t2
  b2 --> t2
  t4 --> w
  t3 --> s`;
    const g = parse(src);
    const l = layout(g, pixelRuler(), { engine: 'layered' });
    const main = ['m1', 'm2', 'm3', 'm4'].map((id) => l.nodes.find((n) => n.id === id)?.y);
    expect(new Set(main).size).toBe(1);
    // The node the text starts from must stand in the first place, which can cost the top lane rows.
    expect(new Set(l.nodes.filter((n) => n.lane === 'low' || n.lane === 'lane2').map((n) => n.y)).size).toBeLessThanOrEqual(3);
    expect(l.width).toBeLessThanOrEqual(1280);
    expect(geometryViolations(l)).toEqual([]);
  });
});

describe('layered routing', () => {
  it('draws an aligned pair as one straight segment centre to centre', () => {
    const l = layout(parse('flowchart LR\n  subgraph a[A]\n    x[Top]\n  end\n  subgraph b[B]\n    y[Bottom]\n  end\n  x --> y'), pixelRuler(), { engine: 'layered', composition: 'lanes' });
    const [x, y] = l.nodes;
    expect(l.edges[0]?.points.length).toBe(2);
    expect(l.edges[0]?.points[0]?.x).toBeCloseTo((x?.x ?? 0) + (x?.w ?? 0) / 2);
    expect(l.edges[0]?.points[1]?.x).toBeCloseTo((y?.x ?? 0) + (y?.w ?? 0) / 2);
  });

  it('orders tracks so that two jogs do not cross', () => {
    const tracks = assignTracks([
      { order: 0, lo: 0, hi: 100, top: [0], bot: [100] },
      { order: 1, lo: 50, hi: 150, top: [50], bot: [150] },
    ]);
    // a: 0 -> 100, b: 50 -> 150. a above b crosses once (b's top leg at 50 lies inside a); b above a crosses once too, but both need two tracks.
    expect(new Set(tracks).size).toBe(2);
    const nested = assignTracks([
      { order: 0, lo: 0, hi: 100, top: [0], bot: [100] },
      { order: 1, lo: 20, hi: 60, top: [20], bot: [60] },
    ]);
    // The inner jog hangs from the top at 20 and lands at 60: it must go above the outer jog's bottom leg and below its top leg only if that avoids a crossing.
    expect(nested[0]).not.toBe(nested[1]);
    const apart = assignTracks([
      { order: 0, lo: 0, hi: 40, top: [0], bot: [40] },
      { order: 1, lo: 60, hi: 100, top: [60], bot: [100] },
    ]);
    expect(apart).toEqual([0, 0]);
  });

  it('draws flat neighbours as one segment and a flat edge over a node as a U', () => {
    const adjacent = layout(parse('flowchart LR\n  A[One] --> B[Two]'), pixelRuler(), { engine: 'layered' });
    expect(adjacent.edges[0]?.points.length).toBe(2);
    expect(adjacent.edges[0]?.points[0]?.y).toBe(adjacent.edges[0]?.points[1]?.y);
    const u = layout(parse('flowchart LR\n  A[One] --> B[Two]\n  B --> C[Three]\n  A --> C'), pixelRuler(), { engine: 'layered' });
    const skip = u.edges.find((e) => e.from === 'A' && e.to === 'C');
    expect(skip?.points.length).toBe(4);
    expect(geometryViolations(u)).toEqual([]);
  });
});

const SEEDS = 60;
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORDS = ['Receive order', 'Check stock', 'Pack', 'Ship parcel', 'Notify', 'Audit log', 'Refund', 'Approve', 'Archive', 'Index'];
function generate(seed: number): string {
  const rnd = prng(seed);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const lanes = 1 + pick(3);
  const count = 4 + pick(13);
  const dir = rnd() < 0.5 ? 'LR' : 'TD';
  const labels = rnd() < 0.5;
  const members: string[][] = Array.from({ length: lanes }, () => []);
  for (let i = 0; i < count; i++) members[pick(lanes)]?.push(`n${i}`);
  const title = (i: number): string => `n${i}[${WORDS[(i * 7 + seed) % WORDS.length]}]`;
  const lines = [`flowchart ${dir}`];
  members.forEach((ids, k) => {
    if (ids.length === 0) return;
    lines.push(`subgraph l${k}[Lane ${k}]`, ...ids.map((id) => title(Number(id.slice(1)))), 'end');
  });
  const edges = Math.min(count + pick(count), 24);
  for (let e = 0; e < edges; e++) {
    const a = pick(count);
    let b = pick(count);
    if (b === a) b = (a + 1) % count;
    if (e < count - 1 && rnd() < 0.7) b = Math.min(count - 1, a + 1);
    if (a === b) continue;
    lines.push(`n${a} -->${labels && rnd() < 0.5 ? `|e${e}|` : ''} n${b}`);
  }
  return lines.join('\n');
}

const rulers: Array<[string, Ruler]> = [
  ['pixel', pixelRuler()],
  ['grid 12/2', { ...pixelRuler(), nodeGrid: 12, edgeGrid: 2, lanePad: 36, laneGap: 12 }],
  ['pitch 16', { ...pixelRuler(), portPitch: 16 }],
];

describe('layered pipeline invariants', () => {
  for (const [name, src] of Object.entries(fixtures)) {
    it(`fixture ${name} has no violation in pixels or cells`, () => {
      const g = parse(src);
      const px = layout(g, pixelRuler(), { engine: 'layered' });
      expect(geometryViolations(px)).toEqual([]);
      expect(endpointViolations(px, layeredRuler(pixelRuler()), g)).toEqual([]);
      const cells = layout(g, cellRuler(), { engine: 'layered', maxWidth: 120 });
      expect(geometryViolations(cells)).toEqual([]);
      expect(endpointViolations(cells, layeredRuler(cellRuler()), g)).toEqual([]);
    });
  }

  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`generated graph ${seed} has no violation at three widths`, () => {
      const g = parse(generate(seed));
      const [name, ruler] = rulers[seed % rulers.length] ?? rulers[0] ?? ['pixel', pixelRuler()];
      for (const maxWidth of [1280, 800, Infinity]) {
        const l = layout(g, ruler, { engine: 'layered', maxWidth });
        expect([name, maxWidth, geometryViolations(l)]).toEqual([name, maxWidth, []]);
        expect([name, maxWidth, endpointViolations(l, layeredRuler(ruler), g)]).toEqual([name, maxWidth, []]);
      }
    });
  }

  it('lays the cell ruler out for generated graphs without violation', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = parse(generate(seed));
      const l = layout(g, cellRuler(), { engine: 'layered', maxWidth: 120 });
      expect(geometryViolations(l)).toEqual([]);
    }
  }, 60000);

  it('is deterministic', () => {
    for (const src of [fixtures.twoLanes, generate(7), generate(31)]) {
      const g = parse(src);
      expect(JSON.stringify(layout(g, pixelRuler(), { engine: 'layered' }))).toBe(JSON.stringify(layout(g, pixelRuler(), { engine: 'layered' })));
    }
  });

  it('keeps every node in its lane on pixel and cell rulers, whose capacity in boxes differs', () => {
    const g = parse(fixtures.twoLanes);
    const px = layout(g, pixelRuler(), { engine: 'layered', maxWidth: widthForColumns(g, pixelRuler(), 5), refine: false });
    const cells = layout(g, cellRuler(), { engine: 'layered', maxWidth: widthForColumns(g, layeredRuler(cellRuler()), 5), refine: false });
    expect(cells.nodes.map((n) => n.lane)).toEqual(px.nodes.map((n) => n.lane));
  });

  it('uses the layered engine when none is named', () => {
    const g = parse(fixtures.twoLanes);
    expect(layout(g, pixelRuler())).toEqual(layout(g, pixelRuler(), { engine: 'layered' }));
  });

  it('renders text through the engine, aligned with Korean labels', () => {
    const out = renderText(fixtures.twoLanes, 120, { engine: 'layered' });
    expect('lines' in out).toBe(true);
    if (!('lines' in out)) return;
    expect(out.lines.some((line) => line.includes('주문 접수'))).toBe(true);
    expect(Math.max(...out.lines.map(cellWidth))).toBeLessThanOrEqual(120);
    const korean = renderText(fixtures.korean, 80, { engine: 'layered' });
    expect('lines' in korean).toBe(true);
  });
});
