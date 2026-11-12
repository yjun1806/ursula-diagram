import { describe, expect, it } from 'vitest';
import { cellRuler, layout, pixelRuler, renderSvg, renderTextLayout, THEMES } from '../src/index.ts';
import { placeEndLabels } from '../src/layered/end-labels.ts';
import { compartmentHeights, recordHeight, recordWidth } from '../src/layout/records.ts';
import { markGlyphs } from '../src/render/text.ts';
import type { Compartment, EdgeEnd, Graph, Layout, LayoutEdge, LayoutNode, NodeShape, Point } from '../src/types.ts';
import { geometryViolations, rectsOverlap } from './helpers.ts';
import { box, entities, graphOf, inheritance, link, relations, shaped, states, usecases } from './records-graphs.ts';

const px = pixelRuler();
const cells = cellRuler();
const EPS = 1e-6;

const tail = (d: string): Point => {
  const n = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return { x: n[n.length - 2] as number, y: n[n.length - 1] as number };
};
const head = (d: string): Point => {
  const n = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return { x: n[0] as number, y: n[1] as number };
};
const pathsOf = (svg: string): string[] => [...svg.matchAll(/<path class="ursula-edge [^"]*"[^>]* d="([^"]*)"[^>]*\/>/g)].map((m) => m[1] as string);
const nodeOf = (l: Layout, id: string): LayoutNode => l.nodes.find((n) => n.id === id) as LayoutNode;

const ENDS: EdgeEnd[] = ['triangle-open', 'diamond-filled', 'diamond-open', 'arrow-open', 'one', 'zero-one', 'many', 'one-many', 'zero-many'];

describe('boxes divided into compartments: size', () => {
  const animal: Compartment[] = [{ lines: ['Animal'] }, { lines: ['+int age', '+String gender'] }, { lines: ['+isMammal()', '+mate()'] }];

  it('is 40 high for the head and 56 for each body of two lines', () => {
    expect(compartmentHeights(animal, px)).toEqual([40, 56, 56]);
    expect(recordHeight(animal, px)).toBe(152);
  });

  it('is 20 per line plus 20 for a head and 16 for a body; an empty body is 16', () => {
    expect(compartmentHeights([{ lines: ['A', 'B'] }, { lines: [] }, { lines: ['x'] }], px)).toEqual([60, 16, 36]);
  });

  it('is at least 120 wide and 32 wider than the widest line, rounded up to a multiple of 4', () => {
    expect(recordWidth([{ lines: ['A'] }], px)).toBe(120);
    const wide: Compartment[] = [{ lines: ['A'] }, { lines: ['+someVeryLongMethodName(argument: Type): ReturnType'] }];
    const text = px.textWidth('+someVeryLongMethodName(argument: Type): ReturnType', 'line');
    const w = recordWidth(wide, px);
    expect(w).toBeGreaterThanOrEqual(text + 32);
    expect(w).toBeLessThan(text + 32 + 4);
    expect(w % 4).toBe(0);
  });

  it('is a border, the lines, and one rule row between compartments in a terminal', () => {
    expect(recordHeight(animal, cells)).toBe(2 + 1 + 2 + 2 + 2);
    expect(recordWidth(animal, cells)).toBe('+String gender'.length + 4);
  });

  it('is asked of the slot: every box of a layout is at least as large as it asks', () => {
    for (const g of [inheritance(), entities(), relations()]) {
      const l = layout(g, px);
      for (const n of g.nodes) {
        const placed = nodeOf(l, n.id);
        expect(placed.compartments).toEqual(n.compartments);
        expect(placed.w).toBeGreaterThanOrEqual(recordWidth(n.compartments ?? [], px) - EPS);
        expect(placed.h).toBeGreaterThanOrEqual(recordHeight(n.compartments ?? [], px) - EPS);
      }
    }
  });
});

describe('boxes divided into compartments: drawing', () => {
  it('draws one rule between neighbouring compartments, in the colour and width of the theme', () => {
    const g = inheritance();
    const rules = g.nodes.reduce((n, node) => n + (node.compartments?.length ?? 1) - 1, 0);
    const l = layout(g, px);
    const solid = renderSvg(l, { theme: 'solid', legend: false });
    const outline = renderSvg(l, { theme: 'outline', legend: false });
    const card = renderSvg(l, { theme: 'card', legend: false });
    for (const svg of [solid, outline, card]) expect(svg.match(/<path class="ursula-rule"/g)?.length).toBe(rules);
    expect(solid).toContain('.ursula-rule{fill:none;stroke:var(--ursula-zone,#ffffff);stroke-width:2}');
    expect(outline).toContain('.ursula-rule{fill:none;stroke:var(--ursula-hair,#ecebf1);stroke-width:1}');
    expect(card).toContain('.ursula-rule{fill:none;stroke:var(--ursula-hair,#ecebf1);stroke-width:1}');
  });

  it('puts the head in bold at the middle and the bodies at the left', () => {
    const l = layout(inheritance(), px);
    const svg = renderSvg(l, { legend: false });
    const animal = nodeOf(l, 'Animal');
    expect(svg).toContain(`<text class="ursula-cell-title" x="${animal.x + animal.w / 2}"`);
    expect(svg).toContain('text-anchor="middle" dominant-baseline="central">Animal</text>');
    expect(svg).toMatch(new RegExp(`<text class="ursula-cell-body" x="${animal.x + 16}" y="[\\d.]+" dominant-baseline="central">\\+int age</text>`));
  });

  it('takes no role colour: a box of records is not a start', () => {
    const svg = renderSvg(layout(inheritance(), px), { legend: false });
    expect(svg).not.toMatch(/<g [^>]*data-role=/);
  });

  it('draws the compartments in the text drawing, split by rules', () => {
    const lone = graphOf('LR', [box('Animal', 'Animal', ['+int age', '+String gender'], ['+isMammal()'])], []);
    const lines = renderTextLayout(layout(lone, cells, { maxWidth: 100 }));
    // A border, the head, a rule, two lines, a rule, one line and a border: the rules run from side to side.
    expect(lines).toHaveLength(8);
    expect(lines[0]).toMatch(/^┌─+┐$/);
    expect(lines[2]).toMatch(/^├─+┤$/);
    expect(lines[5]).toMatch(/^├─+┤$/);
    expect(lines[7]).toMatch(/^└─+┘$/);
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
    expect(lines[1]).toMatch(/^│ +Animal +│$/);
    expect(lines[3]).toMatch(/^│ \+int age +│$/);
    expect(lines[4]).toMatch(/^│ \+String gender +│$/);
    expect(lines[6]).toMatch(/^│ \+isMammal\(\) +│$/);
  });
});

/** Two boxes in a row joined by one line that carries `end` at its end and `start` at its start. */
function pair(start: EdgeEnd | undefined, end: EdgeEnd, extra: Partial<Parameters<typeof link>[3]> = {}): Graph {
  return graphOf('LR', [shaped('a', 'rect', 'A'), shaped('b', 'rect', 'B')], [link('a', 'b', end, { ...(start === undefined ? {} : { startEnd: start }), ...extra })]);
}

describe('marks of relation lines', () => {
  for (const theme of THEMES) {
    for (const end of ENDS) {
      it(`${end} has a marker of its own colour in ${theme}, and the line stops 12 short of it`, () => {
        const l = layout(pair(undefined, end), px);
        const svg = renderSvg(l, { theme, legend: false });
        expect(svg).not.toContain('context-stroke');
        const id = `ursula-end-${end}`;
        expect(svg).toContain(`<marker id="${id}"`);
        expect(svg).toContain(`marker-end="url(#${id})"`);
        const edge = l.edges[0] as LayoutEdge;
        const last = edge.points[edge.points.length - 1] as Point;
        const [d] = pathsOf(svg);
        const stop = tail(d as string);
        expect(Math.hypot(last.x - stop.x, last.y - stop.y)).toBeCloseTo(12, 5);
        expect(Math.abs(last.y - stop.y)).toBeLessThan(EPS);
      });

      it(`${end} at the start of a line shortens it the same way in ${theme}`, () => {
        const l = layout(pair(end, 'none'), px);
        const svg = renderSvg(l, { theme, legend: false });
        const id = `ursula-end-${end}`;
        expect(svg).toContain(`marker-start="url(#${id})"`);
        expect(svg).not.toContain('marker-end=');
        const edge = l.edges[0] as LayoutEdge;
        const first = edge.points[0] as Point;
        const [d] = pathsOf(svg);
        const begin = head(d as string);
        expect(Math.hypot(first.x - begin.x, first.y - begin.y)).toBeCloseTo(12, 5);
      });
    }
  }

  it('fills its marker from the theme: solid marks use the line colour, hollow ones the page colour', () => {
    const svg = renderSvg(layout(pair('diamond-filled', 'triangle-open'), px), { theme: 'outline', legend: false });
    expect(svg).toContain('.ursula-end-solid{fill:var(--ursula-line,#8f8c9b);stroke:var(--ursula-line,#8f8c9b)');
    expect(svg).toContain('.ursula-end-hollow{fill:var(--ursula-zone,#ffffff);stroke:var(--ursula-line,#8f8c9b)');
  });

  it('draws a mark in the accent colour on a thick line', () => {
    const svg = renderSvg(layout(pair(undefined, 'triangle-open', { style: 'thick' }), px), { legend: false });
    expect(svg).toContain('id="ursula-end-triangle-open-accent"');
    expect(svg).toContain('class="ursula-end-hollow ursula-end-hollow--accent"');
  });

  it('is written in the text drawing with the nearest glyphs', () => {
    expect(markGlyphs('triangle-open', 'right')).toEqual(['▷']);
    expect(markGlyphs('triangle-open', 'left')).toEqual(['◁']);
    expect(markGlyphs('diamond-filled', 'right')).toEqual(['◆']);
    expect(markGlyphs('diamond-open', 'down')).toEqual(['◇']);
    expect(markGlyphs('arrow-open', 'right')).toEqual(['>']);
    expect(markGlyphs('one-many', 'right')).toEqual(['<', '|']);
    expect(markGlyphs('zero-many', 'right')).toEqual(['<', 'o']);
    expect(markGlyphs('zero-one', 'left')).toEqual(['|', 'o']);
    expect(markGlyphs('one', 'right')).toEqual(['|', '|']);
    expect(markGlyphs('many', 'left')).toEqual(['>']);
    const text = renderTextLayout(layout(entities(), cells, { maxWidth: 100 })).join('\n');
    expect(text).toContain('||');
    expect(text).toContain('o<');
    const rel = renderTextLayout(layout(relations(), cells, { maxWidth: 100 })).join('\n');
    expect(rel).toContain('◆');
    expect(rel).toContain('◇');
  });

  it('puts no arrow in the text drawing at a line that ends in nothing', () => {
    const text = renderTextLayout(layout(pair('diamond-filled', 'none'), cells, { maxWidth: 60 })).join('\n');
    expect(text).toContain('◆');
    expect(text).not.toMatch(/[▶▷]/);
  });
});

describe('small texts at the ends of lines', () => {
  const line = (a: Point, b: Point, text: { start?: string; end?: string } = {}): { edge: LayoutEdge; text: { start?: string; end?: string } } => ({
    edge: { from: 'a', to: 'b', style: 'normal', points: [a, b] },
    text,
  });
  const node = (id: string, x: number, y: number, w: number, h: number): LayoutNode => ({ id, lane: '_', rank: 0, span: 1, row: 0, x, y, w, h, title: id, lines: [], shape: 'rect' });
  const small = (s: string): { w: number; h: number } => ({ w: Math.ceil(px.textWidth(s, 'edge') * (11 / 12)), h: 14 });

  it('stand 16 along the line and 8 across it, on the left of the reading direction', () => {
    const { edge, text } = line({ x: 100, y: 100 }, { x: 400, y: 100 }, { start: '1', end: '0..*' });
    const diagnostics = placeEndLabels([edge], [text], [node('a', 0, 80, 100, 40), node('b', 400, 80, 100, 40)], px);
    expect(diagnostics).toEqual([]);
    const start = edge.startLabel as NonNullable<LayoutEdge['startLabel']>;
    const end = edge.endLabel as NonNullable<LayoutEdge['endLabel']>;
    expect(start.text).toBe('1');
    expect(start.x).toBeCloseTo(100 + 16, 5);
    expect(start.y + start.h).toBeCloseTo(100 - 8, 5);
    expect(end.x + end.w).toBeCloseTo(400 - 16, 5);
    expect(end.y + end.h).toBeCloseTo(100 - 8, 5);
    expect(end.w).toBe(small('0..*').w);
  });

  it('on a line that runs down, the left is the east', () => {
    const { edge, text } = line({ x: 100, y: 100 }, { x: 100, y: 400 }, { end: 'N' });
    placeEndLabels([edge], [text], [], px);
    const end = edge.endLabel as NonNullable<LayoutEdge['endLabel']>;
    // Reading down, the left hand is toward larger x.
    expect(end.x).toBeCloseTo(100 + 8, 5);
    expect(end.y + end.h).toBeCloseTo(400 - 16, 5);
  });

  it('moves to the right when the left is taken by a box', () => {
    const { edge, text } = line({ x: 100, y: 100 }, { x: 400, y: 100 }, { start: '1' });
    placeEndLabels([edge], [text], [node('block', 100, 60, 80, 32)], px);
    const start = edge.startLabel as NonNullable<LayoutEdge['startLabel']>;
    expect(start.y).toBeCloseTo(100 + 8, 5);
    expect(start.x).toBeCloseTo(100 + 16, 5);
  });

  it('moves along the line by 8 when both sides are taken, at most three times', () => {
    const blocks = (until: number): LayoutNode[] => [node('up', 100, 60, until - 100, 32), node('down', 100, 108, until - 100, 32)];
    const first = line({ x: 100, y: 100 }, { x: 400, y: 100 }, { start: '1' });
    placeEndLabels([first.edge], [first.text], blocks(124), px);
    expect((first.edge.startLabel as NonNullable<LayoutEdge['startLabel']>).x).toBeCloseTo(100 + 16 + 8, 5);

    const third = line({ x: 100, y: 100 }, { x: 400, y: 100 }, { start: '1' });
    placeEndLabels([third.edge], [third.text], blocks(140), px);
    expect((third.edge.startLabel as NonNullable<LayoutEdge['startLabel']>).x).toBeCloseTo(100 + 16 + 24, 5);
  });

  it('reports a text that finds no free place and leaves it at the first one', () => {
    const { edge, text } = line({ x: 100, y: 100 }, { x: 400, y: 100 }, { start: '1' });
    const diagnostics = placeEndLabels([edge], [text], [node('up', 100, 60, 300, 32), node('down', 100, 108, 300, 32)], px);
    expect(diagnostics.map((d) => d.kind)).toEqual(['label-overlap']);
    const start = edge.startLabel as NonNullable<LayoutEdge['startLabel']>;
    expect(start.x).toBeCloseTo(116, 5);
    expect(start.y + start.h).toBeCloseTo(92, 5);
  });

  it('keeps clear of the text of another label', () => {
    const a = line({ x: 100, y: 100 }, { x: 400, y: 100 }, { start: '1' });
    const b = line({ x: 100, y: 100 }, { x: 400, y: 100 }, { start: '1' });
    placeEndLabels([a.edge, b.edge], [a.text, b.text], [], px);
    expect(rectsOverlap(a.edge.startLabel as NonNullable<LayoutEdge['startLabel']>, b.edge.startLabel as NonNullable<LayoutEdge['startLabel']>)).toBe(false);
  });

  it('carries the texts of a graph onto its layout, clear of every box and of each other', () => {
    for (const g of [relations(), entities()]) {
      const withTexts = { ...g, edges: g.edges.map((e, i) => ({ ...e, startLabel: `${i + 1}`, endLabel: i % 2 === 0 ? '0..*' : 'N' })) };
      const l = layout(withTexts, px);
      const rects = l.edges.flatMap((e) => [e.startLabel, e.endLabel].filter((r): r is NonNullable<typeof r> => r !== undefined));
      expect(rects.length).toBe(2 * g.edges.length);
      if (l.diagnostics.some((d) => d.kind === 'label-overlap')) continue;
      rects.forEach((r, i) => {
        for (const n of l.nodes) expect(rectsOverlap(r, n), `${r.text} over ${n.id}`).toBe(false);
        for (const e of l.edges) if (e.label) expect(rectsOverlap(r, e.label)).toBe(false);
        rects.slice(i + 1).forEach((o) => expect(rectsOverlap(r, o)).toBe(false));
      });
    }
  });

  it('draws a text at its place with the small size, in each theme', () => {
    const l = layout(pair('diamond-filled', 'none', { startLabel: '1', endLabel: '0..*' }), px);
    for (const theme of THEMES) {
      const svg = renderSvg(l, { theme, legend: false });
      expect(svg.match(/<text class="ursula-end-label"/g)?.length).toBe(2);
      expect(svg).toContain('.ursula-end-label{');
      expect(svg).toContain('font-size:11px');
    }
    const start = l.edges[0]?.startLabel as NonNullable<LayoutEdge['startLabel']>;
    expect(renderSvg(l, { legend: false })).toContain(`x="${start.x + start.w / 2}" y="${start.y + start.h / 2}"`);
  });

  it('puts the texts in the text drawing', () => {
    const text = renderTextLayout(layout(pair('diamond-filled', 'none', { startLabel: '1', endLabel: 'N' }), cells, { maxWidth: 60 })).join('\n');
    expect(text).toContain('1');
    expect(text).toContain('N');
  });
});

const SHAPES: Array<[NodeShape, { w: number; h: number }]> = [
  ['start-dot', { w: 16, h: 16 }],
  ['end-dot', { w: 20, h: 20 }],
  ['actor', { w: 24, h: 48 }],
];

describe('new node shapes', () => {
  it('draw a start dot of 16, an end mark of 20 and 10, a bar of 8 by 64 or 64 by 8, an actor of 24 by 48', () => {
    for (const [shape, size] of SHAPES) {
      for (const dir of ['LR', 'TD'] as const) {
        const g = graphOf(dir, [shaped('x', shape, 'X'), shaped('y', 'rect', 'Y')], [link('x', 'y', 'arrow')]);
        const x = nodeOf(layout(g, px), 'x');
        expect([shape, dir, x.w, x.h]).toEqual([shape, dir, size.w, size.h]);
      }
    }
    const bar = (dir: 'LR' | 'TD'): LayoutNode => nodeOf(layout(graphOf(dir, [shaped('x', 'bar'), shaped('y', 'rect', 'Y')], [link('x', 'y', 'arrow')]), px), 'x');
    expect([bar('LR').w, bar('LR').h]).toEqual([8, 64]);
    expect([bar('TD').w, bar('TD').h]).toEqual([64, 8]);
  });

  it('give an ellipse 48 high and its text plus 48 wide', () => {
    const l = layout(usecases(), px);
    for (const id of ['login', 'profile', 'manage', 'reports']) {
      const n = nodeOf(l, id);
      expect(n.h).toBe(48);
      expect(n.w).toBeGreaterThanOrEqual(Math.ceil(px.textWidth(n.title, 'title') + 48) - EPS);
    }
  });

  it('draw all six, in each theme, without a role colour', () => {
    const g = graphOf(
      'LR',
      [shaped('s', 'start-dot'), shaped('n', 'note', 'Note'), shaped('f', 'bar'), shaped('e', 'ellipse', 'Do it'), shaped('a', 'actor', 'Who'), shaped('d', 'end-dot')],
      [link('s', 'f', 'arrow'), link('f', 'e', 'arrow'), link('a', 'e', 'arrow'), link('n', 'e', 'none', { style: 'dotted' }), link('e', 'd', 'arrow')],
    );
    const l = layout(g, px);
    for (const theme of THEMES) {
      const svg = renderSvg(l, { theme, legend: false });
      for (const part of ['ursula-start-dot', 'ursula-end-ring', 'ursula-end-core', 'ursula-bar', 'ursula-note"', 'ursula-note-fold', 'ursula-actor"', 'ursula-actor-name', '<ellipse class="ursula-node-box"']) {
        expect(svg, `${theme} ${part}`).toContain(part);
      }
      expect(svg).not.toMatch(/<g [^>]*data-role=/);
      expect(svg).toContain(`data-theme="${theme}"`);
    }
  });

  it('draw a note with its corner folded by 8', () => {
    const l = layout(graphOf('LR', [shaped('n', 'note', 'Note'), shaped('t', 'rect', 'T')], [link('n', 't', 'none', { style: 'dotted' })]), px);
    const n = nodeOf(l, 'n');
    const svg = renderSvg(l, { legend: false });
    expect(svg).toContain(`d="M${n.x + n.w - 8} ${n.y}V${n.y + 8}H${n.x + n.w}"`);
  });

  /** Where a line ends on a box of a shape: the middle of a face for the shapes with one port, the middle 70 % for an ellipse. */
  const portViolations = (l: Layout, shapes: ReadonlySet<NodeShape>): string[] => {
    const bad: string[] = [];
    for (const e of l.edges) {
      for (const [p, id] of [[e.points[0], e.from], [e.points[e.points.length - 1], e.to]] as const) {
        const found = nodeOf(l, id);
        if (!p || !shapes.has(found.shape)) continue;
        // A line that comes up to an actor from below stops under the name: 16 below the figure and the height of the name.
        const n = found.shape === 'actor' && p.y > found.y + found.h + EPS ? { ...found, h: found.h + 30 } : found;
        const faces = [
          { on: Math.abs(p.y - n.y) < 0.01, off: p.x - (n.x + n.w / 2), length: n.w },
          { on: Math.abs(p.y - n.y - n.h) < 0.01, off: p.x - (n.x + n.w / 2), length: n.w },
          { on: Math.abs(p.x - n.x) < 0.01, off: p.y - (n.y + n.h / 2), length: n.h },
          { on: Math.abs(p.x - n.x - n.w) < 0.01, off: p.y - (n.y + n.h / 2), length: n.h },
        ].filter((f) => f.on);
        const reach = n.shape === 'ellipse' ? 0.35 : 0;
        if (faces.length === 0 || !faces.some((f) => Math.abs(f.off) <= reach * f.length + 0.01)) bad.push(`${e.from}->${e.to} ends off the port of ${id} (${n.shape})`);
      }
    }
    return bad;
  };

  it('take a line at the middle of a face, or in the middle 70 % for an ellipse', () => {
    const one = new Set<NodeShape>(['start-dot', 'end-dot', 'actor']);
    for (const make of [states, usecases]) {
      const l = layout(make(), px);
      expect(portViolations(l, new Set<NodeShape>([...one, 'ellipse']))).toEqual([]);
    }
  });

  it('keep the geometry sound: lines end on the border of the box they are drawn in and cross no box', () => {
    for (const make of [states, usecases, inheritance, relations, entities]) {
      const g = make();
      const l = layout(g, px);
      // An actor's line from below stops under its name, past the border of the figure; lines of one box may meet in a segment.
      const bad = geometryViolations(l).filter((v) => !v.includes('share a segment') && !(/ends off the border of (user|admin)$/.test(v)));
      expect(bad, g.nodes.map((n) => n.id).join(',')).toEqual([]);
    }
  });

  it('are drawn as boxes in a terminal, with a glyph for a dot', () => {
    const text = renderTextLayout(layout(states(), cells, { maxWidth: 80 })).join('\n');
    expect(text).toContain('●');
    expect(text).toContain('◉');
    expect(text).toContain('█');
    expect(text).toContain('┒');
    const cases = renderTextLayout(layout(usecases(), cells, { maxWidth: 100 })).join('\n');
    expect(cases).toContain('╭');
    expect(cases).toContain('o User');
  });
});

describe('the three themes', () => {
  it('draw every graph with every marker defined that a line refers to', () => {
    for (const make of [inheritance, relations, entities, states, usecases]) {
      const l = layout(make(), px);
      const sheets = new Set<string>();
      for (const theme of THEMES) {
        const svg = renderSvg(l, { theme, legend: false });
        const defined = new Set([...svg.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]));
        for (const m of svg.matchAll(/marker-(?:start|end)="url\(#([^)]+)\)"/g)) expect(defined.has(m[1] as string), `${theme} ${m[1]}`).toBe(true);
        expect(svg).not.toContain('context-stroke');
        expect(svg).toContain(`data-theme="${theme}"`);
        sheets.add(svg.slice(svg.indexOf('<style>'), svg.indexOf('</style>')));
      }
      expect(sheets.size).toBe(3);
    }
  });

  it('leave the drawing of a flowchart without records as it was', () => {
    const plain = graphOf('LR', [shaped('a', 'rect', 'A'), shaped('b', 'rect', 'B')], [link('a', 'b', 'arrow')]);
    const svg = renderSvg(layout(plain, px), { legend: false });
    expect(svg).not.toContain('ursula-rule');
    expect(svg).not.toContain('ursula-end-label');
    expect(svg).toContain('data-role="start"');
  });
});

describe('a mirrored drawing', () => {
  it('flips the texts at the ends of lines with the rest', () => {
    const g = { ...pair('diamond-filled', 'none', { startLabel: '1', endLabel: 'N' }), mirror: 'RL' as const };
    const l = layout(g, px);
    const edge = l.edges[0] as LayoutEdge;
    const first = edge.points[0] as Point;
    const start = edge.startLabel as NonNullable<LayoutEdge['startLabel']>;
    // The line was drawn left to right and flipped: its start is now on the right, and its text sits toward the left of it.
    expect(start.x + start.w).toBeLessThanOrEqual(first.x + EPS);
  });
});
