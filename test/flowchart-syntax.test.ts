// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler, render, renderText, UrsulaError } from '../src/index.ts';
import type { Graph, Layout, NodeShape } from '../src/index.ts';
import { faceOffsets, faceReach, portShape } from '../src/layered/ports.ts';
import { trimToOutline } from '../src/render/shapes.ts';

function failure(src: string): UrsulaError {
  try {
    parse(src);
  } catch (e) {
    if (e instanceof UrsulaError) return e;
    throw e;
  }
  throw new Error('expected parse to fail');
}

const nodeOf = (g: Graph, id: string): Graph['nodes'][number] => {
  const n = g.nodes.find((v) => v.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};

describe('new shape notation', () => {
  const NAMES: Array<[string, NodeShape]> = [
    ['rect', 'rect'],
    ['proc', 'rect'],
    ['process', 'rect'],
    ['rectangle', 'rect'],
    ['rounded', 'round'],
    ['event', 'round'],
    ['stadium', 'stadium'],
    ['pill', 'stadium'],
    ['terminal', 'stadium'],
    ['fr-rect', 'subroutine'],
    ['subproc', 'subroutine'],
    ['subprocess', 'subroutine'],
    ['subroutine', 'subroutine'],
    ['cyl', 'cylinder'],
    ['database', 'cylinder'],
    ['db', 'cylinder'],
    ['cylinder', 'cylinder'],
    ['circle', 'circle'],
    ['circ', 'circle'],
    ['start', 'circle'],
    ['diam', 'diamond'],
    ['decision', 'diamond'],
    ['diamond', 'diamond'],
    ['question', 'diamond'],
    ['hex', 'hexagon'],
    ['hexagon', 'hexagon'],
    ['prepare', 'hexagon'],
    ['lean-r', 'parallelogram'],
    ['lean-right', 'parallelogram'],
    ['in-out', 'parallelogram'],
    ['lean-l', 'lean-l'],
    ['trap-b', 'trap-b'],
    ['trap-t', 'trap-t'],
    ['dbl-circ', 'dbl-circle'],
    ['double-circle', 'dbl-circle'],
    ['odd', 'asym'],
  ];

  it.each(NAMES)('reads shape %s as %s', (name, shape) => {
    const node = nodeOf(parse(`flowchart TD\nA@{ shape: ${name}, label: "Text" }`), 'A');
    expect(node).toMatchObject({ shape, title: 'Text' });
    expect(node.shapeAsked).toBeUndefined();
  });

  it('uses the id as the text when there is no label', () => {
    expect(nodeOf(parse('flowchart TD\nA@{ shape: circle }'), 'A')).toMatchObject({ shape: 'circle', title: 'A' });
  });

  it('keeps the asked name of shapes that are not drawn yet, and draws them as rectangles', () => {
    const g = parse(
      'flowchart TD\nA@{ shape: doc, label: "Document" }\nB@{ shape: text, label: "Block" }\nC@{ shape: no-such-shape, label: "Odd" }\nD@{ icon: "fa:user", form: "square", label: "User", pos: "t", h: 60 }',
    );
    expect(g.nodes.map((n) => [n.id, n.shape, n.shapeAsked])).toEqual([
      ['A', 'rect', 'doc'],
      ['B', 'rect', 'text'],
      ['C', 'rect', 'no-such-shape'],
      ['D', 'rect', 'icon'],
    ]);
  });

  it('reads and ignores icon, img, pos, h, w, constraint and form', () => {
    const g = parse('flowchart TD\nA@{ img: "https://example.com/a.svg", label: "Pic", pos: "t", w: 60, h: 60, constraint: "on" }');
    expect(nodeOf(g, 'A')).toMatchObject({ title: 'Pic', shape: 'rect', shapeAsked: 'img' });
  });

  it('reads a node followed by an edge, and a quoted label that holds a comma and a brace', () => {
    const g = parse('flowchart LR\nA@{ shape: stadium, label: "Go, {now}" } --> B');
    expect(nodeOf(g, 'A')).toMatchObject({ shape: 'stadium', title: 'Go, {now}' });
    expect(g.edges).toHaveLength(1);
  });

  it('lets a later mention change the shape and keeps the text', () => {
    const g = parse('flowchart LR\nA[Start] --> B\nA@{ shape: circle }');
    expect(nodeOf(g, 'A')).toMatchObject({ shape: 'circle', title: 'Start' });
  });

  it('reads a block without node keys as properties of something else', () => {
    const g = parse('flowchart TD\nA --> B\nA@{ view: collapsed }');
    expect(g.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    expect(g.ignored).toEqual(['A@{ view: collapsed }']);
  });

  it('draws the shapes in svg', () => {
    const svg = render('flowchart LR\nA@{ shape: lean-l, label: "x" } --> B@{ shape: trap-b, label: "y" } --> C@{ shape: odd, label: "z" } --> D@{ shape: dbl-circ, label: "w" }');
    expect(svg.match(/<polygon /g)).toHaveLength(3);
    expect(svg.match(/<ellipse /g)).toHaveLength(2);
  });
});

describe('edge ids and animations', () => {
  it('reads the id before an edge', () => {
    const g = parse('flowchart LR\nA e1@--> B\nB e2@==> C\nC e3@-.-> D');
    expect(g.edges.map((e) => [e.id, e.style])).toEqual([
      ['e1', 'normal'],
      ['e2', 'thick'],
      ['e3', 'dotted'],
    ]);
  });

  it('reads the id before an edge with a label', () => {
    const g = parse('flowchart LR\nCache e3@-->|miss| DB');
    expect(g.edges[0]).toMatchObject({ id: 'e3', label: 'miss' });
  });

  it('reads and ignores animation lines and animation classes', () => {
    const g = parse(
      'flowchart LR\nA e1@--> B\ne1@{ animate: true }\ne1@{ animation: fast }\ne1@{ curve: linear }\ne1@{ step: 1 }\nclassDef animate stroke-dasharray: 9,5,animation: dash 25s linear infinite;\nclass e1 animate',
    );
    expect(g.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    expect(g.edges).toHaveLength(1);
    expect(g.ignored).toHaveLength(6);
  });

  it('carries the id to the layout and draws the edge', () => {
    const l = layout(parse('flowchart LR\nA e1@--> B'), pixelRuler());
    expect(l.edges[0]).toMatchObject({ id: 'e1' });
    expect(render('flowchart LR\nA e1@--> B\ne1@{ animate: true }')).toContain('data-from="A"');
  });
});

describe('line ends', () => {
  const ENDS: Array<[string, string | undefined, string]> = [
    ['A --> B', undefined, 'arrow'],
    ['A --- B', undefined, 'none'],
    ['A --o B', undefined, 'circle'],
    ['A --x B', undefined, 'cross'],
    ['A o--o B', 'circle', 'circle'],
    ['A x--x B', 'cross', 'cross'],
    ['A <--> B', 'arrow', 'arrow'],
    ['A -.-o B', undefined, 'circle'],
    ['A ==x B', undefined, 'cross'],
    ['A <-.-> B', 'arrow', 'arrow'],
    ['A <==> B', 'arrow', 'arrow'],
    ['A -- text --o B', undefined, 'circle'],
  ];

  it.each(ENDS)('reads %s', (line, startEnd, end) => {
    const edge = parse(`flowchart LR\n${line}`).edges[0];
    expect(edge?.startEnd).toBe(startEnd);
    expect(edge?.end).toBe(end);
  });

  it('keeps the start of a node whose id begins with o or x', () => {
    const g = parse('flowchart LR\nA --> oB\nA --> xC');
    expect(g.edges.map((e) => [e.to, e.end])).toEqual([
      ['oB', 'arrow'],
      ['xC', 'arrow'],
    ]);
  });

  it('draws a dot, a cross and arrowheads at both ends with markers of the line colour', () => {
    const svg = render('flowchart LR\nA --o B\nB --x C\nC <--> D\nD ==o E');
    expect(svg).toContain('marker-end="url(#ursula-dot)"');
    expect(svg).toContain('marker-end="url(#ursula-cross)"');
    expect(svg).toContain('marker-start="url(#ursula-arrow-start)"');
    expect(svg).toContain('marker-end="url(#ursula-dot-accent)"');
    expect(svg).toMatch(/<marker id="ursula-dot" viewBox="0 0 8 8"[^>]*><circle class="ursula-end-dot" cx="4" cy="4" r="4"\/>/);
    expect(svg).toMatch(/<marker id="ursula-cross"[^>]*><path class="ursula-end-cross" d="M1\.17 1\.17L6\.83 6\.83M6\.83 1\.17L1\.17 6\.83"\/>/);
    expect(svg).not.toContain('context-stroke');
    expect(svg).toContain('.ursula-end-dot{fill:var(--ursula-line');
  });

  it('writes no mark rules or markers when no line has such an end', () => {
    const svg = render('flowchart LR\nA --> B');
    expect(svg).not.toContain('ursula-end-');
    expect(svg).not.toContain('ursula-dot');
  });

  it('draws a plain line without an arrowhead and a line with ends', () => {
    const svg = render('flowchart LR\nA --- B\nB o--x C');
    expect(svg.match(/marker-end=/g)).toHaveLength(1);
    expect(svg).toContain('marker-start="url(#ursula-dot)"');
    expect(render('flowchart LR\nA --x B')).toContain('marker-end="url(#ursula-cross)"');
  });

  it('carries the ends to the layout', () => {
    const l = layout(parse('flowchart LR\nA o--x B'), pixelRuler());
    expect(l.edges[0]).toMatchObject({ startEnd: 'circle', end: 'cross' });
  });
});

describe('new node shapes in brackets', () => {
  const BRACKETS: Array<[string, NodeShape]> = [
    ['id1>This is the text in the box]', 'asym'],
    ['id1[\\This is the text in the box\\]', 'lean-l'],
    ['id1[/Christmas\\]', 'trap-b'],
    ['id1[\\Go shopping/]', 'trap-t'],
    ['id1(((This is the text in the circle)))', 'dbl-circle'],
    ['id1[/This is the text in the box/]', 'parallelogram'],
    ['id1((This is the text in the circle))', 'circle'],
  ];

  it.each(BRACKETS)('reads %s as %s', (decl, shape) => {
    const node = nodeOf(parse(`flowchart TD\n${decl}`), 'id1');
    expect(node.shape).toBe(shape);
    expect(node.title.startsWith('This') || node.title === 'Christmas' || node.title === 'Go shopping').toBe(true);
  });

  it('reads the quoted label of each', () => {
    for (const decl of ['a>"x y"]', 'a[\\"x y"\\]', 'a[/"x y"\\]', 'a[\\"x y"/]', 'a((("x y")))']) {
      expect(nodeOf(parse(`flowchart TD\n${decl}`), 'a').title).toBe('x y');
    }
  });

  const polygon = (decl: string): Array<[number, number]> => {
    const svg = render(`flowchart TD\n${decl}`);
    const pts = /<polygon class="ursula-node-box" points="([^"]+)"/.exec(svg)?.[1] ?? '';
    return pts.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
  };

  it('draws asym with a notch a quarter of the height deep on the left', () => {
    const l = layout(parse('flowchart TD\na>x]'), pixelRuler());
    const n = l.nodes[0];
    const pts = polygon('a>x]');
    expect(pts).toHaveLength(5);
    expect(pts[4]).toEqual([n?.x === undefined ? NaN : Math.round(((n.x + (n.h ?? 0) / 4) * 100)) / 100, (n?.y ?? 0) + (n?.h ?? 0) / 2]);
    expect(pts[1]?.[0]).toBe((n?.x ?? 0) + (n?.w ?? 0));
  });

  it('draws lean-l, trap-b and trap-t with slanted sides', () => {
    for (const [decl, wide] of [
      ['a[\\x\\]', 'none'],
      ['a[/x\\]', 'bottom'],
      ['a[\\x/]', 'top'],
    ] as const) {
      const pts = polygon(decl);
      expect(pts).toHaveLength(4);
      const top = Math.abs((pts[1]?.[0] ?? 0) - (pts[0]?.[0] ?? 0));
      const bottom = Math.abs((pts[2]?.[0] ?? 0) - (pts[3]?.[0] ?? 0));
      if (wide === 'bottom') expect(bottom).toBeGreaterThan(top);
      if (wide === 'top') expect(top).toBeGreaterThan(bottom);
      if (wide === 'none') expect(top).toBeCloseTo(bottom, 5);
    }
    const lean = polygon('a[\\x\\]');
    expect(lean[0]?.[0]).toBeLessThan(lean[3]?.[0] ?? 0);
  });

  it('draws dbl-circle as two ellipses 4 apart', () => {
    const svg = render('flowchart TD\na(((x)))');
    const [outer, inner] = [...svg.matchAll(/<ellipse [^>]*rx="([\d.]+)" ry="([\d.]+)"/g)];
    expect(Number(outer?.[1]) - Number(inner?.[1])).toBe(4);
    expect(Number(outer?.[2]) - Number(inner?.[2])).toBe(4);
  });

  it('gives the new shapes the ports of the nearest shape', () => {
    expect(portShape('asym')).toBe('parallelogram');
    expect(portShape('lean-l')).toBe('parallelogram');
    expect(portShape('trap-b')).toBe('parallelogram');
    expect(portShape('trap-t')).toBe('parallelogram');
    expect(portShape('dbl-circle')).toBe('circle');
    for (const face of ['left', 'top'] as const) {
      expect(faceReach('trap-b', face, 96, 48, false)).toBe(faceReach('parallelogram', face, 96, 48, false));
      expect(faceReach('dbl-circle', face, 96, 48, false)).toBe(faceReach('circle', face, 96, 48, false));
      expect(faceOffsets('asym', face, 96, 48, 24, 2, false)).toEqual(faceOffsets('parallelogram', face, 96, 48, 24, 2, false));
    }
  });

  it('pulls a line end onto the outline of a slanted shape, a notch and a double circle', () => {
    const box = { x: 0, y: 0, w: 100, h: 40 };
    const into = (shape: NodeShape, end: { x: number; y: number }, next: { x: number; y: number }): { x: number; y: number } => trimToOutline({ ...box, shape }, end, next);
    expect(into('lean-l', { x: 0, y: 20 }, { x: -40, y: 20 }).x).toBeGreaterThan(0);
    expect(into('trap-b', { x: 0, y: 20 }, { x: -40, y: 20 }).x).toBeGreaterThan(0);
    expect(into('asym', { x: 0, y: 20 }, { x: -40, y: 20 })).toEqual({ x: 10, y: 20 });
    expect(into('dbl-circle', { x: 0, y: 20 }, { x: -40, y: 20 }).x).toBeCloseTo(0, 5);
  });

  it('lays a drawing with the new shapes out', () => {
    const l = layout(parse('flowchart LR\na>x] --> b[\\y\\] --> c[/z\\] --> d[\\w/] --> e(((v)))'), pixelRuler());
    expect(l.nodes.map((n) => n.shape)).toEqual(['asym', 'lean-l', 'trap-b', 'trap-t', 'dbl-circle']);
  });
});

describe('invisible links', () => {
  it('reads a ~~~ line as invisible', () => {
    const e = parse('flowchart LR\nA ~~~ B').edges[0];
    expect(e).toMatchObject({ from: 'A', to: 'B', invisible: true });
  });

  it('keeps the invisible edge in the layout and draws nothing for it', () => {
    const l = layout(parse('flowchart LR\nA ~~~ B'), pixelRuler());
    expect(l.edges).toHaveLength(1);
    expect(l.edges[0]?.invisible).toBe(true);
    const svg = render('flowchart LR\nA ~~~ B');
    expect(svg).not.toContain('class="ursula-edge ');
    expect(svg).not.toContain('data-from=');
  });

  it('places the second node after the first as a visible line would', () => {
    const hidden = layout(parse('flowchart LR\nA ~~~ B'), pixelRuler());
    const shown = layout(parse('flowchart LR\nA --> B'), pixelRuler());
    expect(hidden.nodes.map((n) => [n.x, n.y])).toEqual(shown.nodes.map((n) => [n.x, n.y]));
  });

  it('draws nothing for it in text and leaves it out of the legend', () => {
    const text = renderText('flowchart LR\nA ~~~ B', 80);
    expect('lines' in text && text.lines[1]).toBe('│ A │   │ B │');
    const l = layout(parse('flowchart LR\nA --> B\nB ~~~ C\nC -.-> D'), pixelRuler());
    expect(l.legend?.items.map((i) => i.style)).toEqual(['normal', 'dotted']);
  });
});

describe('node lists with &', () => {
  it('expands A & B --> C & D to the product, left list first', () => {
    const g = parse('flowchart TB\nA & B --> C & D');
    expect(g.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['A>C', 'A>D', 'B>C', 'B>D']);
    expect(g.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('expands inside a chain', () => {
    const g = parse('flowchart LR\na --> b & c--> d');
    expect(g.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>b', 'a>c', 'b>d', 'c>d']);
  });

  it('gives each line of the product the label and the ends', () => {
    const g = parse('flowchart LR\nA & B -->|go| C & D');
    expect(g.edges.every((e) => e.label === 'go' && e.end === 'arrow')).toBe(true);
  });

  it('draws it', () => {
    expect(render('flowchart TB\nA & B --> C & D').match(/class="ursula-edge /g)).toHaveLength(4);
  });
});

describe('long lines', () => {
  const CASES: Array<[string, string, number | undefined]> = [
    ['A --> B', 'normal', undefined],
    ['A ---> B', 'normal', 2],
    ['A ----> B', 'normal', 3],
    ['A ---- B', 'normal', 2],
    ['A ===> B', 'thick', 2],
    ['A ==== B', 'thick', 2],
    ['A -..-> B', 'dotted', 2],
    ['A -...- B', 'dotted', 3],
    ['A ---->|No| B', 'normal', 3],
    ['A -- No ----> B', 'normal', 3],
  ];

  it.each(CASES)('reads %s as a %s line of length %s', (line, style, minLength) => {
    const e = parse(`flowchart LR\n${line}`).edges[0];
    expect(e?.style).toBe(style);
    expect(e?.minLength).toBe(minLength);
  });

  it('keeps the label of a long line', () => {
    expect(parse('flowchart TD\nB ---->|No| E[End]').edges[0]).toMatchObject({ label: 'No', to: 'E' });
  });
});

describe('classes and styles', () => {
  it('reads and ignores them and lists them', () => {
    const g = parse(
      'flowchart LR\nA:::someclass --> B\nclassDef someclass fill:#f96\nclass A,B someclass\nstyle A fill:#fff\nlinkStyle 0 stroke:red\nA:::foo & B:::bar --> C:::foobar',
    );
    expect(g.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C']);
    expect(g.edges).toHaveLength(3);
    expect(g.ignored).toEqual(['A:::someclass', 'classDef someclass fill:#f96', 'class A,B someclass', 'style A fill:#fff', 'linkStyle 0 stroke:red', 'A:::foo', 'B:::bar', 'C:::foobar']);
  });

  it('has no ignored list when nothing was ignored', () => {
    expect(parse('flowchart LR\nA --> B').ignored).toBeUndefined();
  });
});

describe('markdown text', () => {
  it('drops the marks and keeps the line breaks of a backtick string', () => {
    const g = parse('flowchart LR\nmarkdown["`This **is** _Markdown_`"]\nnewLines["`Line1\n    Line 2\n    Line 3`"]\nmarkdown --> newLines');
    expect(nodeOf(g, 'markdown').title).toBe('This is Markdown');
    expect(nodeOf(g, 'newLines')).toMatchObject({ title: 'Line1', lines: ['Line 2', 'Line 3'] });
  });

  it('reads ~~ and * marks and keeps snake_case words', () => {
    expect(nodeOf(parse('flowchart LR\na["`~~old~~ *new* snake_case_name`"]'), 'a').title).toBe('old new snake_case_name');
  });

  it('reads it in edge labels and subgraph titles', () => {
    const g = parse('swimlane-beta LR\nsubgraph "`**Two**`"\nc("`The **cat**\n  in the hat`") -- "`Bold **edge label**`" --> d\nend');
    expect(g.lanes[0]?.label).toBe('Two');
    expect(g.edges[0]?.label).toBe('Bold edge label');
    expect(nodeOf(g, 'c')).toMatchObject({ title: 'The cat', lines: ['in the hat'] });
  });

  it('turns <br> and <br/> inside quotes into line breaks', () => {
    expect(nodeOf(parse('flowchart LR\na["one<br>two<br/>three"]'), 'a')).toMatchObject({ title: 'one', lines: ['two', 'three'] });
  });
});

describe('directions RL and BT', () => {
  const SRC = 'A[Start] -->|go| B{Choice}\nB --> C\nB -.-> D\nsubgraph G[Group]\nE --> F\nend\nC --> E';
  const draw = (header: string): Layout => layout(parse(`${header}\n${SRC}`), pixelRuler(), { legend: false });

  it('reads them as LR and TD with a mirror', () => {
    expect(parse('flowchart RL\nA')).toMatchObject({ direction: 'LR', mirror: 'RL' });
    expect(parse('graph BT\nA')).toMatchObject({ direction: 'TD', mirror: 'BT' });
    expect(parse('flowchart LR\nA').mirror).toBeUndefined();
  });

  it('mirrors the nodes of RL about the middle of the drawing and keeps their rows', () => {
    const lr = draw('swimlane-beta LR');
    const rl = draw('swimlane-beta RL');
    expect(rl.direction).toBe('RL');
    expect(rl.width).toBe(lr.width);
    expect(rl.height).toBe(lr.height);
    for (const a of lr.nodes) {
      const b = rl.nodes.find((n) => n.id === a.id);
      expect(b?.x).toBeCloseTo(lr.width - a.x - a.w, 4);
      expect(b?.y).toBe(a.y);
      expect([b?.w, b?.h]).toEqual([a.w, a.h]);
    }
  });

  it('mirrors the nodes of BT about the middle of the drawing', () => {
    const td = draw('swimlane-beta TD');
    const bt = draw('swimlane-beta BT');
    expect(bt.direction).toBe('BT');
    for (const a of td.nodes) {
      const b = bt.nodes.find((n) => n.id === a.id);
      expect(b?.y).toBeCloseTo(td.height - a.y - a.h, 4);
      expect(b?.x).toBe(a.x);
    }
  });

  it('mirrors the points of the edges, their labels and the bands of subgraphs', () => {
    const lr = draw('swimlane-beta LR');
    const rl = draw('swimlane-beta RL');
    lr.edges.forEach((e, i) => {
      const m = rl.edges[i];
      e.points.forEach((p, k) => {
        expect(m?.points[k]?.x).toBeCloseTo(lr.width - p.x, 4);
        expect(m?.points[k]?.y).toBe(p.y);
      });
      if (e.label) expect(m?.label?.x).toBeCloseTo(lr.width - e.label.x - e.label.w, 4);
    });
    lr.lanes.forEach((a, i) => {
      const b = rl.lanes[i];
      expect(b?.x).toBeCloseTo(lr.width - a.x - a.w, 4);
      expect(b?.labelBox.x).toBeCloseTo(lr.width - a.labelBox.x - a.labelBox.w, 4);
      expect(b?.labelBox.y).toBe(a.labelBox.y);
    });
  });

  it('keeps text upright: a label sits at the middle of its mirrored box', () => {
    const svg = render(`swimlane-beta RL\n${SRC}`);
    const rl = draw('swimlane-beta RL');
    const a = rl.nodes.find((n) => n.id === 'A');
    expect(svg).toContain(`<text class="ursula-node-title" x="${Math.round(((a?.x ?? 0) + (a?.w ?? 0) / 2) * 100) / 100}"`);
  });

  it('keeps the legend below the drawing', () => {
    const l = layout(parse('flowchart RL\nA --> B\nA -.-> C'), pixelRuler());
    expect(l.legend).toBeDefined();
    expect(l.legend?.y).toBe(l.legend?.base.height);
  });

  it('draws text as LR or TD and says so', () => {
    const rl = renderText('flowchart RL\nA --> B', 60);
    const lr = renderText('flowchart LR\nA --> B', 60);
    expect(rl).toEqual(lr);
    const laid = layout(parse('flowchart BT\nA --> B'), cellRuler());
    expect(laid.direction).toBe('TD');
    expect(laid.diagnostics.map((d) => d.kind)).toContain('direction-mirrored-in-text');
  });
});

describe('subgraphs as boxes', () => {
  it('reads nested subgraphs, a direction inside one, and an edge that ends at one', () => {
    const g = parse('flowchart LR\nsubgraph a\ndirection TB\nsubgraph b\ndirection RL\nX --> Y\nend\nend\nC --> a');
    expect(g.clusters).toEqual([
      { id: 'a', label: 'a', direction: 'TD' },
      { id: 'b', label: 'b', parent: 'a', direction: 'LR', mirror: 'RL' },
    ]);
    expect(g.nodes.map((n) => [n.id, n.cluster])).toEqual([['X', 'b'], ['Y', 'b'], ['C', undefined]]);
    expect(g.edges.map((e) => [e.from, e.to])).toEqual([['X', 'Y'], ['C', 'a']]);
    expect(g.lanes).toEqual([{ id: '_', label: '' }]);
  });

  it('reads a subgraph named in an edge before it is opened as a cluster, not as a node', () => {
    const g = parse('flowchart TD\nStart --> one\nsubgraph one [My Group]\nA --> B\nend');
    expect(g.nodes.map((n) => n.id)).toEqual(['Start', 'A', 'B']);
    expect(g.clusters).toEqual([{ id: 'one', label: 'My Group' }]);
  });

  it('keeps flat subgraphs without a direction or an edge to them as lanes', () => {
    const g = parse('swimlane-beta LR\nsubgraph a\nA --> B\nend\nsubgraph b\nC\nend\nB --> C');
    expect(g.clusters).toBeUndefined();
    expect(g.lanes.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('leaves out a subgraph with nothing in it and the edges that end at it', () => {
    const g = parse('flowchart LR\nsubgraph a\nsubgraph b\nend\nX --> Y\nend\nsubgraph e\nend\nQ --> e');
    expect(g.clusters?.map((c) => c.id)).toEqual(['a']);
    expect(g.edges.map((e) => [e.from, e.to])).toEqual([['X', 'Y']]);
  });
});

/** Mermaid documentation examples, one or two per rule, and every example that is refused. */
const EXAMPLES: Array<[string, string]> = [
  ['04 markdown formatting', 'flowchart LR\n    markdown["`This **is** _Markdown_`"]\n    newLines["`Line1\n    Line 2\n    Line 3`"]\n    markdown --> newLines'],
  [
    '105 markdown strings',
    'swimlane-beta LR\nsubgraph "One"\n  a("`The **cat**\n  in the hat`") -- "edge label" --> b{{"`The **dog** in the hog`"}}\nend\nsubgraph "`**Two**`"\n  c("`The **cat**\n  in the hat`") -- "`Bold **edge label**`" --> d("The dog in the hog")\nend',
  ],
  ['14 asymmetric', 'flowchart LR\n    id1>This is the text in the box]'],
  ['18 parallelogram alt', 'flowchart TD\n    id1[\\This is the text in the box\\]'],
  ['19 trapezoid', 'flowchart TD\n    A[/Christmas\\]'],
  ['20 trapezoid alt', 'flowchart TD\n    B[\\Go shopping/]'],
  ['21 double circle', 'flowchart TD\n    id1(((This is the text in the circle)))'],
  [
    '22 new shapes in RL',
    'flowchart RL\n    A@{ shape: manual-file, label: "File Handling"}\n    B@{ shape: manual-input, label: "User Input"}\n    C@{ shape: docs, label: "Multiple Documents"}\n    D@{ shape: procs, label: "Process Automation"}\n    E@{ shape: paper-tape, label: "Paper Records"}',
  ],
  ['23 process', 'flowchart TD\n    A@{ shape: rect, label: "This is a process" }'],
  ['24 event', 'flowchart TD\n    A@{ shape: rounded, label: "This is an event" }'],
  ['26 subprocess', 'flowchart TD\n    A@{ shape: subproc, label: "This is a subprocess" }'],
  ['29 odd', 'flowchart TD\n    A@{ shape: odd, label: "Odd shape" }'],
  ['33 data input output 2', 'flowchart TD\n    A@{ shape: lean-l, label: "Output/Input" }'],
  ['38 text block', 'flowchart TD\n    A@{ shape: text, label: "This is a text block" }'],
  ['43 fork join', 'flowchart TD\n    A@{ shape: fork, label: "Fork or Join" }'],
  ['69 icon shape', 'flowchart TD\n    A@{ icon: "fa:user", form: "square", label: "User Icon", pos: "t", h: 60 }'],
  [
    '70 image shape',
    'flowchart TD\n  %% My image with a constrained aspect ratio\n  A@{ img: "https://mermaid.js.org/favicon.svg", label: "My example image label", pos: "t", h: 60, constraint: "on" }',
  ],
  ['81 invisible link', 'flowchart LR\n    A ~~~ B'],
  ['83 chaining of links 2', 'flowchart LR\n   a --> b & c--> d'],
  ['84 chaining of links 3', 'flowchart TB\n    A & B--> C & D'],
  ['86 edge id', 'flowchart LR\n  A e1@--> B'],
  ['87 animation on', 'flowchart LR\n  A e1@==> B\n  e1@{ animate: true }'],
  ['88 animation type', 'flowchart LR\n  A e1@--> B\n  e1@{ animation: fast }'],
  ['89 classDef animation', 'flowchart LR\n  A e1@--> B\n  classDef animate stroke-dasharray: 9,5,stroke-dashoffset: 900,animation: dash 25s linear infinite;\n  class e1 animate'],
  [
    '90 step by step',
    'flowchart LR\n  Client e1@--> API\n  API e2@--> Cache\n  Cache e3@-->|miss| DB\n  DB e4@--> API\n  API e5@--> Client\n  e1@{ step: 1 }\n  e2@{ step: 2 }\n  e3@{ step: 3 }\n  e4@{ step: 4 }\n  e5@{ step: 5 }',
  ],
  ['92 circle edge', 'flowchart LR\n    A --o B'],
  ['93 cross edge', 'flowchart LR\n    A --x B'],
  ['94 multi directional', 'flowchart LR\n    A o--o B\n    B <--> C\n    C x--x D'],
  ['95 minimum length', 'flowchart TD\n    A[Start] --> B{Is it?}\n    B -->|Yes| C[OK]\n    C --> D[Rethink]\n    D --> B\n    B ---->|No| E[End]'],
  ['96 minimum length 2', 'flowchart TD\n    A[Start] --> B{Is it?}\n    B -- Yes --> C[OK]\n    C --> D[Rethink]\n    D --> B\n    B -- No ----> E[End]'],
  ['109 curve by id', 'flowchart LR\n    A e1@==> B\n    A e2@--> C\n    e1@{ curve: linear }\n    e2@{ curve: natural }'],
  ['112 classes 2', 'flowchart LR\n    A:::foo & B:::bar --> C:::foobar\n    classDef foo stroke:#f00\n    classDef bar stroke:#0f0\n    classDef foobar stroke:#00f'],
];

/** The examples that need subgraphs as boxes. */
const BOXED: Array<[string, string]> = [
  [
    '101 flowcharts',
    'flowchart TB\n    c1-->a2\n    subgraph one\n    a1-->a2\n    end\n    subgraph two\n    b1-->b2\n    end\n    subgraph three\n    c1-->c2\n    end\n    one --> two\n    three --> two\n    two --> c2',
  ],
  ['102 direction in subgraphs', 'flowchart LR\n  subgraph TOP\n    direction TB\n    subgraph B1\n        direction RL\n        i1 -->f1\n    end\n    subgraph B2\n        direction BT\n        i2 -->f2\n    end\n  end\n  A --> TOP --> B\n  B1 --> B2'],
  [
    '103 limitation',
    'flowchart LR\n    subgraph subgraph1\n        direction TB\n        top1[top] --> bottom1[bottom]\n    end\n    subgraph subgraph2\n        direction TB\n        top2[top] --> bottom2[bottom]\n    end\n    outside --> subgraph1\n    outside ---> top2',
  ],
  ['104 collapsible subgraphs', 'flowchart TD\n    Start --> one\n    subgraph one [My Group]\n        A --> B\n        B --> C\n    end\n    one --> End\n    one@{ view: collapsed }'],
];

describe('documentation examples', () => {
  it.each(EXAMPLES)('draws %s without an error', (_name, src) => {
    const svg = render(src);
    expect(svg.startsWith('<svg')).toBe(true);
    const text = renderText(src, 100);
    expect('error' in text).toBe(false);
  });

  it.each(BOXED)('draws %s as boxes and, in text, as bands with a note', (_name, src) => {
    const svg = render(src);
    expect(svg).toContain('data-cluster=');
    const text = renderText(src, 100);
    expect('error' in text).toBe(false);
    const laid = layout(parse(src), cellRuler());
    expect(laid.diagnostics.map((d) => d.kind)).toContain('clusters-flattened-in-text');
    expect(laid.clusters).toBeUndefined();
  });
});
