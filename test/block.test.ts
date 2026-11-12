// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';
import { layoutBlock } from '../src/block/layout.ts';
import { parseBlock } from '../src/block/parse.ts';
import type { BlockGroup, BlockNode } from '../src/block/model.ts';
import { cellRuler, pixelRuler } from '../src/metrics.ts';
import type { Scene, SceneBox, SceneLine, SceneText } from '../src/types.ts';

const EXAMPLES: Array<[string, string]> = [
  ['01-introduction-to-block-diagrams', `block
columns 1
  db(("DB"))
  blockArrowId6<["&nbsp;&nbsp;&nbsp;"]>(down)
  block:ID
    A
    B["A wide one in the middle"]
    C
  end
  space
  D
  ID --> D
  C --> D
  style B fill:#969,stroke:#333,stroke-width:4px`],
  ['02-basic-structure', `block
  a b c`],
  ['03-column-usage', `block
  columns 3
  a b c d`],
  ['04-spanning-multiple-columns', `block
  columns 3
  a["A label"] b:2 c:2 d`],
  ['05-nested-blocks', `block
    block
      D
    end
    A["A: I am a wide one"]`],
  ['06-adjusting-widths', `block
  columns 3
  a:3
  block:group1:2
    columns 2
    h i j k
  end
  g
  block:group2:3
    %% columns auto (default)
    l m n o p q r
  end`],
  ['07-adjusting-widths-2', `block
  block
    columns 1
    a["A label"] b c d
  end`],
  ['08-example-round-edged-block', `block
    id1("This is the text in the box")`],
  ['09-example-stadium-shaped-block', `block
    id1(["This is the text in the box"])`],
  ['10-example-subroutine-shape', `block
    id1[["This is the text in the box"]]`],
  ['11-example-cylindrical-shape', `block
    id1[("Database")]`],
  ['12-example-circle-shape', `block
    id1(("This is the text in the circle"))`],
  ['13-example-asymmetric-rhombus-and-hexagon-shapes', `block
  id1>"This is the text in the box"]`],
  ['14-example-asymmetric-rhombus-and-hexagon-shapes-2', `block
    id1{"This is the text in the box"}`],
  ['15-example-asymmetric-rhombus-and-hexagon-shapes-3', `block
    id1{{"This is the text in the box"}}`],
  ['16-example-parallelogram-and-trapezoid-shapes', `block
  id1[/"This is the text in the box"/]
  id2[\\"This is the text in the box"\\]
  A[/"Christmas"\\]
  B[\\"Go shopping"/]`],
  ['17-example-double-circle', `block
    id1((("This is the text in the circle")))`],
  ['18-example-block-arrows', `block
  blockArrowId<["Label"]>(right)
  blockArrowId2<["Label"]>(left)
  blockArrowId3<["Label"]>(up)
  blockArrowId4<["Label"]>(down)
  blockArrowId5<["Label"]>(x)
  blockArrowId6<["Label"]>(y)
  blockArrowId7<["Label"]>(x, down)`],
  ['19-example-space-blocks', `block
  columns 3
  a space b
  c   d   e`],
  ['20-example-space-blocks-2', `block
  ida space:3 idb idc`],
  ['21-basic-linking-and-arrow-types', `block
  A space B
  A-->B`],
  ['22-text-on-links', `block
  A space:2 B
  A-- "X" -->B`],
  ['23-text-on-links-2', `block
columns 1
  db(("DB"))
  blockArrowId6<["&nbsp;&nbsp;&nbsp;"]>(down)
  block:ID
    A
    B["A wide one in the middle"]
    C
  end
  space
  D
  ID --> D
  C --> D
  style B fill:#939,stroke:#333,stroke-width:4px`],
  ['24-example-styling-a-single-block', `block
  id1 space id2
  id1("Start")-->id2("Stop")
  style id1 fill:#636,stroke:#333,stroke-width:4px
  style id2 fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5`],
  ['25-example-styling-a-single-class', `block
  A space B
  A-->B
  classDef blue fill:#6e6ce6,stroke:#333,stroke-width:4px;
  class A blue
  style B fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5`],
  ['26-example-system-architecture', `block
  columns 3
  Frontend blockArrowId6<[" "]>(right) Backend
  space:2 down<[" "]>(down)
  Disk left<[" "]>(left) Database[("Database")]

  classDef front fill:#696,stroke:#333;
  classDef back fill:#969,stroke:#333;
  class Frontend front
  class Backend,Database back`],
  ['27-example-business-process-flow', `block
  columns 3
  Start(("Start")) space:2
  down<[" "]>(down) space:2
  Decision{{"Make Decision"}} right<["Yes"]>(right) Process1["Process A"]
  downAgain<["No"]>(down) space r3<["Done"]>(down)
  Process2["Process B"] r2<["Done"]>(right) End(("End"))

  style Start fill:#969;
  style End fill:#696;`],
  ['28-example-incorrect-linking', `block
  A space B
  A --> B`],
  ['29-example-misplaced-styling', `  block
    A
    style A fill#969;`],
  ['30-example-misplaced-styling-2', `block
  A
  style A fill:#969,stroke:#333;`],
];

const themes = ['solid', 'outline', 'card'] as const;
const ruler = pixelRuler();
const layoutOf = (src: string): ReturnType<typeof layoutBlock> => layoutBlock(parseBlock(src), ruler);
const example = (prefix: string): string => EXAMPLES.find(([name]) => name.startsWith(prefix))?.[1] ?? '';
const nodes = (src: string): BlockNode[] => {
  const out: BlockNode[] = [];
  const walk = (items: ReturnType<typeof parseBlock>['children']): void => {
    for (const item of items) {
      if (item.kind === 'node') out.push(item);
      if (item.kind === 'group') walk(item.children);
    }
  };
  walk(parseBlock(src).children);
  return out;
};

describe('block svg', () => {
  for (const [name, src] of EXAMPLES) {
    for (const theme of themes) {
      it(`${name} draws in ${theme}`, () => {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg).toContain('role="img"');
      });
    }
    it(`${name} draws as text`, () => {
      const text = renderText(src, 400);
      expect('lines' in text).toBe(true);
    });
  }

  it('is picked by render() for both headers', () => {
    expect(selectFrontEnd('block\n  a').name).toBe('block');
    expect(selectFrontEnd('block-beta\n  a').name).toBe('block');
    expect(render('block-beta\n  a b')).toContain('ursula-box');
  });

  it('reads an accessible title and a front-matter title', () => {
    const svg = render('---\ntitle: Parts\n---\nblock\n  accTitle: Parts overview\n  accDescr: two blocks\n  a b');
    expect(svg).toContain('<title>Parts overview</title>');
    expect(svg).toContain('ursula-title');
    expect(svg).toContain('>Parts<');
  });
});

describe('block parse', () => {
  it('reads the adjusting-widths example as nested groups with widths and columns', () => {
    const model = parseBlock(example('06'));
    expect(model.columns).toBe(3);
    const [a, group1, g, group2] = model.children as [BlockNode, BlockGroup, BlockNode, BlockGroup];
    expect([a.id, a.span]).toEqual(['a', 3]);
    expect([group1.id, group1.span, group1.columns, group1.children.length]).toEqual(['group1', 2, 2, 4]);
    expect([g.id, g.span]).toEqual(['g', 1]);
    expect([group2.id, group2.span, group2.columns, group2.children.map((c) => (c.kind === 'node' ? c.id : '')).join('')]).toEqual(['group2', 3, undefined, 'lmnopqr']);
  });

  it('reads labels, widths and spaces of the spanning and space examples', () => {
    const spanning = parseBlock(example('04'));
    expect(spanning.children.map((c) => (c.kind === 'node' ? [c.id, c.lines[0], c.span] : []))).toEqual([['a', 'A label', 1], ['b', 'b', 2], ['c', 'c', 2], ['d', 'd', 1]]);
    const space = parseBlock(example('20'));
    expect(space.children.map((c) => (c.kind === 'space' ? `space:${c.span}` : c.kind === 'node' ? c.id : ''))).toEqual(['ida', 'space:3', 'idb', 'idc']);
  });

  it('reads the shape of every bracket pair', () => {
    const shapes = (n: string): string[] => nodes(example(n)).map((b) => b.shape);
    expect(shapes('08')).toEqual(['round']);
    expect(shapes('09')).toEqual(['stadium']);
    expect(shapes('10')).toEqual(['subroutine']);
    expect(shapes('11')).toEqual(['cylinder']);
    expect(shapes('12')).toEqual(['circle']);
    expect(shapes('13')).toEqual(['asym']);
    expect(shapes('14')).toEqual(['diamond']);
    expect(shapes('15')).toEqual(['hexagon']);
    expect(shapes('16')).toEqual(['parallelogram', 'lean-l', 'trap-b', 'trap-t']);
    expect(shapes('17')).toEqual(['dbl-circle']);
  });

  it('reads the heads of every block arrow', () => {
    const heads = nodes(example('18')).map((b) => b.heads);
    expect(heads).toEqual([['right'], ['left'], ['up'], ['down'], ['left', 'right'], ['up', 'down'], ['left', 'right', 'down']]);
    expect(nodes(example('18')).every((b) => b.shape === 'arrow' && b.lines[0] === 'Label')).toBe(true);
  });

  it('reads links with their text, and the blocks a link names again', () => {
    const labelled = parseBlock(example('22'));
    expect(labelled.links).toMatchObject([{ from: 'A', to: 'B', label: 'X', arrow: true, style: 'normal' }]);
    const redefined = parseBlock(example('24'));
    expect(nodes(example('24')).map((b) => [b.id, b.shape, b.lines[0]])).toEqual([['id1', 'round', 'Start'], ['id2', 'round', 'Stop']]);
    expect(redefined.links).toHaveLength(1);
    const intro = parseBlock(example('01'));
    expect(intro.links.map((l) => [l.from, l.to])).toEqual([['ID', 'D'], ['C', 'D']]);
    expect(nodes(example('01'))[1]?.lines).toEqual(['']);
  });

  it('reads link styles, chains and arrows at both ends', () => {
    const model = parseBlock('block\n  A B C\n  A-->B-.->C\n  C==>A\n  A<-->B\n  A---B\n  A-->|text|C');
    expect(model.links.map((l) => [l.from, l.to, l.style, l.arrow, l.arrowStart, l.label])).toEqual([
      ['A', 'B', 'normal', true, false, undefined],
      ['B', 'C', 'dotted', true, false, undefined],
      ['C', 'A', 'thick', true, false, undefined],
      ['A', 'B', 'normal', true, true, undefined],
      ['A', 'B', 'normal', false, false, undefined],
      ['A', 'C', 'normal', true, false, 'text'],
    ]);
  });

  it('reads styles and classes and leaves them out', () => {
    const model = parseBlock(example('25'));
    expect(model.ignored).toHaveLength(3);
    expect(parseBlock(example('29')).ignored).toEqual(['style A fill#969;']);
  });

  it('ignores a settings block and init directives', () => {
    const model = parseBlock('%%{init: {"theme": "dark"}}%%\nblock\n  a b');
    expect(model.children).toHaveLength(2);
    expect(render('---\nconfig:\n  theme: dark\n---\nblock\n  a')).toContain('ursula-box');
  });

  it('clamps a width to the columns of its grid', () => {
    const model = parseBlock('block\n  columns 2\n  a:3 b');
    expect(model.children[0]?.span).toBe(2);
  });

  it('rejects a line it cannot read, with its line number', () => {
    for (const [src, line] of [['block\n  a\n  A - B', 3], ['block\n  columns abc', 2], ['block\n  block:g\n    a', 2], ['block\n  end', 2], ['graph\n  a', 1], ['block\n  a-->b-', 2]] as const) {
      try {
        parseBlock(src);
        expect.unreachable(src);
      } catch (err) {
        expect(err).toBeInstanceOf(UrsulaError);
        expect((err as UrsulaError).line).toBe(line);
      }
    }
  });
});

const sceneOf = (src: string): Scene => layoutOf(src).scene;
const textBoxes = (scene: Scene, block?: string): Array<{ x0: number; x1: number; y0: number; y1: number; text: string }> =>
  scene.items
    .filter((i): i is SceneText => i.kind === 'text' && (block === undefined || i.data?.['block'] === block))
    .map((t) => {
      const w = ruler.textWidth(t.text, t.role?.includes('label') ? 'line' : 'title') * (t.role?.includes('title') ? 15 / 13 : 1);
      const x0 = t.anchor === 'start' ? t.x : t.x - w / 2;
      return { x0, x1: x0 + w, y0: t.y - 8, y1: t.y + 8, text: t.text };
    });

describe('block layout', () => {
  it('draws the ideal example: 3 columns of 152 apart by 48, a circle across all three, a space row of 48', () => {
    const src = 'block\n  columns 3\n  User(("User")):3\n  space:3\n  web["Web UI"] api["API Server"] db[("Database")]\n  User --> web\n  web --> api\n  api --> db';
    const layout = layoutOf(src);
    expect([layout.width, layout.height]).toEqual([600, 256]);
    const rect = (id: string): number[] => {
      const b = layout.blocks.find((x) => x.id === id);
      return [b?.x ?? -1, b?.y ?? -1, b?.w ?? -1, b?.h ?? -1];
    };
    expect(rect('User')).toEqual([268, 24, 64, 64]);
    expect(rect('web')).toEqual([24, 184, 152, 48]);
    expect(rect('api')).toEqual([224, 184, 152, 48]);
    expect(rect('db')).toEqual([424, 184, 152, 48]);
    // User leaves by its bottom, turns in the space row and enters Web UI from above.
    expect(layout.links[0]?.points.map((p) => [p.x, p.y])).toEqual([[300, 88], [300, 136], [100, 136], [100, 181]]);
    expect(layout.links[1]?.points.map((p) => [p.x, p.y])).toEqual([[176, 208], [221, 208]]);
  });

  for (const [name, src] of EXAMPLES) {
    describe(name, () => {
      const layout = layoutOf(src);
      const scene = layout.scene;

      it('keeps every block on the 4 grid and inside the drawing', () => {
        for (const b of layout.blocks) {
          for (const v of [b.x, b.y, b.w, b.h]) expect(v % 4).toBe(0);
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(layout.width);
          expect(b.y + b.h).toBeLessThanOrEqual(layout.height);
        }
      });

      it('keeps text apart and inside the drawing', () => {
        const boxes = textBoxes(scene);
        for (const t of boxes) {
          expect(t.x0).toBeGreaterThanOrEqual(0);
          expect(t.x1).toBeLessThanOrEqual(scene.width);
          expect(t.y0).toBeGreaterThanOrEqual(0);
          expect(t.y1).toBeLessThanOrEqual(scene.height);
        }
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            if (a === undefined || b === undefined) continue;
            expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0).toBe(true);
          }
        }
      });

      it('keeps the text of a block inside the block', () => {
        for (const b of layout.blocks.filter((x) => x.kind === 'node' && x.shape !== 'arrow')) {
          for (const t of textBoxes(scene, b.id)) {
            expect(t.x0).toBeGreaterThanOrEqual(b.x);
            expect(t.x1).toBeLessThanOrEqual(b.x + b.w);
          }
        }
      });

      it('runs every link in right angles and never through a block', () => {
        const leaves = layout.blocks.filter((b) => b.kind === 'node');
        for (const link of layout.links) {
          for (let i = 0; i + 1 < link.points.length; i++) {
            const a = link.points[i];
            const b = link.points[i + 1];
            if (a === undefined || b === undefined) continue;
            expect(a.x === b.x || a.y === b.y).toBe(true);
            for (const leaf of leaves.filter((l) => l.id !== link.from && l.id !== link.to)) {
              const crossesX = Math.max(a.x, b.x) > leaf.x && Math.min(a.x, b.x) < leaf.x + leaf.w;
              const crossesY = Math.max(a.y, b.y) > leaf.y && Math.min(a.y, b.y) < leaf.y + leaf.h;
              expect(crossesX && crossesY).toBe(false);
            }
          }
        }
      });
    });
  }

  it('makes the columns of a grid as wide as the widest block and lets a width cover columns and gaps', () => {
    const layout = layoutOf(example('04'));
    const by = (id: string): { w: number; x: number } => layout.blocks.find((b) => b.id === id) as { w: number; x: number };
    expect(by('a').w).toBe(by('d').w);
    expect(by('b').w).toBe(2 * by('a').w + 48);
    expect(by('c').w).toBe(by('b').w);
    expect(by('d').x).toBe(by('a').x + 2 * (by('a').w + 48));
  });

  it('puts a nested block in a zone and its blocks in rows of their own', () => {
    const layout = layoutOf(example('06'));
    const zone = (id: string): { x: number; w: number; y: number; h: number } => layout.blocks.find((b) => b.id === id) as { x: number; w: number; y: number; h: number };
    const root = layout.blocks.find((b) => b.id === 'a') as { w: number };
    expect(zone('group1').w).toBe((root.w - 2 * 48) / 3 * 2 + 48);
    for (const id of ['h', 'i', 'j', 'k']) {
      const b = layout.blocks.find((x) => x.id === id);
      expect(b?.parent).toBe('group1');
      expect((b?.x ?? 0) >= zone('group1').x + 16 && (b?.x ?? 0) + (b?.w ?? 0) <= zone('group1').x + zone('group1').w - 16).toBe(true);
    }
    const at = (id: string): { x: number; y: number; w: number } => layout.blocks.find((b) => b.id === id) as { x: number; y: number; w: number };
    const [h, i, j] = [at('h'), at('i'), at('j')] as [{ x: number; y: number; w: number }, { x: number; y: number; w: number }, { x: number; y: number; w: number }];
    expect(i.x - (h.x + h.w)).toBe(48);
    expect(j.x).toBe(h.x);
    expect(j.y).toBeGreaterThan(h.y);
  });

  it('gives every block arrow a body and a head per direction', () => {
    const scene = sceneOf(example('18'));
    const paths = scene.items.filter((i) => i.kind === 'path');
    expect(paths).toHaveLength(7);
  });

  it('marks a block that only starts links, and leaves the rest plain', () => {
    const layout = layoutOf(example('01'));
    expect(layout.blocks.filter((b) => b.start).map((b) => b.id)).toEqual(['C']);
    expect(render(example('24'))).toContain('ursula-box--start');
    expect(render(example('14'))).toContain('ursula-box--decision');
  });

  it('puts a label on its link as a chip with the text', () => {
    const scene = sceneOf(example('22'));
    const chip = scene.items.find((i): i is SceneBox => i.kind === 'box' && (i.role ?? []).includes('chip'));
    expect(chip).toBeDefined();
    expect(chip?.h).toBe(24);
    const text = scene.items.find((i): i is SceneText => i.kind === 'text' && i.text === 'X');
    expect((text?.x ?? 0)).toBe((chip?.x ?? 0) + (chip?.w ?? 0) / 2);
    const line = scene.items.find((i): i is SceneLine => i.kind === 'line');
    expect(line?.role).toContain('edge--arrow');
  });

  it('moves a second link over when two would share a passage', () => {
    const layout = layoutOf('block\n  a space b\n  a-->b\n  b-->a');
    const [one, two] = layout.links;
    expect(JSON.stringify(one?.points)).not.toBe(JSON.stringify([...(two?.points ?? [])].reverse()));
  });

  it('keeps a long label whole by growing the block and wrapping the circle', () => {
    const layout = layoutOf('block\n  a["A label that is quite a bit longer than a block usually carries in it"]\n  b(("This is the text in the circle that wraps"))');
    const a = layout.blocks.find((b) => b.id === 'a');
    expect(a?.lines.length).toBeGreaterThan(1);
    const b = layout.blocks.find((x) => x.id === 'b');
    expect(b?.w).toBe(b?.h);
    expect((b?.lines.length ?? 0)).toBeGreaterThan(1);
  });
});

describe('block text', () => {
  it('draws the blocks with box characters and the links with arrowheads', () => {
    const lines = (renderText(example('21'), 80) as { lines: string[] }).lines;
    expect(lines).toEqual(['┌───────┐                     ┌───────┐', '│   A   │────────────────────▶│   B   │', '└───────┘                     └───────┘']);
  });

  it('marks the kind of a block', () => {
    const shapes = (n: string): string => (renderText(example(n), 100) as { lines: string[] }).lines.join('\n');
    expect(shapes('09')).toContain('(  This is the text in the box  )');
    expect(shapes('11')).toContain('├');
    expect(shapes('12')).toContain('(  This is the text in the circle  )');
    expect(shapes('14')).toContain('<  This is the text in the box  >');
    expect(shapes('17')).toContain('((');
    expect(shapes('10')).toContain('┬');
  });

  it('puts the label of a link on the line', () => {
    const lines = (renderText(example('22'), 100) as { lines: string[] }).lines;
    expect(lines.some((l) => l.includes('─ X ─'))).toBe(true);
  });

  it('draws a nested block with a dashed frame', () => {
    const lines = (renderText(example('05'), 100) as { lines: string[] }).lines;
    expect(lines[0]).toContain('┌╌');
  });

  it('keeps within the width, tightening the grid and then writing an outline', () => {
    const wide = (renderText(example('06'), 120) as { lines: string[] }).lines;
    expect(Math.max(...wide.map((l) => [...l].length))).toBeLessThanOrEqual(120);
    expect(wide.join('\n')).toContain('┌');
    const narrow = (renderText(example('06'), 40) as { lines: string[] }).lines;
    expect(Math.max(...narrow.map((l) => [...l].length))).toBeLessThanOrEqual(40);
    expect(narrow.join('\n')).toContain('lmnopqr'.split('').join(' | '));
  });

  it('draws with the cell ruler without a scene', () => {
    const layout = layoutBlock(parseBlock(example('21')), cellRuler());
    expect(layout.scene.items).toEqual([]);
    expect(layout.blocks).toHaveLength(2);
  });
});

describe('block arrows, labels and lines around the blocks', () => {
  type R = { x: number; y: number; w: number; h: number };
  const apart = (a: R, b: R, by: number): boolean => a.x >= b.x + b.w + by || a.x + a.w + by <= b.x || a.y >= b.y + b.h + by || a.y + a.h + by <= b.y;
  const leavesOf = (layout: ReturnType<typeof layoutOf>): R[] => layout.blocks.filter((b) => b.kind === 'node');

  it('draws the block arrows of one axis equally thick, whatever the height of their row', () => {
    const layout = layoutOf(example('27'));
    const at = (id: string): R => layout.blocks.find((b) => b.id === id) as R;
    expect(at('r2').h).toBe(at('right').h);
    expect(new Set(['down', 'downAgain', 'r3'].map((id) => at(id).w)).size).toBe(1);
  });

  it('widens the gap a labelled link crosses so the chip stands clear of both blocks', () => {
    for (const src of ['block\n  columns 3\n  a b c\n  a -- "second label" --> b', 'block\n  columns 1\n  a b\n  a -- "down" --> b']) {
      const layout = layoutOf(src);
      const chip = layout.links[0]?.chip as R;
      for (const b of leavesOf(layout)) expect(apart(chip, b, 8)).toBe(true);
      const [a, b] = leavesOf(layout) as [R, R];
      expect(Math.max(b.x - (a.x + a.w), b.y - (a.y + a.h))).toBeGreaterThanOrEqual(80);
    }
  });

  it('keeps the widened gap only where a chip stands', () => {
    const layout = layoutOf('block\n  columns 3\n  a b c\n  a -- "second label" --> b');
    const [, b, c] = leavesOf(layout) as [R, R, R];
    expect(c.x - (b.x + b.w)).toBe(48);
  });

  it('takes a labelled line that goes around a block far enough out for its chip, and grows the drawing to hold it', () => {
    const layout = layoutOf('block\n  columns 1\n  a b c\n  a -- "long label here" --> c');
    const chip = layout.links[0]?.chip as R;
    for (const b of leavesOf(layout)) expect(apart(chip, b, 8)).toBe(true);
    expect(chip.x + chip.w + 24).toBeLessThanOrEqual(layout.width);
  });

  it('keeps a line that goes around the outer blocks 24 from them and 24 from the edge of the drawing', () => {
    const layout = layoutOf('block\n  columns 3\n  a b c\n  a --> c');
    const pts = layout.links[0]?.points ?? [];
    const top = Math.min(...pts.map((p) => p.y));
    const a = layout.blocks.find((b) => b.id === 'a') as R;
    expect(top).toBeGreaterThanOrEqual(24);
    expect(a.y - top).toBeGreaterThanOrEqual(24);
  });

  it('keeps a line off the border of a group it passes', () => {
    const layout = layoutOf('block\n  columns 2\n  block:outer\n    columns 1\n    block:inner\n      x y\n    end\n    z\n  end\n  w\n  x --> w\n  inner --> z');
    const inner = layout.blocks.find((b) => b.id === 'inner') as R;
    for (const link of layout.links) {
      for (let i = 0; i + 1 < link.points.length; i++) {
        const p = link.points[i] as { x: number; y: number };
        const q = link.points[i + 1] as { x: number; y: number };
        if (p.y !== q.y) continue;
        const along = Math.min(Math.max(p.x, q.x), inner.x + inner.w) - Math.max(Math.min(p.x, q.x), inner.x);
        if (along > 0) for (const edge of [inner.y, inner.y + inner.h]) expect(Math.abs(p.y - edge)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('keeps the box fill for a block in a white (second level) zone, so the block still shows', () => {
    const scene = sceneOf('block\n  block\n    block\n      y\n    end\n  end');
    const box = scene.items.find((i) => i.kind === 'box' && i.data?.block === 'y') as SceneBox;
    expect(box.role).not.toContain('box--in-zone');
  });
});
