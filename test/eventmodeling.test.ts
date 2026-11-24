// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';
import { layoutEventModel } from '../src/eventmodeling/layout.ts';
import { parseEventModeling } from '../src/eventmodeling/parse.ts';
import { drawEventModel, eventModelGrid, WAY_BUDGET } from '../src/eventmodeling/terminal.ts';
import { spareRows } from '../src/eventmodeling/wires.ts';
import type { Cell, Rect, Row } from '../src/eventmodeling/wires.ts';
import { cellWidth, pixelRuler } from '../src/metrics.ts';
import type { SceneBox, SceneText } from '../src/types.ts';

const examples: Record<string, string> = {
  '01-timeline': "eventmodeling\n\ntf 01 ui CartUI\ntf 02 cmd AddItem\ntf 03 evt ItemAdded",
  '02-inline-data': "eventmodeling\n\ntf 01 ui CartUI\ntf 02 cmd AddItem { description: string }\ntf 03 evt ItemAdded { description: string }",
  '03-inline-data-2': "eventmodeling\n\ntimeframe 01 ui CartUI\ntimeframe 02 command AddItem { description: string }\ntimeframe 03 event ItemAdded { description: string }",
  '04-data-block': "eventmodeling\n\ntf 01 ui CartUI\ntf 02 cmd AddItem [[AddItem01]]\ntf 03 evt ItemAdded [[ItemAdded]]\ntf 04 cmd AddItem [[AddItem02]]\ntf 05 evt ItemAdded [[ItemAdded]]\n\ndata AddItem01 {\n  description: 'john'\n  image: 'avatar_john'\n  price: 20.4\n}\n\ndata AddItem02 {\n  description: 'jack'\n  image: 'avatar_jack'\n  price: 12.5\n}\n\ndata ItemAdded {\n  description: string\n  image: string\n  price: number\n}",
  '05-data-block-2': "eventmodeling\n\ntimeframe 01 ui CartUI\ntimeframe 02 command AddItem [[AddItem01]]\ntimeframe 03 event ItemAdded [[ItemAdded]]\ntimeframe 04 command AddItem [[AddItem02]]\ntimeframe 05 event ItemAdded [[ItemAdded]]\n\ndata AddItem01 {\n  description: 'john'\n  image: 'avatar_john'\n  price: 20.4\n}\n\ndata AddItem02 {\n  description: 'jack'\n  image: 'avatar_jack'\n  price: 12.5\n}\n\ndata ItemAdded {\n  description: string\n  image: string\n  price: number\n}",
  '06-resetting-the-flow': "eventmodeling\n\ntf 01 ui CartUI\ntf 02 cmd AddItem\ntf 03 evt ItemAdded\n\nrf 04 evt External.InventoryChanged\ntf 05 pcr InventoryProcessor\ntf 06 cmd ChangeInventory\ntf 07 evt Cart.InventoryChanged",
  '07-resetting-the-flow-2': "eventmodeling\n\ntimeframe 01 ui CartUI\ntimeframe 02 command AddItem\ntimeframe 03 event ItemAdded\n\nresetframe 04 event External.InventoryChanged\ntimeframe 05 processor InventoryProcessor\ntimeframe 06 command ChangeInventory\ntimeframe 07 event Cart.InventoryChanged",
  '08-resetting-the-flow-3': "eventmodeling\n\ntf 01 evt ItemAdded\ntf 02 ui OtherUI\nrf 03 rmo CartItems ->> 01",
  '09-multiple-relations': "eventmodeling\n\nrf 02 evt CartCreated\nrf 03 evt ItemAdded\nrf 04 evt ItemRemoved\nrf 05 evt CartCleared\ntf 01 rmo CartUI ->> 02 ->> 03 ->> 04 ->> 05",
  '10-state-change': "eventmodeling\n\ntf 01 ui CartUI\ntf 02 cmd AddItem\ntf 03 evt ItemAdded",
  '11-state-view': "eventmodeling\n\ntf 03 evt ItemAdded\ntf 02 rmo CartItems\ntf 04 ui CartUI",
  '12-translation': "eventmodeling\n\ntf 03 evt External.InventoryChanged\ntf 02 pcr InventoryProcessor\ntf 04 cmd ChangeInventory\ntf 05 evt Cart.InventoryChanged",
  '13-swimlanes-and-namespaces': "eventmodeling\n\nrf 01 evt Inventory.InventoryChanged\nrf 02 evt External.InventoryChanged",
  '14-timeline-2': "eventmodeling\n\ntf 01 ui CartUI\ntf 02 cmd AddItem\ntf 03 evt ItemAdded",
  '15-timeline-3': "eventmodeling\n\ntimeframe 01 ui CartUI\ntimeframe 02 command AddItem\ntimeframe 03 event ItemAdded",
};

describe('eventmodeling svg', () => {
  for (const [name, src] of Object.entries(examples)) {
    it(`${name} draws`, () => {
      expect(render(src)).toContain('data-theme="band"');
    });
  }

  it('draws the data rule of a box in a filled lane as an in-zone rule, and of other boxes as a plain rule', () => {
    const { scene } = layoutEventModel(parseEventModeling(examples['04-data-block'] ?? ''), pixelRuler());
    const boxes = scene.items.filter((it): it is SceneBox => it.kind === 'box' && (it.role?.includes('box') ?? false));
    const rules = scene.items.filter((it) => it.kind === 'line' && Array.isArray(it.role) && it.role.includes('rule'));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      if (rule.kind !== 'line' || !Array.isArray(rule.role)) continue;
      const y = rule.points[0]?.y ?? 0;
      const x = rule.points[0]?.x ?? 0;
      const box = boxes.find((b) => b.x === x && y > b.y && y < b.y + b.h);
      expect(box).toBeDefined();
      expect(rule.role.includes('rule--in-zone')).toBe(box?.role?.includes('box--in-zone') ?? false);
    }
    expect(rules.some((r) => r.kind === 'line' && Array.isArray(r.role) && r.role.includes('rule--in-zone'))).toBe(true);
  });

  it('is picked by the header', () => {
    expect(selectFrontEnd(examples['01-timeline'] ?? '').name).toBe('eventmodeling');
  });

  it('draws the short and the long spelling the same', () => {
    expect(render(examples['01-timeline'] ?? '')).toBe(render(examples['15-timeline-3'] ?? ''));
    expect(render(examples['04-data-block'] ?? '')).toBe(render(examples['05-data-block-2'] ?? ''));
  });
});

describe('eventmodeling parse', () => {
  it('reads frames, kinds and inferred relations', () => {
    const model = parseEventModeling(examples['01-timeline'] ?? '');
    expect(model.frames.map((f) => [f.label, f.kind, f.name])).toEqual([['01', 'ui', 'CartUI'], ['02', 'cmd', 'AddItem'], ['03', 'evt', 'ItemAdded']]);
    expect(model.relations.map((r) => [r.from, r.to])).toEqual([[1, 2], [2, 3]]);
  });

  it('reads inline data and data blocks', () => {
    expect(parseEventModeling(examples['02-inline-data'] ?? '').frames[1]?.data).toEqual(['description: string']);
    const block = parseEventModeling(examples['04-data-block'] ?? '');
    expect(block.frames[1]?.data).toEqual(["description: 'john'", "image: 'avatar_john'", 'price: 20.4']);
    expect(block.frames[4]?.data).toEqual(['description: string', 'image: string', 'price: number']);
  });

  it('stops inference at a reset frame and reads explicit relations', () => {
    const reset = parseEventModeling(examples['06-resetting-the-flow'] ?? '');
    expect(reset.relations.map((r) => [r.from, r.to])).toEqual([[1, 2], [2, 3], [4, 5], [5, 6], [6, 7]]);
    const many = parseEventModeling(examples['09-multiple-relations'] ?? '');
    expect(many.relations.map((r) => [r.from, r.to]).sort()).toEqual([[2, 1], [3, 1], [4, 1], [5, 1]]);
  });

  it('splits a namespace off the identifier', () => {
    const f = parseEventModeling(examples['13-swimlanes-and-namespaces'] ?? '').frames;
    expect(f.map((x) => [x.namespace, x.name])).toEqual([['Inventory', 'InventoryChanged'], ['External', 'InventoryChanged']]);
  });

  it('reads a title and accessibility lines without failing', () => {
    const model = parseEventModeling('eventmodeling\naccTitle: Cart\naccDescr: text\n%% note\ntf 01 ui A', 'Shop');
    expect(model.title).toBe('Shop');
    expect(model.accTitle).toBe('Cart');
  });
});

describe('eventmodeling layout', () => {
  const place = (src: string) => layoutEventModel(parseEventModeling(src), pixelRuler());

  it('puts frames on a grid of columns by number with 32 between boxes', () => {
    const layout = place(examples['01-timeline'] ?? '');
    const [a, b, c] = layout.frames;
    expect(b!.x - (a!.x + a!.w)).toBe(32);
    expect(c!.x - (b!.x + b!.w)).toBe(32);
    expect(a!.y).toBeLessThan(b!.y);
    expect(b!.y).toBeLessThan(c!.y);
  });

  it('orders columns by number, not by text order', () => {
    const layout = place(examples['11-state-view'] ?? '');
    expect(layout.columns.map((c) => c.number)).toEqual([2, 3, 4]);
  });

  it('keeps boxes and bands on the 4 grid', () => {
    for (const src of Object.values(examples)) {
      const { scene } = place(src);
      for (const it of scene.items) {
        if (it.kind !== 'box') continue;
        for (const v of [it.x, it.y, it.w, it.h]) expect(v % 4).toBe(0);
      }
    }
  });

  it('has no overlapping text and no text outside the drawing', () => {
    for (const [name, src] of Object.entries(examples)) {
      const { scene } = place(src);
      const widthOf = (t: SceneText): number => pixelRuler().textWidth(t.text, t.role?.includes('name') === true || t.role?.includes('zone-name') === true ? 'title' : 'line');
      const boxes = scene.items.filter((i): i is SceneText => i.kind === 'text').map((t) => {
        const w = widthOf(t);
        const x = t.anchor === 'middle' ? t.x - w / 2 : t.x;
        return { t, x, y: t.y - 8, w, h: 16 };
      });
      for (const b of boxes) {
        expect(b.x, name).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, name).toBeLessThanOrEqual(scene.width);
      }
      boxes.forEach((a, i) => {
        for (const b of boxes.slice(i + 1)) {
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${name}: ${a.t.text} / ${b.t.text}`).toBe(false);
        }
      });
    }
  });

  it('keeps each name inside its box', () => {
    const { scene } = place(examples['04-data-block'] ?? '');
    const boxes = scene.items.filter((i): i is SceneBox => i.kind === 'box' && (i.data?.['frame'] !== undefined) && i.style === 'box');
    const names = scene.items.filter((i): i is SceneText => i.kind === 'text' && i.role?.includes('name') === true);
    for (const n of names) {
      const w = pixelRuler().textWidth(n.text, 'title');
      expect(boxes.some((b) => n.x - w / 2 >= b.x && n.x + w / 2 <= b.x + b.w)).toBe(true);
    }
  });

  it('adds a lane for a namespace', () => {
    expect(place(examples['13-swimlanes-and-namespaces'] ?? '').lanes).toHaveLength(2);
    expect(place(examples['06-resetting-the-flow'] ?? '').lanes).toHaveLength(5);
  });
});

describe('eventmodeling text', () => {
  const text = (name: string, width: number): string[] => {
    const out = renderText(examples[name] ?? '', width);
    return 'lines' in out ? out.lines : [];
  };

  it('draws each frame as a box with its number and kind under the name', () => {
    const lines = text('06-resetting-the-flow', 80);
    expect(lines.join('\n')).toContain('│       CartUI       │');
    expect(lines.join('\n')).toContain('│       01 ui        │');
    expect(lines.join('\n')).not.toContain('Relations');
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(80);
  });

  it('stands the swimlanes in the order of the picture, a lane no line touches included', () => {
    const names = (name: string): string[] => text(name, 80).flatMap((line) => (line.startsWith('─') ? (line.match(/UI\/Automation|Command\/Read Model|Events(?: \/ \w+)?/)?.[0] ?? []) : []));
    expect(names('08-resetting-the-flow-3')).toEqual(['UI/Automation', 'Command/Read Model', 'Events']);
    expect(names('06-resetting-the-flow')).toEqual(['UI/Automation', 'Command/Read Model', 'Events', 'Events / External', 'Events / Cart']);
  });

  it('writes a lane name beside the line that crosses its rule, never over it', () => {
    const lines = text('01-timeline', 80);
    expect(lines).toContain('────────▼ Command/Read Model ─');
    expect(lines).toContain('── Events ──▼─────────────────');
  });

  it('draws every example within 80, 100 and 120 cells', () => {
    for (const name of Object.keys(examples)) {
      for (const width of [80, 100, 120]) {
        const lines = text(name, width);
        expect(lines.join('\n'), `${name} at ${width}`).toContain('┌');
        for (const line of lines) expect(cellWidth(line), `${name} at ${width}`).toBeLessThanOrEqual(width);
      }
    }
  });

  it('starts every box right of the box of the frame before it in time', () => {
    for (const name of Object.keys(examples)) {
      for (const width of [80, 100, 120]) {
        const starts = text(name, width)
          .flatMap((line) => [...line.matchAll(/│\s*(\d+) (?:ui|pcr|cmd|rmo|evt)\s*│/g)].map((m) => ({ number: Number(m[1]), x: m.index })))
          .sort((a, b) => a.number - b.number);
        expect(starts.length, name).toBe(parseEventModeling(examples[name] ?? '').frames.length);
        starts.slice(1).forEach((s, i) => expect(s.x, `${name} at ${width}: frame ${s.number}`).toBeGreaterThan(starts[i]?.x ?? 0));
      }
    }
  });

  it('wraps the frames onto further strips of bands when one strip is too wide, in time order in each', () => {
    const kinds = ['ui', 'cmd', 'evt', 'rmo'];
    const src = `eventmodeling\n${Array.from({ length: 20 }, (_, i) => `tf ${String(i + 1).padStart(2, '0')} ${kinds[i % 4]} Frame${i + 1}`).join('\n')}`;
    const model = parseEventModeling(src);
    expect(eventModelGrid(model, { uniform: true, step: 4 }, 80, 'one')).toBeUndefined();
    const grid = eventModelGrid(model, { uniform: true, step: 4 }, 80, 'any');
    const strips = new Set(grid?.nodes.map((n) => n.lane.split('/')[0]));
    expect(strips.size).toBeGreaterThan(1);
    for (const strip of strips) {
      const inside = (grid?.nodes ?? []).filter((n) => n.lane.split('/')[0] === strip);
      inside.slice(1).forEach((n, i) => expect(n.x).toBeGreaterThan(inside[i]?.x ?? 0));
    }
    const out = renderText(src, 80);
    expect('lines' in out && out.lines.join('\n')).toContain('│ Frame20 │');
    expect('lines' in out && out.lines.every((line) => cellWidth(line) <= 80)).toBe(true);
  });

  it('routes every line clear of the boxes, and shares a cell between two lines only where they cross or have an end in common', () => {
    const cellsOf = (points: Array<{ x: number; y: number }>): string[] => {
      const cells: string[] = [];
      points.slice(1).forEach((b, i) => {
        const a = points[i] as { x: number; y: number };
        expect(a.x === b.x || a.y === b.y).toBe(true);
        const n = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        for (let k = 0; k <= n; k++) cells.push(`${a.x + Math.sign(b.x - a.x) * k},${a.y + Math.sign(b.y - a.y) * k}`);
      });
      return cells;
    };
    const sources = [...Object.values(examples), 'eventmodeling\ntf 01 ui A\ntf 02 cmd B\ntf 03 evt C\nrf 04 ui D ->> 03 ->> 01\nrf 05 evt E ->> 01 ->> 02', 'eventmodeling\nrf 01 evt A\nrf 02 evt B ->> 01\nrf 03 evt C ->> 01\nrf 04 evt D ->> 03 ->> 02'];
    for (const src of sources) {
      const grid = eventModelGrid(parseEventModeling(src), { uniform: true, step: 4 }, Number.POSITIVE_INFINITY, 'one');
      expect(grid).toBeDefined();
      if (grid === undefined) continue;
      const inner = (x: number, y: number): boolean => grid.nodes.some((n) => x > n.x && x < n.x + n.w - 1 && y > n.y && y < n.y + n.h - 1);
      const runs = grid.edges.map((e) => ({ e, level: new Set<string>(), upright: new Set<string>() }));
      for (const run of runs) {
        const pts = run.e.points;
        pts.slice(1).forEach((b, i) => {
          const a = pts[i] as { x: number; y: number };
          for (const cell of cellsOf([a, b])) {
            const [x, y] = cell.split(',').map(Number) as [number, number];
            expect(inner(x, y), `${src}: ${run.e.from}->${run.e.to} at ${cell}`).toBe(false);
            (a.y === b.y ? run.level : run.upright).add(cell);
          }
        });
      }
      runs.forEach((a, i) => {
        for (const b of runs.slice(i + 1)) {
          if (a.e.from === b.e.from || a.e.to === b.e.to) continue;
          for (const cell of a.level) expect(b.level.has(cell), `${a.e.from}->${a.e.to} and ${b.e.from}->${b.e.to} along ${cell}`).toBe(false);
          for (const cell of a.upright) expect(b.upright.has(cell), `${a.e.from}->${a.e.to} and ${b.e.from}->${b.e.to} along ${cell}`).toBe(false);
        }
      });
    }
  });

  const pad = (n: number): string => String(n).padStart(3, '0');
  const chain = (count: number, name = 'Frame'): string => {
    const kinds = ['ui', 'cmd', 'evt', 'rmo'];
    return `eventmodeling\n${Array.from({ length: count }, (_, i) => `tf ${String(i + 1).padStart(2, '0')} ${kinds[i % 4]} ${name}${i + 1}`).join('\n')}`;
  };
  /** `count` frames, each but the first with three relations to frames before it. */
  const dense = (count: number): string => {
    const kinds = ['ui', 'cmd', 'evt', 'rmo', 'evt', 'pcr'];
    const frame = (i: number): string => `rf ${pad(i + 1)} ${kinds[i % 6]} F${i + 1}${i > 0 ? ` ->> ${pad(Math.max(1, i - 7))} ->> ${pad(Math.max(1, Math.floor(i / 2)))} ->> 001` : ''}`;
    return `eventmodeling\n${Array.from({ length: count }, (_, i) => frame(i)).join('\n')}`;
  };
  const linesOf = (src: string, width: number): string[] => {
    const out = renderText(src, width);
    return 'lines' in out ? out.lines : [];
  };

  it('stands a box over both its neighbours in time so the lines of a chain run straight', () => {
    const grid = eventModelGrid(parseEventModeling(chain(5)), { uniform: true, step: 4 }, 80, 'one');
    expect(grid?.edges.length).toBe(4);
    for (const e of grid?.edges ?? []) expect(e.points.length, `${e.from}->${e.to}`).toBe(2);
    // Three bands of a rule and four box rows each, and no row between them.
    expect(linesOf(chain(5), 80).length).toBe(15);
  });

  it('keeps one row between two strips, where the line to the next strip turns', () => {
    const lines = linesOf(chain(16), 80);
    expect(lines.length).toBeLessThanOrEqual(31);
    expect(lines.filter((line) => line.includes('UI/Automation')).length).toBe(2);
  });

  it('writes a band name whole where one way of setting the frames out has room for it', () => {
    for (const [src, width] of [[chain(5), 40], [chain(13), 100], [chain(14), 80], [chain(5, '주문'), 40]] as const) {
      const lines = linesOf(src, width);
      expect(lines.some((line) => line.includes('┌')), `${width}`).toBe(true);
      expect(lines.join('\n'), `${width}`).not.toContain('…');
      expect(lines.filter((line) => line.includes('Command/Read Model')).length, `${width}`).toBeGreaterThan(0);
      expect(lines.every((line) => cellWidth(line) <= width)).toBe(true);
    }
  });

  it('takes the lines of one box out of it, and into it, by one stem on a side', () => {
    const fanOut = `eventmodeling\nrf 01 rmo View\n${Array.from({ length: 8 }, (_, i) => `rf ${pad(i + 2)} evt Ev${i + 2} ->> 001`).join('\n')}`;
    const fanIn = `eventmodeling\n${Array.from({ length: 6 }, (_, i) => `rf ${pad(i + 1)} evt Ev${i + 1}`).join('\n')}\nrf 007 rmo View ${Array.from({ length: 6 }, (_, i) => `->> ${pad(i + 1)}`).join(' ')}`;
    for (const src of [fanOut, fanIn, examples['09-multiple-relations'] ?? '']) {
      for (const strips of ['one', 'any'] as const) {
        const grid = eventModelGrid(parseEventModeling(src), { uniform: true, step: 4 }, strips === 'one' ? Number.POSITIVE_INFINITY : 80, strips);
        expect(grid).toBeDefined();
        const ends = new Map<string, Set<number>>();
        for (const e of grid?.edges ?? []) {
          const first = e.points[0] as { x: number; y: number };
          const last = e.points[e.points.length - 1] as { x: number; y: number };
          for (const [key, x] of [[`from ${e.from} at ${first.y}`, first.x], [`to ${e.to} at ${last.y}`, last.x]] as const) ends.set(key, (ends.get(key) ?? new Set()).add(x));
        }
        for (const [key, columns] of ends) expect(columns.size, `${key}: ${[...columns].join(',')}`).toBe(1);
      }
    }
    const drawn = linesOf(fanOut, 80).join('\n');
    expect(drawn).toContain('┌');
    expect(drawn).not.toMatch(/[┼┴┬├┤]{2}/);
    // Four lines into one box end in one arrowhead.
    expect(text('09-multiple-relations', 100).join('').split('▲').length - 1).toBe(1);
  });

  it('writes the list, not an error, for a model too large to draw', () => {
    for (const width of [80, 100, 120, 400]) {
      const lines = linesOf(dense(200), width);
      expect(lines.some((line) => line.includes('┌')), `${width}`).toBe(false);
      expect(lines.join('\n')).toContain('Relations');
    }
  });

  it('gives up on a model of 100 frames and 300 relations once one way of setting it out has cost what a way may', () => {
    for (const width of [80, 120]) {
      let spent = 0;
      const lines = drawEventModel(parseEventModeling(dense(100)), width, (cells) => {
        spent = cells;
      });
      expect(lines, `${width}`).toBeUndefined();
      // The cost is a count of cells, the same on any machine: no further way is tried once one has cost too much.
      expect(spent, `${width}`).toBeGreaterThan(WAY_BUDGET);
      expect(spent, `${width}`).toBeLessThan(WAY_BUDGET * 1.1);
    }
  });

  /** Frames in the order they are written, as the lines of a model. */
  const model = (frames: string[]): string => `eventmodeling\n${frames.join('\n')}`;
  const crowded = model([
      'tf 08 ui Order8 { amount: number }',
      'tf 21 cmd A21',
      'tf 03 rmo Checkout3 ->> 08 ->> 08 ->> 21',
      'tf 20 cmd 결제20 ->> 03',
      'rf 10 rmo Order10 ->> 08 ->> 21',
      'rf 04 cmd Checkout4',
      'tf 06 cmd PlaceOrder6 ->> 10 ->> 21',
      'tf 11 pcr Checkout11',
      'tf 22 evt 주문접수22 ->> 20 ->> 03 ->> 21',
      'rf 05 ui A5',
      'rf 02 cmd X12 ->> 21 ->> 20 { amount: number }',
      'tf 12 pcr PlaceOrder12 ->> 21 ->> 04',
      'rf 25 rmo A25 ->> 22 ->> 10',
      'rf 17 evt Ext.결제17 ->> 02 ->> 05 { amount: number }',
      'tf 09 rmo Order9 ->> 06 ->> 12 { amount: number }',
      'rf 16 rmo 결제16',
      'tf 15 ui 주문접수15',
      'tf 18 evt Order18 ->> 15',
      'tf 01 evt 결제1 ->> 09 ->> 16',
      'tf 13 rmo 주문접수13',
      'tf 19 rmo PlaceOrder19 ->> 15 ->> 16 ->> 21',
      'tf 14 pcr PlaceOrder14 ->> 06 ->> 15',
      'tf 26 cmd PlaceOrder26 ->> 17 ->> 15 ->> 18',
      'tf 07 evt 재고.PlaceOrder7 ->> 15',
      'tf 24 evt Cart.X124 ->> 14 ->> 07',
      'rf 23 ui PlaceOrder23 ->> 09',
    ]);
  const narrow = model([
      'rf 01 pcr A1',
      'rf 02 evt 재고.A2',
      'rf 03 pcr VeryLongFrameNameHere3 ->> 01 ->> 01',
      'tf 04 ui Order4 ->> 03',
      'rf 05 ui X15 ->> 01 ->> 01',
      'tf 09 ui Order9 ->> 02 ->> 01 ->> 03',
      'tf 07 pcr VeryLongFrameNameHere7 ->> 02 ->> 03 ->> 04',
      'tf 06 rmo 주문접수6 ->> 09 ->> 05 ->> 02',
      'rf 08 evt X18',
    ]);
  const narrowDrawn = model([
      'tf 01 evt Ext.X11',
      'tf 02 evt 재고.PlaceOrder2 ->> 01 ->> 01 ->> 01 { amount: number }',
      'tf 03 rmo Checkout3',
      'tf 04 pcr A4 ->> 03',
      'tf 05 evt Ext.Order5 ->> 02 ->> 02 ->> 02',
      'rf 06 evt Cart.주문접수6',
      'tf 07 pcr 주문접수7 ->> 05',
      'rf 08 cmd Checkout8 ->> 03',
      'rf 09 evt Ext.Order9',
      'rf 10 rmo X110 ->> 09 ->> 04',
      'tf 11 ui X111 ->> 06',
      'tf 12 evt Checkout12 { amount: number }',
      'tf 13 cmd Checkout13 ->> 11 ->> 03 { amount: number }',
      'tf 14 cmd A14',
      'tf 15 evt Ext.Checkout15 ->> 11',
      'tf 16 pcr 주문접수16 { amount: number }',
      'tf 17 rmo Order17',
      'tf 18 evt Ext.A18',
    ]);
  const mixed = model([
      'rf 14 ui Order14',
      'rf 03 cmd X13',
      'tf 16 pcr 주문접수16',
      'tf 13 evt 재고.VeryLongFrameNameHere13',
      'tf 08 evt 재고.A8 ->> 16 ->> 13',
      'rf 17 ui X117',
      'tf 05 evt 재고.Order5',
      'tf 10 cmd VeryLongFrameNameHere10',
      'rf 11 pcr A11',
      'rf 15 cmd A15',
      'rf 12 cmd 주문접수12',
      'tf 06 rmo X16',
      'rf 04 cmd VeryLongFrameNameHere4 ->> 06 ->> 17 ->> 05',
      'tf 02 rmo X12',
      'tf 07 rmo VeryLongFrameNameHere7',
      'rf 09 evt VeryLongFrameNameHere9',
      'tf 01 ui X11',
    ]);

  it('draws a model of some thirty frames and as many relations or more, each way of setting it out searched once', () => {
    for (const [src, width] of [[dense(30), 120], [crowded, 100]] as const) {
      const lines = linesOf(src, width);
      expect(lines.some((line) => line.includes('┌')), `${width}`).toBe(true);
      expect(lines.every((line) => cellWidth(line) <= width), `${width}`).toBe(true);
    }
  });

  it('never writes a band name over a line that crosses the rule of its band', () => {
    const cellsOf = (line: string): string[] => [...line].flatMap((ch) => [ch, ...new Array<string>(cellWidth(ch) - 1).fill('')]);
    for (const [src, width] of [[narrow, 40], [narrowDrawn, 40], [dense(30), 80]] as const) {
      const rows = linesOf(src, width).map(cellsOf);
      rows.forEach((row, y) => {
        // A band rule: a level line with no corner on it and no arrowhead between two boxes.
        if (!row.join('').includes('──') || row.some((ch) => '┌┐└┘├┤┬┴┼▶◀'.includes(ch) && ch !== '')) return;
        row.forEach((ch, x) => {
          if (ch !== '' && '─│▲▼'.includes(ch)) return;
          const above = rows[y - 1]?.[x] ?? ' ';
          const below = rows[y + 1]?.[x] ?? ' ';
          expect('│┌┐├┤┬┼'.includes(above) && '│└┘├┤┴┼'.includes(below), `${width}: row ${y}, cell ${x}`).toBe(false);
        });
      });
    }
    // Cut short between the lines where there is room for a few letters.
    expect(linesOf(narrowDrawn, 40).join('\n')).toContain('─ Command/Read … ─');
  });

  it('wraps the frames the way that takes the fewest rows of boxes', () => {
    const lines = linesOf(mixed, 120);
    expect(lines.some((line) => line.includes('┌'))).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(39);
  });

  it('finds the spare rows of a line of very many cells', () => {
    const height = 200_000;
    const rows: Row[] = Array.from({ length: height }, (): Row => ({ kind: 'channel', rank: 0 }));
    const rects: Rect[] = [{ x: 0, y: -3, w: 5, h: 3 }, { x: 0, y: height, w: 5, h: 3 }];
    const path = Array.from({ length: height }, (_, y): Cell => [2, y]);
    expect(spareRows(rects, [{ from: 0, to: 1 }], [path], rows).size).toBeGreaterThan(0);
  });

  it('writes the data rows of a frame in its box', () => {
    expect(text('04-data-block', 80).join('\n')).toContain("description: 'john'");
  });

  it('writes the list when the drawing does not fit the width', () => {
    const lines = text('06-resetting-the-flow', 24);
    expect(lines.join('\n')).toContain('Relations');
  });
});

describe('eventmodeling errors', () => {
  it('reports a repeated frame number with its line', () => {
    try {
      render('eventmodeling\n\ntf 01 ui A\ntf 01 cmd B');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      expect((e as UrsulaError).line).toBe(4);
    }
  });

  it('reports an unknown element type with its line', () => {
    expect(() => render('eventmodeling\ntf 01 xyz A')).toThrowError(/line 2/);
  });
});

describe('eventmodeling relation lines', () => {
  it('never run through a box other than the two they join', () => {
    for (const [name, src] of Object.entries(examples)) {
      const l = layoutEventModel(parseEventModeling(src), pixelRuler());
      for (const e of l.edges) {
        for (const [i, a] of e.points.entries()) {
          const b = e.points[i + 1];
          if (b === undefined) continue;
          for (const p of l.frames) {
            if (p.number === e.from || p.number === e.to) continue;
            const crosses = Math.max(a.x, b.x) > p.x && Math.min(a.x, b.x) < p.x + p.w && Math.max(a.y, b.y) > p.y && Math.min(a.y, b.y) < p.y + p.h;
            expect(crosses, `${name}: ${e.from}>${e.to} through ${p.number}`).toBe(false);
          }
        }
      }
    }
  });
});

describe('eventmodeling lane name column', () => {
  it('keeps the lane name column at 96 when the names fit in it with 4 to spare', () => {
    const l = layoutEventModel(parseEventModeling('eventmodeling\n\ntf 01 ui ShopUI\ntf 02 cmd AddItemToCart\ntf 03 evt ItemAdded\ntf 04 rmo CartView ->> 03\n'), pixelRuler());
    const first = l.scene.items.find((i): i is SceneBox => i.kind === 'box' && (i.role?.includes('box') ?? false));
    expect(first?.x).toBe(24 + 96);
  });
});
