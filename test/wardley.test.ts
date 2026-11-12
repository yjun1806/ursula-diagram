// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { pixelRuler } from '../src/metrics.ts';
import { layoutWardley } from '../src/wardley/layout.ts';
import { parseWardley } from '../src/wardley/parse.ts';
import type { Scene } from '../src/types.ts';

const ruler = pixelRuler();

const BASIC = `wardley-beta
title Tea Shop Value Chain

anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61]
component Tea [0.63, 0.81]
component Hot Water [0.52, 0.80]
component Kettle [0.43, 0.35]
component Power [0.10, 0.70]

Business -> Cup of Tea
Cup of Tea -> Tea
Cup of Tea -> Hot Water
Hot Water -> Kettle
Kettle -> Power

evolve Kettle 0.62
evolve Power 0.89

note "Standardising power allows Kettles to evolve faster" [0.30, 0.49]
`;

const LINKS = `wardley-beta
title Link Types

component User [0.90, 0.95]
component App [0.75, 0.75]
component API [0.60, 0.60]
component Cache [0.65, 0.45]
component Database [0.15, 0.80]

User -> App
App +> API
API -> Database
API +<> Cache
Cache +'backup'> Database
`;

const SOURCING = `wardley-beta
title Sourcing Strategy

anchor Customer [0.80, 0.95]
component Custom App [0.45, 0.85] (build)
component Off-the-shelf Tool [0.85, 0.65] (buy)
component Managed Service [0.60, 0.40] (outsource)
component Cloud Platform [0.95, 0.25] (market)
component Legacy System [0.45, 0.40] (inertia)

Customer -> Custom App
Custom App -> Off-the-shelf Tool
`;

const PIPELINE = `wardley-beta
title Pipeline Evolution

component Database [0.40, 0.60]

pipeline Database {
  component "File System" [0.25]
  component "SQL DB" [0.50]
  component "NoSQL" [0.70]
  component "Cloud DB" [0.85]
}
`;

const STAGES = `wardley-beta
evolution Genesis@0.2 -> Custom@0.4 -> Product@0.75 -> Commodity@1.0
component Novel [0.75, 0.15]
component Utility [0.60, 0.90]
`;

const EXAMPLES: Record<string, string> = {
  '01-basic-example.mmd': "wardley-beta\ntitle Tea Shop Value Chain\n\nanchor Business [0.95, 0.63]\ncomponent Cup of Tea [0.79, 0.61]\ncomponent Tea [0.63, 0.81]\ncomponent Hot Water [0.52, 0.80]\ncomponent Kettle [0.43, 0.35]\ncomponent Power [0.10, 0.70]\n\nBusiness -> Cup of Tea\nCup of Tea -> Tea\nCup of Tea -> Hot Water\nHot Water -> Kettle\nKettle -> Power\n\nevolve Kettle 0.62\nevolve Power 0.89\n\nnote \"Standardising power allows Kettles to evolve faster\" [0.30, 0.49]\n",
  '02-diagram-declaration.mmd': "wardley-beta\ntitle Your Map Title\nsize [1100, 600]\n",
  '03-coordinate-system.mmd': "wardley-beta\ntitle Coordinate Examples\n\ncomponent Infrastructure [0.30, 0.20]        %% Low visibility, low evolution\ncomponent Product [0.70, 0.60]               %% High visibility, mid evolution\ncomponent User Need [0.90, 0.95]             %% High visibility, high evolution\n",
  '04-components.mmd': "wardley-beta\ntitle Components\n\ncomponent API [0.60, 0.70]\ncomponent Database [0.40, 0.85] label [-50, 10]\ncomponent \"Custom Service\" [0.55, 0.35]\n",
  '05-components-2.mmd': "wardley-beta\ntitle Hyphenated Names\n\ncomponent real-time processing [0.55, 0.40]\ncomponent end-user [0.90, 0.95]\n\nend-user -> real-time processing\n",
  '06-anchors.mmd': "wardley-beta\ntitle Anchors\n\nanchor Customer [0.90, 0.95]\nanchor Business [0.85, 0.90]\n\ncomponent Service [0.70, 0.75]\n\nCustomer -> Service\nBusiness -> Service\n",
  '07-inertia.mmd': "wardley-beta\ntitle Inertia\n\ncomponent Legacy System [0.45, 0.40] (inertia)\ncomponent New Platform [0.65, 0.45]\n\nLegacy System -> New Platform\n",
  '08-source-strategy.mmd': "wardley-beta\ntitle Sourcing Strategy\n\nanchor Customer [0.80, 0.95]\ncomponent Custom App [0.45, 0.85] (build)\ncomponent Off-the-shelf Tool [0.85, 0.65] (buy)\ncomponent Managed Service [0.60, 0.40] (outsource)\ncomponent Cloud Platform [0.95, 0.25] (market)\n\nCustomer -> Custom App\nCustom App -> Off-the-shelf Tool\nCustom App -> Managed Service\nOff-the-shelf Tool -> Cloud Platform\n",
  '09-links-and-dependencies.mmd': "wardley-beta\ntitle Link Types\n\ncomponent User [0.90, 0.95]\ncomponent App [0.75, 0.75]\ncomponent API [0.60, 0.60]\ncomponent Cache [0.65, 0.45]\ncomponent Database [0.15, 0.80]\n\nUser -> App\nApp +> API\nAPI -> Database\nAPI +<> Cache\nCache +'backup'> Database\n",
  '10-evolution-arrows.mmd': "wardley-beta\ntitle Evolution\n\ncomponent Database [0.40, 0.50]\ncomponent API [0.55, 0.60]\n\nDatabase -> API\n\nevolve Database 0.75\nevolve API 0.80\n",
  '11-pipelines.mmd': "wardley-beta\ntitle Pipeline Evolution\n\ncomponent Database [0.40, 0.60]\n\npipeline Database {\n  component \"File System\" [0.25]\n  component \"SQL DB\" [0.50]\n  component \"NoSQL\" [0.70]\n  component \"Cloud DB\" [0.85]\n}\n",
  '12-custom-evolution-stages.mmd': "wardley-beta\ntitle Custom Stages\n\nevolution Unmodelled -> Divergent -> Convergent -> Modelled\n\ncomponent Raw Data [0.15, 0.20]\ncomponent Analysis [0.45, 0.50]\ncomponent Reports [0.75, 0.70]\n",
  '13-dual-labels.mmd': "wardley-beta\ntitle Dual Label Stages\n\nevolution Genesis / Concept -> Custom / Emerging -> Product / Converging -> Commodity / Accepted\n\ncomponent Novel Idea [0.05, 0.20]\ncomponent Custom Solution [0.35, 0.50]\ncomponent Product [0.65, 0.70]\ncomponent Utility [0.95, 0.90]\n",
  '14-custom-stage-widths.mmd': "wardley-beta\ntitle Custom Widths\n\nevolution Genesis@0.2 -> Custom@0.4 -> Product@0.75 -> Commodity@1.0\n\ncomponent Novel [0.75, 0.15]\ncomponent Bespoke [0.70, 0.35]\ncomponent Product [0.65, 0.65]\ncomponent Utility [0.60, 0.90]\n",
  '15-notes.mmd': "wardley-beta\ntitle Notes\n\ncomponent API [0.60, 0.70]\ncomponent Database [0.40, 0.50]\n\nAPI -> Database\n\nnote \"Critical decision point\" [0.65, 0.55]\nnote \"High risk area\" [0.40, 0.35]\n",
  '16-numbered-annotations.mmd': "wardley-beta\ntitle Annotations\n\ncomponent API [0.60, 0.70]\ncomponent Cache [0.50, 0.55]\ncomponent Database [0.40, 0.40]\n\nAPI -> Cache\nCache -> Database\n\nannotations [0.10, 0.90]\nannotation 1,[0.60, 0.65] \"Critical component\"\nannotation 2,[0.50, 0.50] \"Performance layer\"\nannotation 3,[0.40, 0.35] \"Data persistence\"\n",
  '17-accelerators-and-deaccelerators.mmd': "wardley-beta\ntitle Forces\n\ncomponent Legacy [0.20, 0.85]\ncomponent Modern [0.55, 0.60]\ncomponent AI [0.70, 0.35]\n\nLegacy -> Modern\nModern -> AI\n\naccelerator \"AI Adoption\" [0.55, 0.25]\ndeaccelerator \"Legacy Constraints\" [0.15, 0.75]\n",
  '18-custom-canvas-size.mmd': "wardley-beta\ntitle Custom Size\nsize [800, 1000]\n",
  '19-complete-example.mmd': "wardley-beta\ntitle Software Platform Strategy\nsize [1100, 800]\n\nevolution Genesis@0.25 -> Custom@0.5 -> Product@0.75 -> Commodity@1.0\n\nanchor Customer [0.90, 0.95]\n\ncomponent \"Mobile App\" [0.80, 0.85] (build)\ncomponent \"Web App\" [0.75, 0.80] label [-60, 10] (build)\ncomponent \"API Gateway\" [0.70, 0.65] (buy)\ncomponent \"Auth Service\" [0.60, 0.55] (outsource)\ncomponent \"Database\" [0.50, 0.45] (buy) (inertia)\ncomponent \"Cloud Platform\" [0.30, 0.95] (market)\n\nCustomer -> \"Mobile App\"\nCustomer -> \"Web App\"\n\"Mobile App\" -> \"API Gateway\"\n\"Web App\" -> \"API Gateway\"\n\"API Gateway\" -> \"Auth Service\"\n\"API Gateway\" -> \"Database\"\n\"Database\" -> \"Cloud Platform\"\n\nevolve \"API Gateway\" 0.85\nevolve \"Database\" 0.75\n\naccelerator \"Cloud Native\" [0.20, 0.85]\ndeaccelerator \"Legacy Data\" [0.45, 0.35]\n\nannotations [0.10, 0.20]\nannotation 1,[0.78, 0.82] \"User touchpoints\"\nannotation 2,[0.70, 0.60] \"Integration layer\"\nannotation 3,[0.50, 0.40] \"Data persistence\"\n\nnote \"Build mobile-first experience\" [0.85, 0.90]\nnote \"Migrate to cloud-native database\" [0.60, 0.50]\n",
};

const textBoxes = (scene: Scene): Array<{ text: string; x0: number; x1: number; y0: number; y1: number }> =>
  scene.items.flatMap((it) => {
    if (it.kind !== 'text') return [];
    const role = it.role?.includes('title') || it.role?.includes('name') ? 'title' : 'line';
    const w = ruler.textWidth(it.text, role);
    const x0 = it.anchor === 'end' ? it.x - w : it.anchor === 'middle' ? it.x - w / 2 : it.x;
    return [{ text: it.text, x0, x1: x0 + w, y0: it.y - 8, y1: it.y + 8 }];
  });

describe('wardley map reading', () => {
  it('reads components, anchors, links, evolve and notes', () => {
    const m = parseWardley(BASIC);
    expect(m.title).toBe('Tea Shop Value Chain');
    expect(m.nodes.map((n) => [n.name, n.kind, n.visibility, n.evolution])).toEqual([
      ['Business', 'anchor', 0.95, 0.63],
      ['Cup of Tea', 'component', 0.79, 0.61],
      ['Tea', 'component', 0.63, 0.81],
      ['Hot Water', 'component', 0.52, 0.8],
      ['Kettle', 'component', 0.43, 0.35],
      ['Power', 'component', 0.1, 0.7],
    ]);
    expect(m.links.map((l) => `${l.from}>${l.to}`)).toEqual(['Business>Cup of Tea', 'Cup of Tea>Tea', 'Cup of Tea>Hot Water', 'Hot Water>Kettle', 'Kettle>Power']);
    expect(m.evolves.map((e) => [e.name, e.target])).toEqual([['Kettle', 0.62], ['Power', 0.89]]);
    expect(m.notes[0]).toMatchObject({ text: 'Standardising power allows Kettles to evolve faster', visibility: 0.3, evolution: 0.49 });
  });

  it('reads the link notations', () => {
    const m = parseWardley(LINKS);
    expect(m.links.map((l) => [l.kind, l.label])).toEqual([['plain', undefined], ['flow', undefined], ['plain', undefined], ['flow-both', undefined], ['flow-labeled', 'backup']]);
  });

  it('reads decorators, label offsets and quoted names', () => {
    const m = parseWardley(`wardley-beta\ncomponent "Web App" [0.75, 0.80] label [-60, 10] (build) (inertia)\n`);
    expect(m.nodes[0]).toMatchObject({ name: 'Web App', sourcing: 'build', inertia: true, labelOffset: { dx: -60, dy: 10 } });
  });

  it('reads stage boundaries and dual names', () => {
    const m = parseWardley(`wardley-beta\nevolution Genesis / Concept -> Custom@0.4 -> Product -> Commodity@1.0\n`);
    expect(m.stages.map((s) => s.names)).toEqual([['Genesis', 'Concept'], ['Custom'], ['Product'], ['Commodity']]);
    expect(m.stages.map((s) => s.end)).toEqual([0.2, 0.4, 0.7, 1]);
  });

  it('reads pipeline children at the visibility of the parent', () => {
    const m = parseWardley(PIPELINE);
    expect(m.pipelines[0]?.children).toEqual(['File System', 'SQL DB', 'NoSQL', 'Cloud DB']);
    expect(m.nodes.filter((n) => n.pipeline !== undefined).map((n) => [n.visibility, n.evolution])).toEqual([[0.4, 0.25], [0.4, 0.5], [0.4, 0.7], [0.4, 0.85]]);
  });

  it('reads annotations, forces and the predicted place', () => {
    const m = parseWardley(`wardley-beta
component A [0.5, 0.5]
annotations [0.10, 0.90]
annotation 2,[0.50, 0.50] "Second"
annotation 1,[0.60, 0.65] "First"
accelerator "Up" [0.55, 0.25]
deaccelerator "Down" [0.15, 0.75]
A -.- (0.8, 0.6)
`);
    expect(m.annotations.map((a) => [a.number, a.text])).toEqual([[2, 'Second'], [1, 'First']]);
    expect(m.annotationsAt).toEqual({ visibility: 0.1, evolution: 0.9 });
    expect(m.forces.map((f) => [f.kind, f.name])).toEqual([['accelerator', 'Up'], ['deaccelerator', 'Down']]);
    expect(m.trends[0]).toMatchObject({ name: 'A', evolution: 0.8, visibility: 0.6 });
  });

  it('reads front-matter settings and comments without failing', () => {
    const m = parseWardley(`\n\n\nwardley-beta %% a comment\n%%{init: {"theme": "dark"}}%%\naccTitle: Alt\ncomponent A [0.5, 0.5] %% trailing\n`, { config: { theme: 'dark' } });
    expect(m.accTitle).toBe('Alt');
    expect(m.nodes).toHaveLength(1);
  });
});

describe('wardley map errors', () => {
  it.each([
    ['unknown component in a link', 'wardley-beta\ncomponent A [0.5, 0.5]\nA -> B\n', 3],
    ['a position out of range', 'wardley-beta\ncomponent A [1.5, 0.5]\n', 2],
    ['an unknown decorator', 'wardley-beta\ncomponent A [0.5, 0.5] (huge)\n', 2],
    ['a line nobody reads', 'wardley-beta\ncomponent A [0.5, 0.5]\nwhat is this\n', 3],
    ['a wrong header', 'wardley-beta-two\n', 1],
  ])('rejects %s with its line number', (_name, src, line) => {
    try {
      parseWardley(src);
      throw new Error('no error');
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(line);
    }
  });
});

describe('wardley map drawing', () => {
  it('has the official examples', () => {
    expect(Object.keys(EXAMPLES)).toHaveLength(19);
  });

  for (const [f, src] of Object.entries(EXAMPLES)) {
    it(`draws ${f} in three themes with its names inside and apart`, () => {
      for (const theme of ['solid', 'outline', 'card'] as const) {
        expect(render(src, { theme })).toContain(`data-theme="${theme}"`);
      }
      const l = layoutWardley(parseWardley(src), ruler);
      const boxes = textBoxes(l.scene);
      for (const [i, a] of boxes.entries()) {
        expect(a.x0).toBeGreaterThanOrEqual(0);
        expect(a.x1).toBeLessThanOrEqual(l.scene.width);
        expect(a.y1).toBeLessThanOrEqual(l.scene.height);
        for (const b of boxes.slice(i + 1)) {
          const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
          expect(apart, `${a.text} / ${b.text}`).toBe(true);
        }
      }
    });
  }

  it('puts every component at its values', () => {
    const l = layoutWardley(parseWardley(BASIC), ruler);
    for (const n of l.nodes) {
      expect(Math.abs(n.cx - (l.plot.x0 + n.evolution * (l.plot.x1 - l.plot.x0)))).toBeLessThanOrEqual(1);
      expect(Math.abs(n.cy - (l.plot.y1 - n.visibility * (l.plot.y1 - l.plot.y0)))).toBeLessThanOrEqual(1);
    }
  });

  it('draws the evolved place of a component at the target evolution on its row', () => {
    const l = layoutWardley(parseWardley(BASIC), ruler);
    const kettle = l.nodes.find((n) => n.name === 'Kettle');
    const ring = l.scene.items.find((it) => it.kind === 'circle' && it.data?.['evolve'] === 'Kettle');
    if (ring?.kind !== 'circle' || kettle === undefined) throw new Error('missing');
    expect(Math.abs(ring.cx - (l.plot.x0 + 0.62 * (l.plot.x1 - l.plot.x0)))).toBeLessThanOrEqual(1);
    expect(ring.cy).toBe(kettle.cy);
    expect(ring.role).toContain('end-open');
  });

  it('puts stage lines at the asked boundaries', () => {
    const l = layoutWardley(parseWardley(STAGES), ruler);
    const width = l.plot.x1 - l.plot.x0;
    expect(l.boundaries.map((x) => Math.round((x - l.plot.x0) / width * 100) / 100)).toEqual([0.2, 0.4, 0.75]);
  });

  it('follows size for the picture', () => {
    const l = layoutWardley(parseWardley('wardley-beta\ntitle T\nsize [800, 1000]\n'), ruler);
    expect(l.scene.width).toBe(800);
    expect(l.scene.height).toBe(1000);
  });

  it('gives every sourcing strategy its own shape and marks inertia', () => {
    const l = layoutWardley(parseWardley(SOURCING), ruler);
    const shapeOf = (name: string): string => {
      const it = l.scene.items.find((i) => (i.kind === 'path' || i.kind === 'circle') && i.data?.['name'] === name);
      if (it?.kind === 'circle') return `circle:${it.role.join(' ')}`;
      return it?.kind === 'path' ? it.d.replace(/[\d.\- ]+/g, ' ').trim() : 'none';
    };
    const shapes = ['Custom App', 'Off-the-shelf Tool', 'Managed Service', 'Cloud Platform'].map(shapeOf);
    expect(new Set(shapes).size).toBe(4);
    expect(l.scene.items.some((i) => i.kind === 'line' && i.data?.['inertia'] === 'Legacy System')).toBe(true);
  });

  it('draws arrowheads for flow links only', () => {
    const l = layoutWardley(parseWardley(LINKS), ruler);
    const roles = l.scene.items.flatMap((i) => (i.kind === 'line' && i.data?.['link'] !== undefined && Array.isArray(i.role) ? [i.role.join(' ')] : []));
    expect(roles[0]).not.toContain('arrow');
    expect(roles[1]).toContain('edge--arrow');
    expect(roles[3]).toContain('edge--arrow-start');
    expect(roles[3]).toContain('edge--arrow ');
    expect(roles[4]).toContain('edge--arrow');
  });

  it('gives different pictures only through the theme table', () => {
    const solid = layoutWardley(parseWardley(BASIC), ruler, 'solid');
    const card = layoutWardley(parseWardley(BASIC), ruler, 'card');
    expect(solid.scene.width).toBe(card.scene.width);
    expect(solid.nodes.map((n) => [n.cx, n.cy])).toEqual(card.nodes.map((n) => [n.cx, n.cy]));
  });

  it('writes accTitle and accDescr into title and desc', () => {
    const svg = render('wardley-beta\naccTitle: My map\naccDescr: One <line>\ncomponent A [0.5, 0.5]\n');
    expect(svg).toContain('<title>My map</title><desc>One &lt;line&gt;</desc>');
  });
});

describe('wardley map text', () => {
  it('lists the values of every component', () => {
    const r = renderText(BASIC, 60);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines[0]).toBe('Tea Shop Value Chain');
    expect(r.lines[1]).toBe('component   visibility     evolution');
    expect(r.lines[2]).toBe('Business          0.95          0.63');
    expect(r.lines).toContain('Kettle            0.43  0.35 -> 0.62');
  });

  it('shortens names to fit the width', () => {
    const r = renderText(BASIC, 30);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines.every((l) => l.length <= 30)).toBe(true);
  });
});

describe('wardley map label and mark placement', () => {
  const at = (src: string) => layoutWardley(parseWardley(src), ruler);
  const nameBox = (l: ReturnType<typeof at>, name: string) => {
    const n = l.nodes.find((x) => x.name === name);
    if (n === undefined) throw new Error(`no ${name}`);
    return n.label;
  };

  it.each(['03-coordinate-system.mmd', '12-custom-evolution-stages.mmd', '13-dual-labels.mmd', '14-custom-stage-widths.mmd', '11-pipelines.mmd'])(
    'keeps names in %s off the stage lines',
    (f) => {
      const l = at(EXAMPLES[f] ?? '');
      for (const n of l.nodes) {
        for (const x of l.boundaries) expect(x > n.label.x0 - 1 && x < n.label.x1 + 1, `${n.name} on ${x}`).toBe(false);
      }
    },
  );

  it('keeps every dependency line off the names it does not end at', () => {
    for (const [f, src] of Object.entries(EXAMPLES)) {
      const l = at(src);
      for (const it of l.scene.items) {
        if (it.kind !== 'line' || it.data?.['link'] === undefined) continue;
        const [a, b] = it.points;
        if (a === undefined || b === undefined) continue;
        for (const n of l.nodes) {
          if (n.name === it.data['from'] || n.name === it.data['to']) continue;
          const box = n.label;
          for (let t = 0; t <= 1; t += 0.01) {
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            expect(x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1, `${f}: ${it.data['from']}>${it.data['to']} crosses ${n.name}`).toBe(false);
          }
        }
      }
    }
  });

  it('draws the sourcing symbols the documentation names', () => {
    const l = at(SOURCING);
    const shape = (name: string) => l.scene.items.filter((i) => i.data?.['name'] === name || (i.kind === 'circle' && i.role.includes('dot') && l.nodes.find((n) => n.name === name)?.cx === i.cx && l.nodes.find((n) => n.name === name)?.cy === i.cy));
    const pathOf = (name: string): string => {
      const p = shape(name).find((i) => i.kind === 'path');
      return p?.kind === 'path' ? p.d : '';
    };
    // build: triangle (three corners), buy: diamond (four corners, none level with the centre row), outsource: square, market: circle.
    expect(pathOf('Custom App').match(/[ML]/g)).toHaveLength(3);
    expect(pathOf('Off-the-shelf Tool').match(/[ML]/g)).toHaveLength(4);
    expect(pathOf('Managed Service')).toMatch(/H.*V.*H/);
    expect(shape('Cloud Platform').some((i) => i.kind === 'circle' && i.role.includes('end-open'))).toBe(true);
  });

  it('names the pipeline owner above its pipeline box', () => {
    const l = at(PIPELINE);
    const frame = l.scene.items.find((i) => i.kind === 'box' && i.data?.['pipeline'] === 'Database');
    if (frame?.kind !== 'box') throw new Error('no pipeline box');
    const label = nameBox(l, 'Database');
    expect(label.y1).toBeLessThanOrEqual(frame.y);
    const db = l.nodes.find((n) => n.name === 'Database');
    expect(Math.abs((label.x0 + label.x1) / 2 - (db?.cx ?? 0))).toBeLessThanOrEqual(1);
  });

  it('backs the annotation list with a panel over the stage lines', () => {
    const l = at(EXAMPLES['19-complete-example.mmd'] ?? '');
    const panel = l.scene.items.find((i) => i.kind === 'box' && i.data?.['annotations'] === 'list');
    if (panel?.kind !== 'box') throw new Error('no panel');
    const rows = textBoxes(l.scene).filter((t) => ['User touchpoints', 'Integration layer', 'Data persistence'].includes(t.text));
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.x0).toBeGreaterThanOrEqual(panel.x);
      expect(r.x1).toBeLessThanOrEqual(panel.x + panel.w);
    }
    expect(l.scene.items.indexOf(panel)).toBeGreaterThan(l.scene.items.findIndex((i) => i.kind === 'line' && (i.role ?? []).includes('grid')));
  });

  it('starts an evolve arrow past the inertia bar', () => {
    const l = at(EXAMPLES['19-complete-example.mmd'] ?? '');
    const bar = l.scene.items.find((i) => i.kind === 'line' && i.data?.['inertia'] === 'Database');
    const arrow = l.scene.items.find((i) => i.kind === 'line' && i.data?.['evolve'] === 'Database');
    if (bar?.kind !== 'line' || arrow?.kind !== 'line') throw new Error('missing');
    expect(arrow.points[0]?.x ?? 0).toBeGreaterThan((bar.points[0]?.x ?? 0) + 2);
  });
});
