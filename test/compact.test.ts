import { describe, expect, it } from 'vitest';
import { cellRuler, parse, pixelRuler } from '../src/index.ts';
import { layoutLayered } from '../src/layered/index.ts';
import { score } from '../src/layered/choose.ts';
import { stats } from '../src/layered/stats.ts';
import { geometryViolations } from './helpers.ts';

/** One box of another kind (a stadium) a little wider than the others, which share one width by kind; the skip edge makes the shorter drawing score better. */
const SKIP_ROW = 'flowchart LR\n  a[Go]-->b[Run]\n  b-->c([Verify])\n  c-->d[Save]\n  d-->e[Tell]\n  e-->f[End]\n  a-->e';
/** The same row without the skip edge: both sizes score the same, and three units draw it narrower. */
const PLAIN_ROW = 'flowchart LR\n  a[Go]-->b[Run]\n  b-->c([Verify])\n  c-->d[Save]\n  d-->e[Tell]\n  e-->f[End]';
/** A wider lane sets the size of the drawing, so three units change neither the score nor the size. */
const SAME_SIZE = 'swimlane-beta LR\n  subgraph top[Top]\n    a[Go]-->b[Run]\n    b-->c[Save]\n    c-->d[Tell]\n    d-->e[End]\n    e-->f[Log]\n    f-->g[Sync]\n  end\n  subgraph low[Low]\n    x[Go]-->y([Verify])\n    y-->z[End]\n  end';
/** No box is wider than the common width. */
const EVEN_ROW = 'flowchart LR\n  a[Go]-->b[Run]\n  b-->c[Save]\n  c-->d[Tell]\n  d-->e[End]\n  a-->d';
/** Three slot units make the drawing score worse than whole pairs. One named lane keeps the rows of the lane model: a drawing without zones may be laid out as stages instead. */
const LOSING = `swimlane-beta LR
subgraph main[Main]
n0[Run] --> n1[Tell]
n1[Tell] --> n2[Sync]
n2[Sync] --> n3([Verify])
n3([Verify]) --> n4[End]
n4[End] --> n5([Verify])
n5([Verify]) --> n6[Save]
n6[Save] --> n7[Log]
n7[Log] --> n8([Verify])
n8([Verify]) --> n9[Tell]
n5 --> n8
n4 --> n9
n4 --> n0
n7 --> n8
end`;

const draw = (src: string, options: { quality?: 'fast' | 'best'; compact?: boolean }) => {
  stats.reset();
  const drawn = layoutLayered(parse(src), pixelRuler(), options);
  return { drawn, draws: stats.draws, compact: stats.compact };
};

const widths = (src: string, options: { quality?: 'fast' | 'best'; compact?: boolean }): number[] =>
  draw(src, options).drawn.nodes.map((n) => n.w);

describe('compact box sizes', () => {
  it('best quality gives a slightly wide box three units when that scores better', () => {
    const w = widths(SKIP_ROW, { quality: 'best' });
    const wide = Math.max(...w);
    const rest = Math.max(...w.filter((x) => x !== wide));
    expect(wide).toBeLessThan(2 * rest);
    const result = draw(SKIP_ROW, { quality: 'best' });
    expect(result.compact).toBe(1);
    expect(geometryViolations(result.drawn)).toEqual([]);
  });

  it('fast quality keeps whole pairs', () => {
    const w = widths(SKIP_ROW, { quality: 'fast' });
    expect(w).toEqual(widths(SKIP_ROW, { quality: 'fast', compact: false }));
    expect(Math.max(...w)).toBeGreaterThanOrEqual(2 * Math.min(...w));
    expect(draw(SKIP_ROW, { quality: 'fast' }).compact).toBe(0);
  });

  it('draws once, as before, when no box can take three units', () => {
    const once = draw(EVEN_ROW, { quality: 'best', compact: false });
    const chosen = draw(EVEN_ROW, { quality: 'best' });
    expect(chosen.draws).toBe(once.draws);
    expect(chosen.compact).toBe(0);
    expect(chosen.drawn).toEqual(once.drawn);
  });

  it('draws the whole candidate set twice when a box can take three units', () => {
    const even = draw(SKIP_ROW, { quality: 'best', compact: false });
    const narrow = draw(SKIP_ROW, { quality: 'best', compact: true });
    // Each run counts two more drawings for the spread candidate (one with one width per kind, one at own widths), which a graph without zones makes once per set; the two sets share them.
    expect(draw(SKIP_ROW, { quality: 'best' }).draws).toBe(even.draws + narrow.draws - 2);
  });

  it('takes three units on an equal score when the drawing is smaller', () => {
    const even = draw(PLAIN_ROW, { quality: 'best', compact: false }).drawn;
    const narrow = draw(PLAIN_ROW, { quality: 'best', compact: true }).drawn;
    expect(score(narrow)).toEqual(score(even));
    expect(narrow.width * narrow.height).toBeLessThan(even.width * even.height);
    const chosen = draw(PLAIN_ROW, { quality: 'best' });
    expect(chosen.compact).toBe(1);
    expect(chosen.drawn).toEqual(narrow);
  });

  it('keeps whole pairs when score and size are both equal', () => {
    const even = draw(SAME_SIZE, { quality: 'best', compact: false }).drawn;
    const narrow = draw(SAME_SIZE, { quality: 'best', compact: true }).drawn;
    expect(score(narrow)).toEqual(score(even));
    expect(narrow.width * narrow.height).toBe(even.width * even.height);
    const chosen = draw(SAME_SIZE, { quality: 'best' });
    expect(chosen.compact).toBe(0);
    expect(chosen.drawn).toEqual(even);
  });

  it('keeps whole pairs when three units score worse', () => {
    const even = draw(LOSING, { quality: 'best', compact: false }).drawn;
    const narrow = draw(LOSING, { quality: 'best', compact: true }).drawn;
    expect(score(narrow)[1]).toBeGreaterThan(score(even)[1] as number);
    const chosen = draw(LOSING, { quality: 'best' });
    expect(chosen.compact).toBe(0);
    expect(chosen.drawn).toEqual(even);
  });

  it('leaves top-down drawings and the terminal alone', () => {
    const td = SKIP_ROW.replace('LR', 'TD');
    expect(draw(td, { quality: 'best' }).draws).toBe(draw(td, { quality: 'best', compact: false }).draws);
    const text = (options: { compact?: boolean }) => layoutLayered(parse(SKIP_ROW), cellRuler(), { quality: 'best', ...options });
    expect(text({})).toEqual(text({ compact: false }));
  });
});
