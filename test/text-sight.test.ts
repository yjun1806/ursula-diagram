import { describe, expect, it } from 'vitest';
import { parse, renderText } from '../src/index.ts';
import { cellWidth } from '../src/metrics.ts';
import { labelsNotShown } from './text-labels.ts';
import { breaksOf } from './text-intact.ts';
import { drawText } from '../src/flowchart-frontend.ts';

const text = (src: string, width: number): string[] => {
  const out = renderText(src, width);
  if ('error' in out) throw new Error(out.error);
  return out.lines;
};
const labelsOf = (src: string): string[] => parse(src).edges.flatMap((e) => (e.label === undefined ? [] : [e.label]));

const LOOP_IN_A_PART = [
  'flowchart TD',
  '  n0(Open)',
  '  n1[Triage ticket]',
  '  n2[환불 심사]',
  '  n3[Pay]',
  '  n4[Pick and pack the order]',
  '  n5[Send]',
  '  n6[Mail]',
  '  n7{Store}',
  '  n8[Undo]',
  '  n9{상담}',
  '  n10[Log]',
  '  n0 ===|done| n9',
  '  n1 --o|no| n8',
  '  n3 <-->|after 2 failed tries| n8',
  '  n9 x--x n1',
  '  n9 --x n10',
  '  n4 --- n6',
  '  n7 -->|on hold| n7',
  '  n2 --- n3',
  '  n0 ---|on hold| n4',
  '  n2 --x|on hold| n10',
  ].join('\n');

const LEFT_OF_A_PACKED_DRAWING = [
  'flowchart TD',
  '  subgraph Out[Outer]',
  '    n0[Triage ticket]',
  '    n1[환불 심사]',
  '    subgraph In[Inner]',
  '      n2[Pay]',
  '      n3[Pick and pack the order]',
  '      n4[Send]',
  '    end',
  '  end',
  '  subgraph Side[Side]',
  '    n5[Mail]',
  '  end',
  '  n6[Store]',
  '  n7[Undo]',
  '  n0 -->|retry| n3',
  '  n1 -.-> n4',
  '  n0 -->|done| n7',
  '  n4 -.-> n3',
  '  n5 ==> n3',
  '  n1 <-->|on hold| n5',
  '  n3 --> n0',
  '  n0 --> n7',
  '  n3 ---|after 2 failed tries| n1',
  ].join('\n');

const AT_THE_RIGHT_EDGE = [
  'graph LR',
  '  n0[요청]',
  '  n1{검증}',
  '  n2[저장]',
  '  n3{에러}',
  '  n4{알림}',
  '  n5[Client]',
  '  n0 --> n1',
  '  n0 -->|done| n2',
  '  n1 -->|after 2 failed tries| n3',
  '  n3 -->|done| n4',
  '  n4 -->|반려| n5',
  ].join('\n');

const WIDE_TEXT_AT_THE_LIMIT = [
  'graph TD',
  '  n0[Q]',
  '  n1[에러]',
  '  n2[에러]',
  '  n3{저장}',
  '  n4{Cache}',
  '  n5{OK}',
  '  n6[API]',
  '  n7{Q}',
  '  n8[검증]',
  '  n9[Q]',
  '  n10[Client]',
  '  n0 --> n1',
  '  n1 --> n2',
  '  n2 --> n3',
  '  n1 --> n4',
  '  n4 -->|통과| n5',
  '  n0 -->|no| n6',
  '  n6 -->|HTTP| n7',
  '  n0 -->|after 2 failed tries| n8',
  '  n1 -->|실패| n9',
  '  n9 -->|반려됨| n10',
  '  n5 --> n1',
  '  n2 -->|HTTP| n1',
  ].join('\n');

const LOOP_AT_THE_LIMIT_A = [
  'flowchart TD',
  '  n0[Open]',
  '  n1[Triage ticket]',
  '  n2{환불 심사}',
  '  n3[Pay]',
  '  n4[Pick and pack the order]',
  '  n5[Send]',
  '  n6[Mail]',
  '  n7[Store]',
  '  n0 ===|반려| n6',
  '  n7 <-->|done| n7',
  '  n3 --x|on hold| n6',
  '  n2 --x n3',
  '  n2 --> n4',
  '  n4 -.-> n6',
  '  n7 --x|실패| n4',
  '  n0 ===|통과| n5',
  '  n6 <==>|done| n7',
  '  n0 --> n6',
  '  n3 -->|on hold| n5',
  '  n1 --> n4',
  '  n0 ==>|after 2 failed tries| n5',
  '  n2 -.- n4',
  '  n1 <-.->|실패| n4',
  ].join('\n');

const LOOP_AT_THE_LIMIT_B = [
  'flowchart TD',
  '  n0[Open]',
  '  n1[Triage ticket]',
  '  n2[환불 심사]',
  '  n3[Pay]',
  '  n4[Pick and pack the order]',
  '  n5[Send]',
  '  n6[Mail]',
  '  n7[Store]',
  '  n8([Undo])',
  '  n9[상담]',
  '  n10([Log])',
  '  n5 <==> n6',
  '  n7 <--> n8',
  '  n3 ---|on hold| n10',
  '  n2 <-.-> n8',
  '  n0 ---|반려| n0',
  '  n3 --x n6',
  '  n1 <==> n9',
  '  n7 --> n8',
  '  n10 o--o n5',
  '  n3 <--> n10',
  '  n3 <-.-> n7',
  '  n1 o--o n5',
  '  n4 --- n10',
  ].join('\n');

const LEFT_OF_A_FULL_DRAWING = [
  'flowchart TD',
  '  n0[Open]',
  '  n1[Triage ticket]',
  '  n2[환불 심사]',
  '  n3[Pay]',
  '  n4[Pick and pack the order]',
  '  n5[Send]',
  '  n6(Mail)',
  '  n7{Store}',
  '  n8[Undo]',
  '  n9[상담]',
  '  n10[Log]',
  '  n5 -->|after 2 failed tries| n8',
  '  n3 -.->|yes| n10',
  '  n0 ---|retry| n10',
  '  n5 <--> n6',
  '  n0 x--x|k| n6',
  '  n6 --> n9',
  '  n1 -.-> n8',
  '  n0 --x|done| n5',
  '  n5 -.-> n8',
  '  n5 --o n9',
  '  n3 x--x|retry| n10',
  '  n8 ===|k| n10',
  '  n1 ==> n10',
  '  n0 x--x|k| n6',
  '  n6 -->|통과| n7',
  '  n8 --o|after 2 failed tries| n5',
  '  n3 x--x|on hold| n10',
  '  n0 --x|after 2 failed tries| n1',
  ].join('\n');

const missing = (src: string, width: number): string[] => labelsNotShown(labelsOf(src), text(src, width)).map((l) => l.text);

describe('the labels of a terminal drawing, once its parts are packed', () => {
  it('are cut only where the packed drawing leaves no room', () => {
    expect(missing(LOOP_IN_A_PART, 120)).toEqual([]);
  });

  it('keep their end only, where writing one in full would keep a part from standing beside another', () => {
    const lines = text(LEFT_OF_A_PACKED_DRAWING, 80);
    expect(lines.length).toBeLessThanOrEqual(31);
    expect(lines.join('\n')).toContain('tries │');
  });

  it('keep their end only, where writing one in full takes the drawing past the limit', () => {
    expect(Math.max(...text(LEFT_OF_A_FULL_DRAWING, 80).map(cellWidth))).toBeLessThanOrEqual(80);
  });
});

describe('a label at the edge of a terminal drawing at its limit', () => {
  it('is written in full where its text fits and only the blank after it does not', () => {
    expect(missing(AT_THE_RIGHT_EDGE, 80)).not.toContain('반려');
    expect(missing(WIDE_TEXT_AT_THE_LIMIT, 60)).not.toContain('통과');
  });

  it('is never cut to its ellipsis alone', () => {
    for (const [src, width] of [[AT_THE_RIGHT_EDGE, 80], [WIDE_TEXT_AT_THE_LIMIT, 60]] as const) expect(text(src, width).join('\n')).not.toMatch(/│ +…/);
  });

  it('of a box that leads to itself is written in full, with narrower boxes where they cross no more lines', () => {
    expect(missing(LOOP_AT_THE_LIMIT_B, 100)).toEqual([]);
  });

  it('stays covered where the narrower boxes that would show it tangle their lines', () => {
    const labels = labelsOf(LOOP_AT_THE_LIMIT_A);
    const drawn = drawText(LOOP_AT_THE_LIMIT_A, 100, {});
    expect(breaksOf(drawn.layout, drawn.lines, labels).tangled).toBe(0);
  });
});
