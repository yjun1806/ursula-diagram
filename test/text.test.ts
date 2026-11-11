import { describe, expect, it } from 'vitest';
import { cellRuler, cellWidth, layout, parse, renderText } from '../src/index.ts';

function lines(src: string, width = 200): string[] {
  const r = renderText(src, width);
  if ('error' in r) throw new Error(r.error);
  return r.lines;
}

/** Expands a line into terminal cells: a wide character occupies two. */
function cells(line: string): string[] {
  const out: string[] = [];
  for (const ch of line) {
    out.push(ch);
    if (cellWidth(ch) === 2) out.push('');
  }
  return out;
}

describe('renderText', () => {
  it('draws a small LR graph', () => {
    expect(lines('flowchart LR\nA[Start] -->|go| B[Finish]').join('\n')).toMatchInlineSnapshot(`
      "

        ┌────────┐      ┌────────┐
        │ Start  │─ go ▶│ Finish │
        └────────┘      └────────┘"
    `);
  });

  it('draws a small TD graph', () => {
    expect(lines('flowchart TD\nA[Start] --> B[Mid]\nA --> C[Side]\nB --> D[End]\nC --> D').join('\n')).toMatchInlineSnapshot(`
      "

        ┌───────┐
        │ Start │
        └───────┘
            │ │
            │ │
            │ └────────┐
            ▼          ▼
        ┌───────┐  ┌───────┐
        │  Mid  │  │ Side  │
        └───────┘  └───────┘
            │          │
            │          │
            │ ┌────────┘
            ▼ ▼
        ┌───────┐
        │  End  │
        └───────┘"
    `);
  });

  it('keeps borders aligned around Korean labels', () => {
    const src = 'flowchart LR\nA[주문 접수] --> B[결제 확인<br>카드]';
    const l = layout(parse(src), cellRuler());
    const out = lines(src);
    for (const n of l.nodes) {
      const mid = cells(out[Math.round(n.y) + 1] ?? '');
      expect(mid[Math.round(n.x)]).toBe('│');
      expect(mid[Math.round(n.x + n.w) - 1]).toBe('│');
      const top = cells(out[Math.round(n.y)] ?? '');
      expect(top[Math.round(n.x)]).toBe('┌');
      expect(top[Math.round(n.x + n.w) - 1]).toBe('┐');
    }
    expect(out.some((s) => s.includes('주문 접수'))).toBe(true);
  });

  it('returns an error when the drawing is too narrow', () => {
    const r = renderText('flowchart LR\nA --> B --> C', 10);
    expect('error' in r).toBe(true);
  });

  it('returns an error for unparseable input', () => {
    const r = renderText('flowchart LR\nA --x B', 80);
    expect(r).toEqual({ error: expect.stringContaining('line 2') });
  });

  it('uses heavy and dotted line glyphs', () => {
    const out = lines('flowchart LR\nA ==> B\nA -.-> C\nB --> D\nC --> D').join('\n');
    expect(out).toContain('━');
    expect(out).toMatch(/[┄┆]/);
  });
});
