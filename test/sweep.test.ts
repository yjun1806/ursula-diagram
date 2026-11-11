import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import type { Ruler } from '../src/metrics.ts';
import { endpointViolations, geometryViolations } from './helpers.ts';

/** Small deterministic generator (mulberry32). */
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

/** A graph of 1-3 lanes, 4-16 nodes, and forward, cross-lane and backward edges, with or without labels. */
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

const variants: Array<[string, Ruler]> = [
  ['pixel', pixelRuler()],
  ['grid 12/2', { ...pixelRuler(), nodeGrid: 12, edgeGrid: 2, lanePad: 36, laneGap: 12 }],
  ['grid 24/1', { ...pixelRuler(), nodeGrid: 24, edgeGrid: 1, lanePad: 48, laneGap: 24, rowGap: 48 }],
  ['pitch 16', { ...pixelRuler(), portPitch: 16 }],
];

describe('generated graphs', () => {
  for (let seed = 1; seed <= 60; seed++) {
    it(`graph ${seed} keeps every edge on its boxes, at ports`, () => {
      const src = generate(seed);
      const graph = parse(src);
      const [name, ruler] = variants[seed % variants.length] ?? variants[0] ?? ['pixel', pixelRuler()];
      for (const maxWidth of [1280, 800, Infinity]) {
        const l = layout(graph, ruler, { maxWidth });
        expect([name, maxWidth, geometryViolations(l).filter((v) => v.includes('border'))]).toEqual([name, maxWidth, []]);
        expect([name, maxWidth, endpointViolations(l, ruler, graph)]).toEqual([name, maxWidth, []]);
      }
    });
  }

  it('draws the text ruler with every edge on its boxes', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const graph = parse(generate(seed));
      const l = layout(graph, cellRuler(), { maxWidth: 120 });
      expect(geometryViolations(l).filter((v) => v.includes('border'))).toEqual([]);
    }
  });
});
