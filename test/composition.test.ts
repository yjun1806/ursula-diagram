import { describe, expect, it } from 'vitest';
import { cellRuler, layeredRuler, layout, parse, pixelRuler, selectFrontEnd } from '../src/index.ts';
import { planZones } from '../src/layered/composition.ts';
import type { Graph, Layout } from '../src/types.ts';
import { endpointViolations as portViolations, geometryViolations } from './helpers.ts';

const flip = (g: Graph): Graph => ({ ...g, direction: g.direction === 'LR' ? 'TD' : 'LR' });
const ports = (l: Layout, ruler: ReturnType<typeof pixelRuler>, g: Graph): string[] =>
  portViolations(l, layeredRuler(ruler), l.composition === 'stages' ? flip(g) : g);

const chain = `flowchart LR
  subgraph s1[First]
    a1[Draft]
  end
  subgraph s2[Second]
    b1[Review]
    b2[Revise]
  end
  subgraph s3[Third]
    c1[Publish]
  end
  a1 --> b1
  a1 --> b2
  b1 --> c1
  b2 --> c1`;

describe('composition rule', () => {
  it('picks stages when bands are linked one way and the links are at least as many as the edges inside bands', () => {
    const plan = planZones(parse(chain));
    expect(plan.composition).toBe('stages');
    expect(plan.order).toEqual([0, 1, 2]);
  });

  it('picks lanes when two bands send edges to each other', () => {
    const g = parse('flowchart LR\nsubgraph p[P]\nA\nB\nend\nsubgraph q[Q]\nC\nD\nend\nA --> C\nD --> B');
    expect(planZones(g).composition).toBe('lanes');
  });

  it('picks lanes when edges inside bands outnumber the links between them', () => {
    const g = parse('flowchart LR\nsubgraph p[P]\nA --> B --> C\nend\nsubgraph q[Q]\nD\nend\nC --> D');
    expect(planZones(g).composition).toBe('lanes');
  });

  it('keeps the current behaviour without bands or with one band', () => {
    expect(planZones(parse('flowchart LR\nA --> B')).composition).toBe('lanes');
    expect(planZones(parse('flowchart LR\nsubgraph p[P]\nA --> B\nend')).composition).toBe('lanes');
  });

  it('orders stages by reading order and breaks ties by the order they are written in', () => {
    const g = parse('flowchart LR\nsubgraph z3[Third]\nT\nend\nsubgraph z2[Second]\nS\nend\nsubgraph z1[First]\nF\nend\nS --> T\nF --> T');
    const plan = planZones(g);
    expect(plan.composition).toBe('stages');
    expect(plan.order.map((i) => g.lanes[i]?.id)).toEqual(['z2', 'z1', 'z3']);
    // The band of the first node of the text comes first among bands of one rank.
    const started = parse('flowchart LR\nsubgraph z3[Third]\nT\nend\nsubgraph z2[Second]\nS\nend\nsubgraph z1[First]\nF\nend\nF --> T\nS --> T');
    expect(planZones(started).order.map((i) => started.lanes[i]?.id)).toEqual(['z1', 'z2', 'z3']);
  });

  it('leaves a band that no edge touches out of the decision and puts it last in both compositions', () => {
    const src = 'flowchart LR\nsubgraph idle[Idle]\nX\nend\nsubgraph s1[One]\nA\nend\nsubgraph s2[Two]\nB\nend\nA --> B';
    const g = parse(src);
    const staged = planZones(g);
    expect(staged.composition).toBe('stages');
    expect(staged.order.map((i) => g.lanes[i]?.id)).toEqual(['s1', 's2', 'idle']);
    const lanes = planZones(g, 'lanes');
    expect(lanes.order.map((i) => g.lanes[i]?.id)).toEqual(['s1', 's2', 'idle']);
  });

  it('can be forced either way', () => {
    expect(planZones(parse(chain), 'lanes').composition).toBe('lanes');
    const g = parse('flowchart LR\nsubgraph p[P]\nA\nend\nsubgraph q[Q]\nB\nend\nA --> B\nB --> A');
    expect(planZones(g).composition).toBe('lanes');
    expect(planZones(g, 'stages').composition).toBe('stages');
  });
});

describe('stages drawing', () => {
  for (const [name, ruler] of [['pixel', pixelRuler()], ['cell', cellRuler()]] as const) {
    for (const direction of ['LR', 'TD']) {
      it(`keeps boxes apart and edges off boxes (${name}, ${direction})`, () => {
        const g = parse(chain.replace('flowchart LR', `flowchart ${direction}`));
        const l = layout(g, ruler, ruler === pixelRuler() ? {} : { maxWidth: 160 });
        expect(l.composition).toBe('stages');
        expect(l.direction).toBe(direction);
        expect(l.laneAxis).toBe('along');
        expect(geometryViolations(l)).toEqual([]);
        expect(ports(l, ruler, g)).toEqual([]);
      });
    }
  }

  it('puts the bands of an LR drawing side by side in reading order, with edges running left to right', () => {
    const l = layout(parse(chain), pixelRuler());
    const x = (id: string): number => l.nodes.find((n) => n.id === id)?.x ?? NaN;
    expect(x('a1')).toBeLessThan(x('b1'));
    expect(x('b1')).toBeLessThan(x('c1'));
    for (const e of l.edges) expect((e.points[e.points.length - 1]?.x ?? 0) >= (e.points[0]?.x ?? 0)).toBe(true);
  });

  it('puts the bands of a TD drawing one below the other', () => {
    const l = layout(parse(chain.replace('flowchart LR', 'flowchart TD')), pixelRuler());
    const y = (id: string): number => l.nodes.find((n) => n.id === id)?.y ?? NaN;
    expect(y('a1')).toBeLessThan(y('b1'));
    expect(y('b1')).toBeLessThan(y('c1'));
  });

  it('keeps nodes without edges in their band one place further along, apart from the connected ones', () => {
    const src = `flowchart LR
  subgraph s1[One]
    a1[Start]
  end
  subgraph s2[Two]
    b1[Left] --> b2[Right]
    b3[Loose]
  end
  a1 --> b1`;
    const l = layout(parse(src), pixelRuler(), { composition: 'stages' });
    const node = (id: string) => l.nodes.find((n) => n.id === id);
    expect(node('b3')?.x).toBeGreaterThan(node('b1')?.x ?? Infinity);
  });

  it('puts nodes with no edge at all in a later place than the band nodes that other bands link to', () => {
    const src = `flowchart LR
  subgraph s1[One]
    a1[Start]
  end
  subgraph s2[Two]
    b1[Linked one]
    b2[Linked two]
    b3[Idle one]
    b4[Idle two]
  end
  a1 --> b1
  a1 --> b2`;
    const l = layout(parse(src), pixelRuler());
    expect(l.composition).toBe('stages');
    const x = (id: string): number => l.nodes.find((n) => n.id === id)?.x ?? NaN;
    expect(x('b3')).toBeGreaterThan(x('b1'));
    expect(x('b3')).toBe(x('b4'));
    expect(x('b1')).toBe(x('b2'));
  });

  it('spreads spare width over the gaps without making boxes wider, and stays inside the canvas', () => {
    const l = layout(parse(chain), pixelRuler(), { maxWidth: 1280 });
    const narrow = layout(parse(chain), pixelRuler(), { maxWidth: 700 });
    expect(l.width).toBeGreaterThanOrEqual(1200);
    expect(l.width).toBeLessThanOrEqual(1280);
    expect(narrow.width).toBeLessThan(l.width);
    expect(new Set(l.nodes.map((n) => n.w)).size).toBe(new Set(narrow.nodes.map((n) => n.w)).size);
    expect(geometryViolations(l)).toEqual([]);
  });

  it('is named in the coordinate output', () => {
    const json = selectFrontEnd(chain).json(chain, 'svg', {}) as Layout;
    expect(json.composition).toBe('stages');
    const forced = selectFrontEnd(chain).json(chain, 'svg', { composition: 'lanes' }) as Layout;
    expect(forced.composition).toBe('lanes');
  });
});

function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bands that link forward only, with a few edges inside bands, so that the rule picks stages. */
function staged(seed: number): string {
  const rnd = prng(seed * 7919);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const bands = 2 + pick(3);
  const dir = rnd() < 0.5 ? 'LR' : 'TD';
  const members: string[][] = Array.from({ length: bands }, () => []);
  const count = bands * (1 + pick(3));
  for (let i = 0; i < count; i++) members[i % bands]?.push(`n${i}`);
  const lines = [`flowchart ${dir}`];
  members.forEach((ids, k) => lines.push(`subgraph b${k}[Band ${k}]`, ...ids.map((id) => `${id}[Item ${id.slice(1)}]`), 'end'));
  for (let i = 0; i < count; i++) {
    // Members are dealt round robin: the next one is in the next band (a forward link), the one `bands` later is in the same band.
    if (i + 1 < count && (i + 1) % bands !== 0) lines.push(`n${i} -->${rnd() < 0.3 ? `|e${i}|` : ''} n${i + 1}`);
    if (i + bands < count && rnd() < 0.2) lines.push(`n${i} --> n${i + bands}`);
  }
  return lines.join('\n');
}

describe('stages sweep', () => {
  const rulers = [pixelRuler(), { ...pixelRuler(), nodeGrid: 12, edgeGrid: 2, lanePad: 36, laneGap: 12 }, cellRuler()];
  for (let seed = 1; seed <= 24; seed++) {
    it(`generated staged graph ${seed} has no violation`, () => {
      const g = parse(staged(seed));
      const ruler = rulers[seed % rulers.length] ?? pixelRuler();
      const l = layout(g, ruler, ruler === rulers[2] ? { maxWidth: 140 } : {});
      expect(l.composition).toBe('stages');
      expect(geometryViolations(l)).toEqual([]);
      expect(ports(l, ruler, g)).toEqual([]);
    });
  }
});
