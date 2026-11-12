import { describe, expect, it, vi } from 'vitest';
import type { Layout } from '../src/types.ts';

// The layouts `route` makes while 500 seeded graphs are drawn are collected, and scored by the new and the old code.
const seen = vi.hoisted(() => ({ layouts: [] as Layout[] }));

vi.mock('../src/layered/route.ts', async (original) => {
  const real = await original<typeof import('../src/layered/route.ts')>();
  return {
    ...real,
    route: (...args: Parameters<typeof real.route>): Layout => {
      const layout = real.route(...args);
      seen.layouts.push(layout);
      return layout;
    },
  };
});

const { render, renderText } = await import('../src/index.ts');
const fresh = await import('../src/layered/choose.ts');
const freshSides = await import('../src/layered/sides.ts');
const freshCentre = await import('../src/layered/centre.ts');
const old = await import('./choose-old.ts');
const oldSides = await import('./sides-old.ts');
const oldCentre = await import('./centre-old.ts');
const freshCheck = await import('../src/layout/check.ts');
const oldCheck = await import('./check-old.ts');

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

/** A copy with boxes and bends moved at random, so that overlaps, diagonals and shared stretches turn up. */
function shaken(l: Layout, rnd: () => number): Layout {
  const snap = (v: number): number => (rnd() < 0.5 ? Math.round(v / 8) * 8 : v);
  return {
    ...l,
    nodes: l.nodes.map((n) => (rnd() < 0.3 ? { ...n, x: snap(n.x + (rnd() - 0.5) * 60), y: snap(n.y + (rnd() - 0.5) * 60) } : n)),
    edges: l.edges.map((e) => ({
      ...e,
      points: e.points.map((p) => (rnd() < 0.25 ? { x: snap(p.x + (rnd() - 0.5) * 40), y: snap(p.y + (rnd() - 0.5) * 40) } : p)),
    })),
  };
}

describe('choose.ts, sides.ts, centre.ts and check.ts on shared segments give what they gave before', () => {
  it('scores the drawings of 500 seeded graphs, and shaken copies of them, the same', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const src = generate(seed);
      render(src);
      renderText(src, 80);
      renderText(src, 120);
    }
    expect(seen.layouts.length).toBeGreaterThan(1000);
    const rnd = prng(99);
    let invalid = 0;
    seen.layouts.forEach((l, i) => {
      const subjects = [l, shaken(l, rnd), shaken(l, rnd)];
      subjects.forEach((s, k) => {
        const tag = [i, k];
        const a = fresh.violations(s);
        if (a > 0) invalid++;
        expect([tag, a]).toEqual([tag, old.violations(s)]);
        expect([tag, fresh.crossingsOf(s)]).toEqual([tag, old.crossingsOf(s)]);
        expect([tag, fresh.score(s)]).toEqual([tag, old.score(s)]);
        expect([tag, fresh.offCentre(s)]).toEqual([tag, old.offCentre(s)]);
        expect([tag, freshSides.mixedSideEnds(s, freshSides.directionsOf(s))]).toEqual([tag, oldSides.mixedSideEnds(s, oldSides.directionsOf(s))]);
        expect([tag, freshCentre.offCentreEnds(s)]).toEqual([tag, oldCentre.offCentreEnds(s)]);
        expect([tag, freshCheck.crossings(s.edges)]).toEqual([tag, oldCheck.crossings(s.edges)]);
        expect([tag, freshCheck.crossingCount(s.edges)]).toEqual([tag, oldCheck.crossingCount(s.edges)]);
      });
    });
    // The shaken copies must reach the branches of the checks, or the comparison says little.
    expect(invalid).toBeGreaterThan(500);
  }, 600_000);
});
