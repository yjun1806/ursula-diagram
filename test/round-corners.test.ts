import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, renderText, renderTextLayout } from '../src/index.ts';
import { breaksOf } from './text-intact.ts';

const text = (src: string, charset?: 'ascii'): string => {
  const r = renderText(src, 100, charset === undefined ? {} : { charset });
  if ('error' in r) throw new Error(r.error);
  return r.lines.join('\n');
};

describe('the corners of a box in a terminal drawing', () => {
  it('are rounded for a node box', () => {
    expect(text('flowchart LR\nA[Start] --> B[Finish]')).toBe(
      ['╭─────────╮   ╭─────────╮', '│  Start  │──▶│ Finish  │', '╰─────────╯   ╰─────────╯'].join('\n'),
    );
  });

  it('are rounded for a box with compartments', () => {
    const drawn = text('classDiagram\nclass Order {\n  +id int\n  +total() int\n}');
    expect(drawn).toContain('╭');
    expect(drawn).toContain('├');
    expect(drawn).not.toContain('┌');
  });

  it('keep the folded corner of a note', () => {
    const note = text('classDiagram\nclass Order\nnote for Order "paid once"');
    expect(note).toContain('┒');
  });

  it('are rounded for the head of a sequence participant, and square for a note and a frame', () => {
    const drawn = text('sequenceDiagram\nA->>B: hi\nNote over A: wait\nloop every day\n  B->>A: ok\nend');
    const rows = drawn.split('\n');
    expect(rows[0]).toMatch(/^╭─+╮ +╭─+╮$/);
    // The frame of the loop is square: lifelines cross its rules.
    expect(drawn).toMatch(/┌┼ LOOP/);
    expect(drawn).toMatch(/└┼─+┼─+┘/);
  });

  it('are + in ascii', () => {
    expect(text('flowchart LR\nA[Start] --> B[Finish]', 'ascii')).toBe(
      ['+---------+   +---------+', '|  Start  |-->| Finish  |', '+---------+   +---------+'].join('\n'),
    );
  });

  it('are a whole box to the breakage check, and a corner written over breaks it', () => {
    const graph = parse('flowchart LR\nA[Start] --> B[Finish]');
    const laid = layout(graph, cellRuler(), { maxWidth: 100 });
    const lines = renderTextLayout(laid);
    expect(breaksOf(laid, lines, []).brokenBoxes).toBe(0);
    const squared = lines.map((l, i) => (i === 0 ? `┌${l.slice(1)}` : l));
    expect(breaksOf(laid, squared, []).brokenBoxes).toBe(1);
  });
});
