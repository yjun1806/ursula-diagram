import { describe, expect, it } from 'vitest';
import { parse } from '../src/index.ts';
import { assignLayers } from '../src/layered/rows.ts';
import { assignLayersOld } from './rows-old.ts';

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

function generate(seed: number): string {
  const rnd = prng(seed);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const lanes = 1 + pick(3);
  const count = 4 + pick(17);
  const labels = rnd() < 0.5;
  const members: string[][] = Array.from({ length: lanes }, () => []);
  for (let i = 0; i < count; i++) members[pick(lanes)]?.push(`n${i}`);
  const title = (i: number): string => `n${i}[${WORDS[(i * 7 + seed) % WORDS.length]}]`;
  const lines = [`flowchart ${rnd() < 0.5 ? 'LR' : 'TD'}`];
  members.forEach((ids, k) => {
    if (ids.length === 0) return;
    lines.push(`subgraph l${k}[Lane ${k}]`, ...ids.map((id) => title(Number(id.slice(1)))), 'end');
  });
  const edges = Math.min(count + pick(count + 4), 30);
  for (let e = 0; e < edges; e++) {
    const a = pick(count);
    let b = pick(count);
    if (b === a) b = (a + 1) % count;
    if (e < count - 1 && rnd() < 0.6) b = Math.min(count - 1, a + 1);
    if (a === b) continue;
    lines.push(`n${a} -->${labels && rnd() < 0.5 ? `|e${e}|` : ''} n${b}`);
  }
  return lines.join('\n');
}

describe('rows.ts on arrays gives what it gave on maps', () => {
  it('lays 500 seeded graphs over rows the same way, for every fold and capacity', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const graph = parse(generate(seed));
      const rnd = prng(seed * 7919 + 13);
      const units = graph.nodes.map(() => (rnd() < 0.15 ? 4 : 2));
      for (const fold of ['flat', 'head', 'headTail'] as const) {
        for (const capacity of [Infinity, 6, 8 + 2 * Math.floor(rnd() * 4)]) {
          for (const apart of [false, true]) {
            const reduction = rnd() < 0.5 ? 0 : 2;
            const args = [graph, units, capacity, reduction, apart, fold] as const;
            const tag = [seed, fold, capacity, apart];
            expect([tag, assignLayers(...args)]).toEqual([tag, assignLayersOld(...args)]);
          }
        }
      }
    }
  }, 300_000);
});
