import { describe, expect, it } from 'vitest';
import { drawText } from '../src/flowchart-frontend.ts';
import { cellWidth } from '../src/metrics.ts';
import { geometryViolations } from './helpers.ts';

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

describe('terminal drawings of generated graphs', () => {
  it('have no violation at widths 80 and 120; drawings wider than the width are counted', () => {
    let wider = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const width of [80, 120]) {
        const drawn = drawText(generate(seed), width, {});
        expect([seed, width, geometryViolations(drawn.layout)]).toEqual([seed, width, []]);
        if (Math.max(0, ...drawn.lines.map(cellWidth)) > width) wider++;
      }
    }
    // Known: four of the 80 drawings stay wider than the width after folding; the count must not grow.
    expect(wider).toBeLessThanOrEqual(4);
  }, 600000);
});
