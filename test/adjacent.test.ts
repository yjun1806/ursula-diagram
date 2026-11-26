import { describe, expect, it } from 'vitest';
import { drawText } from '../src/flowchart-frontend.ts';
import { renderTextLayout } from '../src/index.ts';
import type { Layout } from '../src/index.ts';
import { breaksOf } from './text-intact.ts';

/** Two lines back to the first box and two out of the second, every pair of them meeting the box side by side. */
const LOOPS = [
  'flowchart LR',
  '  write[Mermaid를 쓴다] --> draw[그리고 점검한다<br>--check]',
  '  draw -->|오류| err[어디·무엇·어떻게<br>줄·칸·did you mean·예시]',
  '  err --> write',
  '  draw -->|교차·꺾임| detail[어느 선이 몇째 줄인지]',
  '  detail --> write',
  '  draw -->|성공| done[그림]',
].join('\n');

const labelsOf = (l: Layout): string[] => l.edges.flatMap((e) => (e.label === undefined ? [] : [e.label.text]));

/** The rows with the text of one row from column `x` on written over. */
const over = (lines: readonly string[], y: number, x: number, text: string): string[] =>
  lines.map((line, k) => (k === y ? [...[...line.padEnd(x + text.length)].slice(0, x), ...text, ...[...line].slice(x + text.length)].join('') : line));

/** The same graph in English: the label beside the line that leaves the second box needs boxes a cell wider. */
const LOOPS_EN = [
  'flowchart LR',
  '  write[Write Mermaid] --> draw[Draw and check<br>--check]',
  '  draw -->|error| err[Where, what, how<br>line, column, did you mean, example]',
  '  err --> write',
  '  draw -->|crossing| detail[Which line, which row]',
  '  detail --> write',
  '  draw -->|ok| done[Drawing]',
].join('\n');

describe('arrowheads and lines side by side in a terminal drawing', () => {
  it.each([LOOPS, LOOPS_EN])('keep a blank cell between two arrowheads into one side of a box, and between two lines out of one box (%#)', (src) => {
    const { layout, lines } = drawText(src, 100, {});
    const drawing = lines.join('\n');
    expect(drawing).not.toMatch(/▲▲|▼▼/);
    expect(drawing).not.toContain('││');
    const breaks = breaksOf(layout, lines, labelsOf(layout));
    expect(breaks.adjacentHeads).toBe(0);
    expect(breaks.adjacentLines).toBe(0);
    expect(breaks.crowdedLabels).toBe(0);
  });

  it('count two arrowheads of one way in neighbouring cells', () => {
    const { layout, lines } = drawText(LOOPS, 100, {});
    const heads = lines.findIndex((line) => /▲ ▲/.test(line));
    const x = [...(lines[heads] ?? '')].indexOf('▲');
    expect(breaksOf(layout, over(lines, heads, x, '▲▲ '), labelsOf(layout)).adjacentHeads).toBe(1);
  });

  it('count two lines of one box that run in neighbouring columns', () => {
    const box = (id: string, x: number, y: number): Layout['nodes'][number] => ({ id, lane: '', rank: 0, span: 1, row: 0, x, y, w: 7, h: 3, title: id, lines: [], shape: 'rect' });
    const laid: Layout = {
      width: 20,
      height: 12,
      direction: 'TD',
      laneAxis: 'across',
      lanes: [],
      nodes: [box('A', 0, 0), box('B', 0, 9), box('C', 10, 9)],
      edges: [
        { from: 'A', to: 'B', style: 'normal', points: [{ x: 3.5, y: 3 }, { x: 3.5, y: 9 }] },
        { from: 'A', to: 'C', style: 'normal', points: [{ x: 4.5, y: 3 }, { x: 4.5, y: 6.5 }, { x: 13.5, y: 6.5 }, { x: 13.5, y: 9 }] },
      ],
      diagnostics: [],
    };
    const lines = renderTextLayout(laid);
    expect(lines.join('\n')).toContain('││');
    expect(breaksOf(laid, lines, []).adjacentLines).toBe(1);
  });
});
