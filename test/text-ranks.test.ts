import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, renderText, renderTextLayout } from '../src/index.ts';
import type { Layout } from '../src/index.ts';
import { textCost } from '../src/layout/text-cost.ts';
import { layoutRanks } from '../src/layout/text-ranks.ts';
import { labelsNotShown } from './text-labels.ts';
import { roomViolations } from './text-room.ts';

const text = (src: string, width = 90): string[] => {
  const out = renderText(src, width);
  return 'lines' in out ? out.lines : [];
};

const ranks = (src: string, limit?: number): Layout | undefined => layoutRanks(parse(src), cellRuler(), limit);

const none = { headless: [], underName: [], onRule: [], tight: [], close: [] };

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

const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Eps', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];

/** A flow that branches: every box hangs from one of the three before it, a few lines more join boxes anywhere, some of them backwards. */
function generate(seed: number): string {
  const rnd = prng(seed);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const count = 4 + pick(6);
  const lines = [`flowchart ${rnd() < 0.6 ? 'TD' : 'LR'}`];
  for (let i = 0; i < count; i++) lines.push(`  n${i}[${NAMES[i]}]`);
  for (let i = 1; i < count; i++) lines.push(`  n${Math.max(0, i - 1 - pick(3))} -->${rnd() < 0.3 ? '|yes|' : ''} n${i}`);
  for (let e = pick(3); e > 0; e--) {
    const a = pick(count);
    const b = pick(count);
    if (a !== b) lines.push(`  n${rnd() < 0.8 ? Math.min(a, b) : Math.max(a, b)} -->${rnd() < 0.3 ? '|no|' : ''} n${rnd() < 0.8 ? Math.max(a, b) : Math.min(a, b)}`);
  }
  return lines.join('\n');
}

const DECISION = 'graph TD\n  A[요청] --> B{검증}\n  B -->|통과| C[저장]\n  B -->|실패| D[에러]\n  C --> E[알림]\n  D --> E';
const SERVICES = 'graph LR\n  A[Client] -->|HTTP| B[API] --> C[DB]\n  B --> D[Cache]';

describe('a terminal drawing by ranks', () => {
  it('sets the boxes a box leads to side by side under it, splits its line below it and joins the lines above the box they reach', () => {
    expect(text(DECISION)).toEqual([
      '      ┌──────┐',
      '      │ 요청 │',
      '      └──────┘',
      '         │',
      '         ▼',
      '      ┌──────┐',
      '      │ 검증 │',
      '      └──────┘',
      '         │',
      '   ┌─────┴────┐',
      '   │ 통과     │ 실패',
      '   ▼          ▼',
      '┌──────┐   ┌──────┐',
      '│ 저장 │   │ 에러 │',
      '└──────┘   └──────┘',
      '   │          │',
      '   └────┬─────┘',
      '        ▼',
      '     ┌──────┐',
      '     │ 알림 │',
      '     └──────┘',
    ]);
  });

  it('sets them one above the other beside it in a flow written from left to right', () => {
    expect(text(SERVICES)).toEqual([
      '                                ┌────────┐',
      '                              ┌▶│   DB   │',
      '┌────────┐         ┌────────┐ │ └────────┘',
      '│ Client │─ HTTP ─▶│  API   │─┤',
      '└────────┘         └────────┘ │ ┌────────┐',
      '                              └▶│ Cache  │',
      '                                └────────┘',
    ]);
  });

  it('leaves a cell of line behind the mark at the box a labelled line leaves from left to right', () => {
    const lines = text('flowchart LR\n  a[Alpha] -.->|no| c[Gamma]\n  b[Beta] <-.->|yes| c');
    expect(lines.join('\n')).toContain('│ Beta  │◀┄ yes ┄┘');
    expect(roomViolations(lines)).toEqual(none);
  });

  it('leaves every box as tall as its text', () => {
    for (const src of [DECISION, SERVICES]) expect(textCost(ranks(src) as Layout).blank).toBe(0);
  });

  it('draws a line back to an earlier box up into it, on a port of its own, and a longer line past the ranks between', () => {
    const src = 'graph TD\n  a[Start] --> b{Check}\n  b -->|yes| c[Save]\n  b -->|no| d[Error]\n  c --> e[Notify]\n  d -->|retry| a\n  e --> g[Done]\n  b --> g';
    const drawn = ranks(src) as Layout;
    const lines = renderTextLayout(drawn);
    const box = (id: string): { x: number; y: number; h: number } => drawn.nodes.find((n) => n.id === id) as { x: number; y: number; h: number };
    const back = drawn.edges.find((e) => e.from === 'd' && e.to === 'a') as { points: Array<{ x: number; y: number }> };
    expect(back.points.at(-1)?.y).toBe(box('a').y + box('a').h);
    expect(lines.join('\n')).toContain('▲ retry');
    expect(box('g').y).toBeGreaterThan(box('e').y);
    expect(roomViolations(lines)).toEqual(none);
    expect(labelsNotShown(['yes', 'no', 'retry'], lines)).toEqual([]);
  });

  it('leaves a cell of line between the two arrowheads of a line that points both ways', () => {
    const lines = renderTextLayout(ranks('flowchart TD\n  a[Alpha] <--> b[Beta]\n  a --> c[Gamma]\n  b <--> d[Delta]') as Layout);
    expect(roomViolations(lines)).toEqual(none);
    const up = lines.findIndex((line, y) => y > 6 && line.includes('▲'));
    expect([lines[up], lines[up + 1], lines[up + 2]].map((row) => (row ?? '').trim())).toEqual(['▲', '│', '▼']);
  });

  it('is not made of a chain, of a graph in bands, or of two lines between the same boxes', () => {
    expect(ranks('flowchart TD\n  a --> b\n  b --> c')).toBeUndefined();
    expect(ranks('flowchart TD\n  subgraph s[S]\n  a --> b\n  end\n  a --> c\n  a --> d')).toBeUndefined();
    expect(ranks('flowchart TD\n  a --> b\n  a --> c\n  c --> a')).toBeUndefined();
  });

  it('is not made wider than the width it is given', () => {
    const wide = (ranks(DECISION) as Layout).width;
    expect(ranks(DECISION, wide)).toBeDefined();
    expect(ranks(DECISION, wide - 1)).toBeUndefined();
  });

  it('keeps its boxes apart, its arrowheads on their lines and its labels in sight', () => {
    let made = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const src = generate(seed);
      const drawn = ranks(src, 120);
      if (drawn === undefined) continue;
      made++;
      const lines = renderTextLayout(drawn);
      const boxes = drawn.nodes;
      for (const a of boxes) for (const b of boxes) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, src).toBe(true);
      expect(roomViolations(lines), src).toEqual(none);
      expect(labelsNotShown(parse(src).edges.flatMap((e) => (e.label === undefined ? [] : [e.label])), lines), src).toEqual([]);
      expect(textCost(drawn).hidden, src).toBe(0);
    }
    expect(made).toBeGreaterThan(40);
  });
});

describe('the choice between a drawing by ranks and the usual one', () => {
  const KEPT = ['crossings', 'touches', 'cut', 'blank', 'hidden', 'crossed'] as const;

  it('takes the drawing by ranks only where it loses nothing and is not much longer', () => {
    let taken = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const graph = parse(generate(seed));
      const [chosen, usual, byRanks] = [layout(graph, cellRuler(), { maxWidth: 100 }), layout(graph, cellRuler(), { maxWidth: 100, ranked: false }), layoutRanks(graph, cellRuler(), 100)];
      if (byRanks === undefined) {
        expect(chosen).toEqual(usual);
        continue;
      }
      const [other, cost] = [textCost(byRanks), textCost(usual)];
      const wins = KEPT.every((k) => other[k] <= cost[k]) && other.rows <= cost.rows * 1.1 + 2;
      expect(renderTextLayout(chosen)).toEqual(renderTextLayout(wins ? byRanks : usual));
      if (wins) taken++;
    }
    expect(taken).toBeGreaterThan(20);
  });

  it('leaves a quick drawing and a drawing whose composition is named as they were', () => {
    const graph = parse(DECISION);
    expect(layout(graph, cellRuler(), { maxWidth: 90, quick: true })).toEqual(layout(graph, cellRuler(), { maxWidth: 90, quick: true, ranked: false }));
    expect(layout(graph, cellRuler(), { maxWidth: 90, composition: 'lanes' })).toEqual(layout(graph, cellRuler(), { maxWidth: 90, composition: 'lanes', ranked: false }));
  });
});

describe('the bands of the subgraphs of a flowchart in a terminal', () => {
  it('run alongside the flow when more lines then lead the way it is written', () => {
    expect(text('graph LR\n  subgraph a[접수]\n  A[요청] --> B[검증]\n  end\n  subgraph b[처리]\n  C[저장] --> D[알림]\n  end\n  B --> C')).toEqual([
      '── 접수 ─────────────────────────',
      '',
      '┌───────┐   ┌───────┐',
      '│ 요청  │──▶│ 검증  │',
      '└───────┘   └───────┘',
      '                │',
      '── 처리 ────────┼────────────────',
      '                ▼',
      '            ┌───────┐   ┌───────┐',
      '            │ 저장  │──▶│ 알림  │',
      '            └───────┘   └───────┘',
    ]);
  });

  it('follow one another when the lines lead from band to band', () => {
    const lines = text('flowchart LR\n  subgraph early[Early]\n    hub[Source]\n  end\n  subgraph late[Late]\n    t1[One]\n    t2[Two]\n    t3[Three]\n  end\n  hub --> t1\n  hub --> t2\n  hub --> t3');
    expect(lines[0]).toMatch(/^Early +Late$/);
  });

  it('follow one another when the bands alongside the flow do not fit the width', () => {
    const src = 'graph LR\n  subgraph a[접수]\n  A[요청] --> B[검증]\n  end\n  subgraph b[처리]\n  C[저장] --> D[알림]\n  end\n  B --> C';
    expect(text(src, 21)[0]).toMatch(/^접수 +처리$/);
  });
});

describe('the drawing by ranks of a terminal flow', () => {
  const LOGIN = [
    'flowchart TD',
    '  start[Start] --> input[Enter email and password]',
    '  input --> valid{Format valid?}',
    '  valid -- No --> err1[Show format error]',
    '  err1 --> input',
    '  valid -- Yes --> auth{Credentials match?}',
    '  auth -- No --> count{Three failures?}',
    '  count -- No --> err2[Show wrong password]',
    '  err2 --> input',
    '  count -- Yes --> lock[Lock account]',
    '  lock --> mail[Send unlock email]',
    '  mail --> done[End]',
    '  auth -- Yes --> mfa{Two-factor on?}',
    '  mfa -- Yes --> code[Ask for code]',
    '  code --> check{Code correct?}',
    '  check -- No --> err2',
    '  check -- Yes --> home[Open home]',
    '  mfa -- No --> home',
    '  home --> done',
  ].join('\n');

  it('is not taken where it is longer than the usual drawing by more than a tenth and two rows', () => {
    const usual = renderTextLayout(layout(parse(LOGIN), cellRuler(), { maxWidth: 100, ranked: false }));
    const byRanks = renderTextLayout(layout(parse(LOGIN), cellRuler(), { maxWidth: 100, ranked: true }));
    expect(byRanks.length).toBeGreaterThan(usual.length * 1.1 + 2);
    expect(renderTextLayout(layout(parse(LOGIN), cellRuler(), { maxWidth: 100 }))).toEqual(usual);
  });

  it('is left out of a drawing made without room', () => {
    const src = 'graph TD\n  A[요청] --> B{검증}\n  B -->|통과| C[저장]\n  B -->|실패| D[에러]\n  C --> E[알림]\n  D --> E';
    expect(layout(parse(src), cellRuler(), { maxWidth: 90, room: false })).toEqual(layout(parse(src), cellRuler(), { maxWidth: 90, room: false, ranked: false }));
  });
});
