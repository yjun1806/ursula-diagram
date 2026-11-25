import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, renderText, renderTextLayout } from '../src/index.ts';
import { textCost } from '../src/layout/text-cost.ts';
import { labelsNotShown } from './text-labels.ts';

const text = (src: string, width = 80): string[] => {
  const out = renderText(src, width);
  return 'lines' in out ? out.lines : [];
};

const labelsOf = (src: string): string[] => parse(src).edges.flatMap((e) => (e.label === undefined ? [] : [e.label]));

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

const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Eps', 'Zeta', 'Eta', 'Theta', 'Iota'];
const LABELS = ['yes', 'no', 'retry', 'on hold', 'after two tries'];

/** A flowchart of a few boxes whose lines mostly carry a label, some of them back to an earlier box and one, at most, to the box itself. */
function generate(seed: number): string {
  const rnd = prng(seed);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const count = 3 + pick(6);
  const lines = [`flowchart ${rnd() < 0.7 ? 'TD' : 'LR'}`];
  for (let i = 0; i < count; i++) lines.push(`  n${i}[${NAMES[i]}]`);
  let loops = 0;
  for (let e = 0, edges = count - 1 + pick(count); e < edges; e++) {
    const a = pick(count);
    const b = pick(count);
    if (a === b && loops++ > 0) continue;
    const [from, to] = rnd() < 0.8 ? [Math.min(a, b), Math.max(a, b)] : [a, b];
    lines.push(`  n${from} -->${rnd() < 0.7 ? `|${LABELS[pick(LABELS.length)]}|` : ''} n${to}`);
  }
  return lines.join('\n');
}

const DECISION = 'graph TD\n  A[요청] --> B{검증}\n  B -->|통과| C[저장]\n  B -->|실패| D[에러]\n  C --> E[알림]\n  D --> E';

describe('the check of the labels of a terminal drawing', () => {
  it('finds a label of which only the end is left', () => {
    expect(labelsNotShown(['통과', '실패'], ['과 │     │', '   │ 실패'])).toEqual([{ text: '통과', missing: 1, cut: false }]);
  });

  it('tells a label cut short with an ellipsis apart', () => {
    expect(labelsNotShown(['after two tries'], ['│ after t… │'])).toEqual([{ text: 'after two tries', missing: 1, cut: true }]);
  });

  it('counts every line that carries the same text', () => {
    expect(labelsNotShown(['no', 'no'], ['│ no', '│'])).toEqual([{ text: 'no', missing: 1, cut: false }]);
    expect(labelsNotShown(['no', 'no'], ['│ no', '│ no'])).toEqual([]);
  });
});

describe('the labels of a terminal drawing', () => {
  it('stand right of an upright line where the place left of it lies before the first column', () => {
    const drawn = layout(parse(DECISION), cellRuler(), { maxWidth: 90, ranked: false });
    const lines = renderTextLayout(drawn);
    expect(labelsNotShown(['통과', '실패'], lines)).toEqual([]);
    expect(lines).toContain('   │ 통과   │    │      │');
    expect(Math.min(...drawn.edges.flatMap((e) => (e.label === undefined ? [] : [e.label.x])))).toBeGreaterThanOrEqual(0);
  });

  it('move the whole drawing to the right where no place beside the line is free', () => {
    const src = 'graph TD\n  a[요청] -->|통과| b{검증}\n  b -->|retry| c{저장}\n  c -->|after 2 failed tries| d[에러]\n  d -->|반려| e[알림]\n  d --> f[Client]\n  a --> e\n  c --> e';
    const lines = renderTextLayout(layout(parse(src), cellRuler(), { maxWidth: 120, ranked: false }));
    expect(labelsNotShown(labelsOf(src), lines)).toEqual([]);
    expect(lines.some((line) => line.includes('…'))).toBe(false);
    expect(lines.some((line) => line.startsWith(' after 2 failed tries │'))).toBe(true);
  });

  it('never move onto the line of another edge', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const drawn = layout(parse(generate(seed)), cellRuler(), { maxWidth: 80, ranked: false });
      expect(textCost(drawn).crossed, generate(seed)).toBeLessThanOrEqual(textCost(layout(parse(generate(seed)), cellRuler(), { maxWidth: 80, ranked: false, room: false })).crossed);
    }
  });

  it('bring the rows they need to the top of a drawing where they stand above its first row', () => {
    const er = 'erDiagram\n  E2 |o--|{ E1 : has\n  E1 ||--|{ E0 : owns\n  E2 }o--|| E2 : owns\n  E2 |o--o| E0 : places order';
    expect(labelsNotShown(['has', 'owns', 'owns', 'places order'], text(er, 60))).toEqual([]);
    const state = 'stateDiagram-v2\n[*] --> S0\nstate Outer {\n  [*] --> I0\n  I0 --> I1 : go\n  I1 --> I0\n  I1 --> [*]\n}\nS0 --> Outer\nS0 --> S0 : after 2 failed tries\nS0 --> S1 : done\nS0 --> S1';
    expect(labelsNotShown(['go', 'after 2 failed tries', 'done'], text(state))).toEqual([]);
  });

  it('stand beside the line of a box that leads to itself', () => {
    const src = 'flowchart TD\n  a[Alpha] --> b[Beta]\n  b -->|retry| b\n  b --> c[Gamma]';
    expect(labelsNotShown(labelsOf(src), text(src))).toEqual([]);
  });

  it('are written in full in every drawing of a few boxes', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const src = generate(seed);
      for (const width of [80, 120]) expect(labelsNotShown(labelsOf(src), text(src, width)), `${src}\n${width}`).toEqual([]);
    }
  });
});
