import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import { score } from '../src/layered/choose.ts';
import { MAX_DRAWS } from '../src/layered/refine.ts';
import { assignByStage, assignLayers } from '../src/layered/rows.ts';
import { stageOf } from '../src/layered/stage.ts';
import * as fixtures from './fixtures.ts';
import { geometryViolations } from './helpers.ts';

const stages = (src: string): Record<string, number> => {
  const g = parse(src);
  const rows = assignLayers(g, g.nodes.map(() => 2), Infinity);
  const s = stageOf(g, rows);
  return Object.fromEntries(g.nodes.map((n, i) => [n.id, s[i] ?? NaN]));
};

describe('stage of a node', () => {
  it('moves on by one along an edge inside a lane and stays along an edge between lanes', () => {
    const s = stages('flowchart LR\nsubgraph a[A]\nP --> Q --> R\nend\nsubgraph b[B]\nX\nend\nR --> X\nP --> X');
    expect([s.P, s.Q, s.R]).toEqual([0, 1, 2]);
    expect(s.X).toBe(3);
  });

  it('keeps the main flow when a cycle is cut', () => {
    const s = stages('flowchart LR\nsubgraph a[A]\nP --> Q --> R --> S\nend\nsubgraph b[B]\nX\nend\nS --> X\nX --> P');
    expect([s.P, s.Q, s.R, s.S]).toEqual([0, 1, 2, 3]);
  });

  it('puts a node nobody leads to as late as its partner allows', () => {
    const s = stages('flowchart LR\nsubgraph a[A]\nP --> Q --> R\nL\nend\nsubgraph b[B]\nX\nend\nR --> X\nL --> X');
    expect(s.L).toBe(s.X);
  });

  it('lets nodes of one lane that lead to the same nodes share the later stage', () => {
    const s = stages('flowchart LR\nsubgraph a[A]\nP --> Q --> R\nU\nend\nsubgraph b[B]\nX\nend\nR --> X\nU --> X\nA1[One] --> U');
    expect(s.R).toBe(s.U);
  });

  it('stands a node the flow ends in one stage behind what leads to it', () => {
    const s = stages('flowchart LR\nsubgraph a[A]\nP --> Q\nend\nsubgraph b[B]\nZ\nend\nQ --> Z');
    expect(s.Z).toBe((s.Q ?? 0) + 1);
  });
});

describe('rows by stage', () => {
  it('never puts two nodes of one lane in one row at one stage, and keeps the main flow on the first row', () => {
    const src = 'flowchart LR\nsubgraph a[A]\nP --> Q --> R\nP --> S\nT\nend\nsubgraph b[B]\nX\nend\nR --> X\nS --> X\nT --> X';
    const g = parse(src);
    const base = assignLayers(g, g.nodes.map(() => 2), Infinity);
    const s = stageOf(g, base);
    const rows = assignByStage(g, base, s);
    const seen = new Set<string>();
    g.nodes.forEach((n, i) => {
      const key = `${rows.layer[i]}|${s[i]}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    });
    const firstOfLane = rows.layerLane.indexOf(0);
    for (const id of ['P', 'Q', 'R']) expect(rows.layer[g.nodes.findIndex((n) => n.id === id)]).toBe(firstOfLane);
  });
});

describe('refinement', () => {
  const twoBands = `flowchart LR
  subgraph top[Top]
    t1[Intake]
    t2[Close]
    t3[Open]
  end
  subgraph low[Bottom]
    m1[List] --> m2[Detail] --> m3[History]
    m1 --> m4[Side]
  end
  t3 --> m1
  t2 --> m3
  m4 --> t1`;

  it('is never worse than the same drawing without it', () => {
    for (const src of [...Object.values(fixtures), twoBands]) {
      const g = parse(src);
      for (const ruler of [pixelRuler(), cellRuler()]) {
        const options = ruler === cellRuler() ? { maxWidth: 160 } : {};
        const off = score(layout(g, ruler, { ...options, refine: false }));
        const on = score(layout(g, ruler, options));
        for (let i = 0; i < on.length; i++) {
          if (on[i] === off[i]) continue;
          expect(on[i]).toBeLessThan(off[i] ?? 0);
          break;
        }
      }
    }
  });

  it('gives the same drawing every time and keeps it valid', () => {
    const g = parse(twoBands);
    const a = layout(g, pixelRuler());
    expect(JSON.stringify(a)).toBe(JSON.stringify(layout(g, pixelRuler())));
    expect(geometryViolations(a)).toEqual([]);
    expect(MAX_DRAWS).toBeLessThanOrEqual(200);
  });

  it('can be switched off', () => {
    const g = parse(twoBands);
    const off = layout(g, pixelRuler(), { refine: false });
    expect(geometryViolations(off)).toEqual([]);
    expect(layout(g, pixelRuler(), { refine: false })).toEqual(off);
  });
});
