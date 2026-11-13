import { describe, expect, it } from 'vitest';
import { render, renderText } from '../src/index.ts';

const front = (body: string): string => `---\ntitle: Drawing Title\n---\n${body}`;

const SOURCES: Record<string, string> = {
  flowchart: front('flowchart LR\n    id'),
  class: front('classDiagram\n    class Animal'),
  state: front('stateDiagram-v2\n    [*] --> A'),
  er: front('erDiagram\n    A ||--o{ B : has'),
  sequence: front('sequenceDiagram\n    A->>B: hi'),
  kanban: front('kanban\n  todo[Todo]\n    t1[Task]'),
  requirement: front('requirementDiagram\n    requirement r {\n        id: 1\n        text: t\n        risk: low\n        verifymethod: test\n    }'),
};

const titleText = /<text class="ursula-title ursula-diagram-title[^"]*"[^>]*>([^<]*)<\/text>/u;

describe('diagram title row', () => {
  for (const [name, src] of Object.entries(SOURCES)) {
    it(`${name}: the front-matter title is drawn above the drawing`, () => {
      const svg = render(src);
      expect(svg).toMatch(titleText);
      expect(titleText.exec(svg)?.[1]).toBe('Drawing Title');
      expect(svg).toContain('translate(0 40)');
    });

    it(`${name}: the title is the first text row, then a blank row`, () => {
      const out = renderText(src, 80);
      expect('lines' in out && out.lines.slice(0, 2)).toEqual(['Drawing Title', '']);
    });

    it(`${name}: no title leaves the drawing as it was`, () => {
      const bare = src.replace(/^---\ntitle: Drawing Title\n---\n/u, '');
      expect(render(bare)).not.toContain('ursula-diagram-title');
      const out = renderText(bare, 80);
      expect('lines' in out && out.lines[0]).not.toBe('Drawing Title');
    });
  }

  it('the canvas grows by exactly one title row', () => {
    const height = (svg: string): number => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/u.exec(svg)?.[1]);
    const withTitle = height(render(SOURCES['flowchart'] as string));
    const without = height(render('flowchart LR\n    id'));
    expect(withTitle - without).toBe(40);
  });

  it('a C4 title statement wins over the front-matter title', () => {
    const src = front('C4Context\n    title Own Statement\n    Person(a, "A")');
    expect(titleText.exec(render(src))?.[1]).toBe('Own Statement');
    const out = renderText(src, 80);
    expect('lines' in out && out.lines[0]).toBe('Own Statement');
  });

  it('a C4 front-matter title is drawn when the source has no title statement', () => {
    const out = renderText(front('C4Context\n    Person(a, "A")'), 80);
    expect('lines' in out && out.lines.slice(0, 2)).toEqual(['Drawing Title', '']);
  });

  it('a sequence title statement wins over the front-matter title', () => {
    const src = front('sequenceDiagram\n    title Own Statement\n    A->>B: hi');
    expect(titleText.exec(render(src))?.[1]).toBe('Own Statement');
  });

  it('a title wider than the drawing widens the canvas', () => {
    const long = 'A very long title that is wider than a single node drawing could ever be';
    const svg = render(`---\ntitle: ${long}\n---\nflowchart LR\n    id`);
    expect(Number(/viewBox="0 0 ([\d.]+) /u.exec(svg)?.[1])).toBeGreaterThan(300);
  });

  it('a title longer than the terminal is cut to it', () => {
    const out = renderText(`---\ntitle: ${'x'.repeat(200)}\n---\nflowchart LR\n    id`, 40);
    expect('lines' in out && out.lines[0]?.length).toBeLessThanOrEqual(40);
  });
});
