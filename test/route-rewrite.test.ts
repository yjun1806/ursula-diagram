import { describe, expect, it, vi } from 'vitest';
import type { Layout } from '../src/types.ts';

// Every call of `route` in a full render is also made on the code before the rewrite; the two layouts must be equal.
const seen = vi.hoisted(() => ({ calls: 0, wrong: [] as string[] }));

vi.mock('../src/layered/route.ts', async (original) => {
  const real = await original<typeof import('../src/layered/route.ts')>();
  const { routeOld: old } = await import('./route-old.ts');
  return {
    ...real,
    route: (...args: Parameters<typeof real.route>): Layout => {
      const a = real.route(...args);
      // The code before the rewrite gives every line end a port of its own: a drawing whose lines share ports is compared drawn that way.
      const [frame, l, layers, start, plan, bundles] = args;
      const b = old(frame, l, layers, start, plan);
      seen.calls++;
      const own = bundles === undefined || bundles.size === 0 ? a : real.route(frame, l, layers, start, plan);
      if (JSON.stringify(own) !== JSON.stringify(b)) seen.wrong.push(JSON.stringify(args[0].graph.nodes.map((n) => n.id)));
      return a;
    },
  };
});

const { render, renderText } = await import('../src/index.ts');

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

describe('route.ts on number arrays gives what it gave on objects', () => {
  it('draws 500 seeded graphs, in pixels and in text, with equal layouts', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const src = generate(seed);
      render(src);
      renderText(src, 80);
      renderText(src, 120);
    }
    expect(seen.calls).toBeGreaterThan(1000);
    expect(seen.wrong).toEqual([]);
  }, 600_000);
});
