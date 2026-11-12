import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ solve: 0 }));
vi.mock('../src/layout/solve.ts', async (original) => {
  const real = await original<typeof import('../src/layout/solve.ts')>();
  return {
    ...real,
    solve: (...args: Parameters<typeof real.solve>) => {
      calls.solve++;
      return real.solve(...args);
    },
  };
});

const { layout, parse, pixelRuler } = await import('../src/index.ts');
const { Placement } = await import('../src/layout/slots.ts');

const fourteen = `swimlane-beta LR
subgraph a[Intake]
n1[Receive] --> n2[Validate] --> n3[Enrich] --> n4[Queue]
n5[Audit] --> n6[Notify]
n7[Archive]
end
subgraph b[Fulfilment]
m1[Pick] --> m2[Pack] --> m3[Label] --> m4[Ship]
m5[Return] --> m6[Refund]
m7[Close]
end
n4 --> m1
m4 --> n6
n2 --> n5
m2 --> m5
n6 --> n7
m6 --> m7
n3 --> m3`;

describe('slot search', () => {
  it('routes the final assignment once and nothing during the search', () => {
    calls.solve = 0;
    layout(parse(fourteen), pixelRuler(), { maxWidth: Infinity, engine: 'grid' });
    expect(calls.solve).toBe(1);
  });

  it('computes the same cost change incrementally as for the whole assignment', () => {
    const lane = [0, 0, 0, 1, 1, 1];
    const span = [1, 1, 1, 1, 1, 2];
    const edge = (a: number, b: number) => ({ a, b, first: a, second: b, sameLane: lane[a] === lane[b], repeat: 0 });
    const edges = [edge(0, 1), edge(1, 2), edge(3, 4), edge(4, 5), edge(1, 4), edge(2, 5), edge(0, 3)];
    const p = new Placement(2, lane, span, edges, 5, [0, 1, 2, 0, 1, 2], [0, 0, 0, 0, 0, 0]);
    const base = p.total();
    let checked = 0;
    for (let i = 0; i < lane.length; i++) {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c + (span[i] ?? 1) <= 5; c++) {
          if (!p.free(lane[i] ?? 0, r, c, span[i] ?? 1, i) || (c === p.col[i] && r === p.row[i])) continue;
          const { delta, restore } = p.apply([[i, c, r]]);
          expect(p.total() - base).toBeCloseTo(delta, 6);
          restore();
          expect(p.total()).toBeCloseTo(base, 6);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});
