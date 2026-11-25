import { describe, expect, it } from 'vitest';
import { cellRuler, cellWidth, layout, parse, renderText } from '../src/index.ts';

function lines(src: string, width = 200): string[] {
  const r = renderText(src, width, { quality: 'best' });
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
      "┌─────────┐       ┌─────────┐
      │  Start  │─ go ─▶│ Finish  │
      └─────────┘       └─────────┘"
    `);
  });

  it('draws a small TD graph', () => {
    expect(lines('flowchart TD\nA[Start] --> B[Mid]\nA --> C[Side]\nB --> D[End]\nC --> D').join('\n')).toMatchInlineSnapshot(`
      "      ┌───────┐
            │ Start │
            └───────┘
                │
          ┌─────┴─────┐
          ▼           ▼
      ┌───────┐   ┌───────┐
      │  Mid  │   │ Side  │
      └───────┘   └───────┘
          │           │
          └─────┬─────┘
                ▼
            ┌───────┐
            │  End  │
            └───────┘"
    `);
  });

  it('keeps borders aligned around Korean labels', () => {
    const src = 'flowchart LR\nA[주문 접수] --> B[결제 확인<br>카드]';
    const l = layout(parse(src), cellRuler(), { maxWidth: 200 });
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
    const r = renderText('flowchart LR\nA --> B --> C', 4);
    expect('error' in r).toBe(true);
  });

  it('returns an error for unparseable input', () => {
    const r = renderText('flowchart LR\nA ~~ B', 80);
    expect(r).toMatchObject({ error: expect.stringContaining('line 2'), line: 2 });
  });

  it('uses heavy and dotted line glyphs', () => {
    const out = lines('flowchart LR\nA ==> B\nA -.-> C\nB --> D\nC --> D').join('\n');
    expect(out).toContain('━');
    expect(out).toMatch(/[┄┆]/);
  });

  it('adds a legend line below the drawing when two or more styles are used', () => {
    const out = lines('flowchart LR\nA ==> B\nA -.-> C\nB --> D\nC --> D');
    expect(out[out.length - 1]).toMatch(/^\s*── Flow {3}━━ Request {3}┄┄ Pending$/);
    expect(out[out.length - 2]).toBe('');
  });

  it('omits the legend with one style, with legend:false, and renames captions', () => {
    const src = 'flowchart LR\nA ==> B\nA -.-> C';
    expect(lines('flowchart LR\nA --> B').join('\n')).not.toContain('Flow');
    const off = renderText(src, 200, { legend: false });
    if ('error' in off) throw new Error(off.error);
    expect(off.lines.join('\n')).not.toContain('Request');
    const named = renderText(src, 200, { legend: { thick: 'Call' } });
    if ('error' in named) throw new Error(named.error);
    expect(named.lines[named.lines.length - 1]).toContain('━━ Call');
  });
});
