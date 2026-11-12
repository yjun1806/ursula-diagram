import { describe, expect, it } from 'vitest';
import { parse } from '../src/index.ts';
import { assignLayers } from '../src/layered/rows.ts';

const src = `swimlane-beta LR
  subgraph up[Up]
    a[Source]
    z[Sink]
  end
  subgraph down[Down]
    e[Entry] --> h[Head] --> m[Middle] --> t[Tail]
    s[Single]
  end
  a --> e
  t --> z`;

describe('folding the flow of a lane', () => {
  const g = parse(src);
  const units = g.nodes.map(() => 2);
  const rowOf = (fold: 'flat' | 'head' | 'headTail'): Map<string, number> => {
    const r = assignLayers(g, units, Infinity, 0, false, fold);
    return new Map(g.nodes.map((n, i) => [n.id, r.layerRow[r.layer[i] ?? 0] ?? 0] as const));
  };

  it('keeps the flow on one row when flat', () => {
    const rows = rowOf('flat');
    expect(new Set(['e', 'h', 'm', 't'].map((id) => rows.get(id))).size).toBe(1);
  });

  it('puts the entry on the first row and the rest of the flow on the next, by the head', () => {
    const rows = rowOf('head');
    expect(rows.get('e')).toBe(0);
    expect(['h', 'm', 't'].map((id) => rows.get(id))).toEqual([1, 1, 1]);
  });

  it('leaves the tail where it is when it leaves for a lane above', () => {
    const rows = rowOf('headTail');
    // The tail leaves for the lane above, so it is not folded.
    expect(rows.get('t')).toBe(rows.get('m'));
  });
});
