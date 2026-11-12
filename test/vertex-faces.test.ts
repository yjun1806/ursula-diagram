import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler } from '../src/index.ts';
import type { Layout, LayoutEdge } from '../src/index.ts';
import { properCross, segs } from '../src/layered/elbows.ts';

const ruler = pixelRuler();

const edgeOf = (l: Layout, from: string, to: string): LayoutEdge => {
  const e = l.edges.find((q) => q.from === from && q.to === to);
  if (!e) throw new Error(`no edge ${from} -> ${to}`);
  return e;
};

const cross = (a: LayoutEdge, b: LayoutEdge): number => segs(a.points).reduce((n, s) => n + segs(b.points).filter((t) => properCross(s, t)).length, 0);

/** Three zones; a diamond takes one line from the left and sends one down and one back to the left zone. */
const loop = [
  'flowchart TD',
  '  subgraph left["Left"]',
  '    a[One] --> b[Two]',
  '    b --> m[Three]',
  '    o[Done]',
  '    f[Retry]',
  '  end',
  '  subgraph mid["Middle"]',
  '    c{Check?}',
  '    h[Hold]',
  '  end',
  '  subgraph right["Right"]',
  '    r{Ready?}',
  '    p[Pack]',
  '  end',
  '  m --> c',
  '  c -- no --> f',
  '  f --> m',
  '  c -- yes --> h',
  '  h --> r',
  '  r -- yes --> p',
  '  r -- no --> f',
  '  p --> o',
].join('\n');

describe('a diamond end moved to another face', () => {
  it('takes the face whose path crosses the incoming line least, not the first face with room', () => {
    const l = layout(parse(loop), ruler);
    expect(cross(edgeOf(l, 'c', 'f'), edgeOf(l, 'm', 'c'))).toBe(0);
  });

  it('shares no port when a face holds a path', () => {
    const l = layout(parse(loop), ruler);
    expect(l.diagnostics.filter((d) => d.kind === 'shared-port')).toEqual([]);
  });
});
