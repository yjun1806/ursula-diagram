// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { cellWidth, render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';
import { layoutKanban } from '../src/kanban/layout.ts';
import { parseKanban } from '../src/kanban/parse.ts';
import { pixelRuler } from '../src/metrics.ts';
import type { SceneBox, SceneText } from '../src/types.ts';

const overview = `kanban
  column1[Column Title]
    task1[Task Description]`;

const metadataKeys = `kanban
todo[Todo]
  id3[Update Database Function]@{ ticket: MC-2037, assigned: 'knsv', priority: 'High' }`;

const full = `---
config:
  kanban:
    ticketBaseUrl: 'https://mermaidchart.atlassian.net/browse/#TICKET#'
---
kanban
  Todo
    [Create Documentation]
    docs[Create Blog about the new diagram]
  [In progress]
    id6[Create renderer so that it works in all cases. We also add some extra text here for testing purposes. And some more just for the extra flare.]
  id9[Ready for deploy]
    id8[Design grammar]@{ assigned: 'knsv' }
  id10[Ready for test]
    id4[Create parsing tests]@{ ticket: MC-2038, assigned: 'K.Sveidqvist', priority: 'High' }
    id66[last item]@{ priority: 'Very Low', assigned: 'knsv' }
  id11[Done]
    id5[define getData]
    id2[Title of diagram is more than 100 chars when user duplicates diagram with 100 char]@{ ticket: MC-2036, priority: 'Very High'}
    id3[Update DB function]@{ ticket: MC-2037, assigned: knsv, priority: 'High' }

  id12[Can't reproduce]
    id3[Weird flickering in Firefox]`;

// What a front-end receives: the settings block turned into blank lines.
const blank = (src: string): string => src.replace(/^---[\s\S]*?---\n/, (m) => '\n'.repeat(m.split('\n').length - 1));

const examples = { overview, metadataKeys, full };
const themes = ['solid', 'outline', 'card'] as const;

describe('kanban svg', () => {
  for (const [name, src] of Object.entries(examples)) {
    for (const theme of themes) {
      it(`${name} draws in ${theme}`, () => {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg).toContain('ursula-tile');
      });
    }
  }

  it('is picked by render() when the source starts with the header', () => {
    expect(selectFrontEnd(overview).name).toBe('kanban');
  });

  it('wraps a linked ticket tag in an SVG link', () => {
    const svg = render(full);
    const link = /<a href="https:\/\/mermaidchart\.atlassian\.net\/browse\/MC-2038">([\s\S]*?)<\/a>/.exec(svg);
    expect(link?.[1]).toContain('<rect class="ursula-tag"');
    expect(link?.[1]).toContain('>MC-2038</text>');
    expect(svg.match(/<a href=/g)).toHaveLength(3);
    expect(render(metadataKeys)).not.toContain('<a ');
  });

  it('links a ticket through data-href', () => {
    expect(render(full)).toContain('data-href="https://mermaidchart.atlassian.net/browse/MC-2038"');
    const init = full.replace(/^---[\s\S]*?---\n/, `%%{init: {"kanban": {"ticketBaseUrl": "https://x/#TICKET#"}}}%%\n`);
    expect(render(init)).toContain('data-href="https://x/MC-2038"');
    expect(render(full.replace('https://mermaidchart', 'https://other').replace(/^kanban$/m, `%%{init: {"kanban": {"ticketBaseUrl": "https://x/#TICKET#"}}}%%\nkanban`))).toContain('data-href="https://x/MC-2038"');
    expect(render(metadataKeys)).not.toContain('data-href');
  });
});

describe('kanban parse', () => {
  it('reads columns and cards of the overview', () => {
    const model = parseKanban(overview);
    expect(model.columns.map((c) => [c.id, c.title])).toEqual([['column1', 'Column Title']]);
    expect(model.columns[0]?.cards.map((c) => [c.id, c.title])).toEqual([['task1', 'Task Description']]);
  });

  it('reads metadata keys, quoted or not', () => {
    const card = parseKanban(metadataKeys).columns[0]?.cards[0];
    expect(card).toMatchObject({ title: 'Update Database Function', ticket: 'MC-2037', assigned: 'knsv', priority: 'High' });
  });

  it('reads the full example', () => {
    const model = parseKanban(blank(full), 'https://mermaidchart.atlassian.net/browse/#TICKET#');
    expect(model.ticketBaseUrl).toBe('https://mermaidchart.atlassian.net/browse/#TICKET#');
    expect(model.columns.map((c) => c.title)).toEqual(['Todo', 'In progress', 'Ready for deploy', 'Ready for test', 'Done', "Can't reproduce"]);
    expect(model.columns[0]?.cards.map((c) => c.title)).toEqual(['Create Documentation', 'Create Blog about the new diagram']);
    const last = model.columns[3]?.cards[1];
    expect(last).toMatchObject({ title: 'last item', priority: 'Very Low', assigned: 'knsv' });
    expect(last?.ticket).toBeUndefined();
    expect(model.columns[4]?.cards[2]).toMatchObject({ assigned: 'knsv', ticket: 'MC-2037' });
  });

  it('ignores a settings block and init directives', () => {
    const model = parseKanban(`%%{init: {"kanban": {"ticketBaseUrl": "https://x/#TICKET#"}}}%%\nkanban\n  a[A]\n    b[B]`);
    expect(model.ticketBaseUrl).toBe('https://x/#TICKET#');
    expect(render(`---\ntitle: x\n---\nkanban\n  a[A]`)).toContain('ursula-zone');
  });

  it('rejects a card without a column, with its line number', () => {
    try {
      parseKanban('kanban\n  a[A]@{ ticket: 1\n');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(2);
    }
  });

  it('rejects a wrong header', () => {
    expect(() => parseKanban('board\n  a[A]')).toThrow(UrsulaError);
  });
});

describe('kanban layout', () => {
  const layout = layoutKanban(parseKanban(blank(full)), pixelRuler());
  const boxes = layout.scene.items.filter((i): i is SceneBox => i.kind === 'box');
  const texts = layout.scene.items.filter((i): i is SceneText => i.kind === 'text');

  it('keeps the zone and card sizes of the rules', () => {
    expect(layout.columns.every((c) => c.w === 288 && c.h === layout.columns[0]?.h)).toBe(true);
    expect(layout.scene.width).toBe(48 + 6 * 288 + 5 * 16);
    expect(layout.cards.every((c) => c.w === 256)).toBe(true);
  });

  it('sizes a card by its lines and tags', () => {
    const one = layoutKanban(parseKanban(overview), pixelRuler()).cards[0];
    expect(one?.h).toBe(48);
    const tagged = layoutKanban(parseKanban(metadataKeys), pixelRuler()).cards[0];
    expect(tagged?.h).toBe(68 + 20 * ((tagged?.lines.length ?? 1) - 1));
    const long = layout.cards.find((c) => c.lines.length > 2);
    expect(long?.h).toBe(48 + 20 * ((long?.lines.length ?? 1) - 1));
  });

  it('stacks cards 8 apart from 44 below the zone top', () => {
    const column = layout.cards.filter((c) => c.column === 4);
    expect(column[0]?.y).toBe(24 + 44);
    expect(column[1]?.y).toBe((column[0]?.y ?? 0) + (column[0]?.h ?? 0) + 8);
  });

  it('puts no text over another text and none outside the drawing', () => {
    const ruler = pixelRuler();
    const rects = texts.map((t) => {
      const w = ruler.textWidth(t.text, 'title');
      const x0 = t.anchor === 'middle' || t.role?.includes('tag-text') ? t.x - w / 2 : t.x;
      return { x0, x1: x0 + w, y0: t.y - 8, y1: t.y + 8, text: t.text };
    });
    for (const r of rects) {
      expect(r.x0).toBeGreaterThanOrEqual(0);
      expect(r.x1).toBeLessThanOrEqual(layout.scene.width);
      expect(r.y1).toBeLessThanOrEqual(layout.scene.height);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (!a || !b) continue;
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(overlap, `${a.text} / ${b.text}`).toBe(false);
      }
    }
  });

  it('keeps every card text inside its card', () => {
    const ruler = pixelRuler();
    for (const card of layout.cards) {
      for (const line of card.lines) {
        expect(line.x + ruler.textWidth(line.text, 'title')).toBeLessThanOrEqual(card.x + card.w - 16);
      }
      for (const tag of card.tags) {
        expect(tag.x + tag.w).toBeLessThanOrEqual(card.x + card.w - 16);
        expect(tag.y + tag.h).toBeLessThanOrEqual(card.y + card.h);
      }
    }
    expect(boxes.length).toBeGreaterThan(0);
  });

  it('places grid sizes on multiples of 4', () => {
    // Tags sit 10 below the title block, as in the reference drawing, so they are left off the grid.
    for (const b of boxes.filter((x) => !x.role?.includes('tag'))) for (const v of [b.x, b.y, b.w, b.h]) expect(v % 4).toBe(0);
  });
});

describe('kanban text', () => {
  const text = (src: string, width: number): string[] => {
    const r = renderText(src, width);
    if ('error' in r) throw new Error(r.error);
    return r.lines;
  };

  it('puts columns side by side within the width', () => {
    const lines = text(overview, 60);
    expect(Math.max(...lines.map(cellWidth))).toBeLessThanOrEqual(60);
    const wide = text(`kanban\n  A[Todo]\n    x[One]\n  B[Done]\n    y[Two]@{ assigned: 'knsv', priority: 'High' }`, 60);
    expect(wide[0]).toMatch(/Todo\s+Done/);
    expect(wide.join('\n')).toContain('[knsv] [High]');
  });

  it('stacks columns when they do not fit side by side', () => {
    const lines = text(`kanban\n  A[Todo]\n    x[One]\n  B[Done]\n    y[Two]\n  C[Late]\n    z[Three]`, 30);
    expect(Math.max(...lines.map(cellWidth))).toBeLessThanOrEqual(30);
    const names = lines.map((l, i) => [l.trim(), i] as const).filter(([l]) => l === 'Todo' || l === 'Done' || l === 'Late');
    expect(names.map(([l]) => l)).toEqual(['Todo', 'Done', 'Late']);
  });

  it('keeps all words of a long title and gives spans with tones', () => {
    const spans = selectFrontEnd(full).textSpans?.(full, 200, {}) ?? [];
    const joined = spans.map((l) => l.map((s) => s.text).join('')).join('\n');
    expect(joined).toContain('[MC-2036] [Very High]');
    expect(spans.flat().some((s) => s.tone === 'bold')).toBe(true);
    for (const word of 'Title of diagram is more than 100 chars when user duplicates diagram with 100 char'.split(' ')) {
      expect(joined).toContain(word);
    }
  });
});

describe('kanban tag width', () => {
  it('makes a tag as wide as its text plus 12 on the 4 grid', () => {
    const ruler = pixelRuler();
    const tags = layoutKanban(parseKanban(blank(full)), ruler).cards.flatMap((c) => c.tags);
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) expect(t.w).toBe(Math.ceil((ruler.textWidth(t.text, 'line') + 12) / 4) * 4);
  });
});
