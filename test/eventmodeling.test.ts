// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';
import { layoutEventModel } from '../src/eventmodeling/layout.ts';
import { parseEventModeling } from '../src/eventmodeling/parse.ts';
import { pixelRuler } from '../src/metrics.ts';
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

const themes = ['solid', 'outline', 'card'] as const;

describe('eventmodeling svg', () => {
  for (const [name, src] of Object.entries(examples)) {
    for (const theme of themes) {
      it(`${name} draws in ${theme}`, () => {
        expect(render(src, { theme })).toContain(`data-theme="${theme}"`);
      });
    }
  }

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
  it('lists each swimlane in time order', () => {
    const out = renderText(examples['06-resetting-the-flow'] ?? '', 80);
    expect('error' in out).toBe(false);
    const text = 'lines' in out ? out.lines.join('\n') : '';
    expect(text).toContain('UI/Automation');
    expect(text).toContain('Events / External');
    expect(text).toContain('01  ui   CartUI');
    expect(text).toContain('Relations');
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
