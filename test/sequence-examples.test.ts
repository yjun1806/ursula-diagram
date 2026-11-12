// Examples adapted from the Mermaid documentation (MIT).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutSequence, parseSequence, pixelRuler } from '../src/index.ts';
import type { SceneItem } from '../src/index.ts';

const dir = new URL('./sequence-official/', import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.mmd'))
  .sort();
const ruler = pixelRuler();
const sceneOf = (src: string): SceneItem[] => layoutSequence(parseSequence(src.replace(/^---[\s\S]*?---\s*/, '')), ruler).scene.items;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  what: string;
}

/** Box of a text item, measured with the ruler role its font is drawn in. */
function textRect(t: Extract<SceneItem, { kind: 'text' }>): Rect {
  const role = t.font === 'title' ? 'title' : t.font === 'body' ? 'line' : 'edge';
  const w = ruler.textWidth(t.text, role);
  const h = ruler.lineHeight(role) - 4;
  const x1 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return { x1, y1: t.y - h / 2, x2: x1 + w, y2: t.y + h / 2, what: t.text };
}

const overlap = (a: Rect, b: Rect): boolean => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/** Horizontal message segments (the lines that carry a message, not their heads). */
function messageSegments(items: SceneItem[]): Rect[] {
  return items.flatMap((it) => {
    if (it.kind !== 'line' || !Array.isArray(it.role) || !it.data?.message) return [];
    const out: Rect[] = [];
    for (let k = 0; k + 1 < it.points.length; k++) {
      const a = it.points[k];
      const b = it.points[k + 1];
      if (!a || !b || a.y !== b.y) continue;
      out.push({ x1: Math.min(a.x, b.x), y1: a.y - 1, x2: Math.max(a.x, b.x), y2: a.y + 1, what: `message ${it.data.message}` });
    }
    return out;
  });
}

describe('Mermaid documentation examples: geometry', () => {
  for (const f of files) {
    const items = sceneOf(readFileSync(new URL(f, dir), 'utf8'));
    const texts = items.flatMap((it) => (it.kind === 'text' ? [textRect(it)] : []));

    it(`${f}: no two texts overlap`, () => {
      const hits: string[] = [];
      texts.forEach((a, i) => texts.slice(i + 1).forEach((b) => overlap(a, b) && hits.push(`${a.what} / ${b.what}`)));
      expect(hits).toEqual([]);
    });

    it(`${f}: no message line runs through a text`, () => {
      const hits: string[] = [];
      for (const seg of messageSegments(items)) for (const t of texts) if (overlap(seg, t)) hits.push(`${seg.what} / ${t.what}`);
      expect(hits).toEqual([]);
    });

    it(`${f}: no highlight edge lies on a message line`, () => {
      const edges = items.flatMap((it) => (it.kind === 'box' && it.role?.includes('zone') ? [it.y, it.y + it.h] : []));
      const ys = messageSegments(items).map((s) => (s.y1 + s.y2) / 2);
      expect(edges.filter((e) => ys.some((y) => Math.abs(y - e) < 4))).toEqual([]);
    });
  }
});

const example = (name: string): string => readFileSync(new URL(`${name}.mmd`, dir), 'utf8');
const layoutOf = (name: string) => layoutSequence(parseSequence(example(name)), ruler);
const lifeline = (items: SceneItem[], id: string) => {
  const l = items.find((it) => it.kind === 'line' && Array.isArray(it.role) && it.role.includes('lifeline') && it.data?.participant === id);
  if (l?.kind !== 'line') throw new Error(`no lifeline for ${id}`);
  return { top: l.points[0]?.y ?? NaN, bottom: l.points[1]?.y ?? NaN };
};

describe('Mermaid documentation examples: what each one shows', () => {
  it('16: a created participant appears at its first message, and a destroyed lifeline ends at its last one with a cross', () => {
    const l = layoutOf('16-actor-creation-and-destruction');
    const items = l.scene.items;
    const at = (id: string) => l.participants.find((p) => p.id === id);
    const hiCarl = l.messages.find((m) => m.to === 'Carl' && m.from === 'Alice' && m.kind === 'call');
    const hiDonald = l.messages.find((m) => m.to === 'D');
    if (!hiCarl || !hiDonald) throw new Error('messages');
    // The headers of Carl and Donald are centred on the line of the message that creates them.
    const carl = at('Carl')?.box;
    expect(carl && carl.y < hiCarl.y && carl.y + carl.h > hiCarl.y).toBe(true);
    expect(lifeline(items, 'Carl').top).toBeGreaterThan(hiCarl.y);
    expect(lifeline(items, 'D').top).toBeGreaterThan(hiDonald.y);
    expect((at('Alice')?.box.y ?? 0) < (carl?.y ?? 0)).toBe(true);
    // The line that creates Carl stops at the side of its header.
    const line = items.find((it) => it.kind === 'line' && it.data?.message === String(hiCarl.index));
    if (line?.kind !== 'line') throw new Error('line');
    expect(Math.max(...line.points.map((p) => p.x))).toBe(carl?.x);
    // Carl's lifeline ends at the failed message, Bob's at "I agree"; Alice's runs on.
    const tooMany = l.messages.find((m) => m.kind === 'failed');
    const agree = l.messages.find((m) => m.from === 'Bob' && m.to === 'Alice' && m.index > (tooMany?.index ?? 0));
    expect(lifeline(items, 'Carl').bottom).toBe(tooMany?.y);
    expect(lifeline(items, 'Bob').bottom).toBe(agree?.y);
    expect(lifeline(items, 'Alice').bottom).toBeGreaterThan(agree?.y ?? Infinity);
  });

  it('17: each box group is a labelled band around its own participants, without its colour word', () => {
    const l = layoutOf('17-grouping-box');
    const bands = l.scene.items.filter((it) => it.kind === 'box' && it.style === 'frame' && it.role?.includes('zone'));
    const labels = l.scene.items.flatMap((it) => (it.kind === 'text' && it.role?.includes('zone-name') ? [it.text] : []));
    expect(labels).toEqual(['Alice & John', 'Another Group']);
    expect(bands).toHaveLength(2);
    const inside = (id: string, k: number): boolean => {
      const b = bands[k];
      const p = l.participants.find((q) => q.id === id);
      return b?.kind === 'box' && !!p && p.box.x > b.x && p.box.x + p.box.w < b.x + b.w;
    };
    expect([inside('A', 0), inside('J', 0), inside('B', 1), inside('C', 1), inside('B', 0), inside('J', 1)]).toEqual([true, true, true, true, false, false]);
    // Headers inside a band are painted white, so that they stand out of the tint.
    const headers = l.scene.items.filter((it) => it.kind === 'box' && it.data?.participant);
    expect(headers.every((h) => h.kind === 'box' && h.role?.includes('box--in-zone'))).toBe(true);
  });

  it('18: `()` joins the message to the centre of the lifeline with a dot and names no extra participant', () => {
    const l = layoutOf('18-basic-syntax');
    expect(l.participants.map((p) => p.id)).toEqual(['Alice', 'John']);
    const dots = l.scene.items.filter((it) => it.kind === 'circle' && it.role.includes('dot'));
    const x = (id: string) => l.participants.find((p) => p.id === id)?.x;
    expect(dots.map((d) => (d.kind === 'circle' ? [d.cx === x('Alice') ? 'Alice' : d.cx === x('John') ? 'John' : '?', d.cy] : []))).toEqual([
      ['John', l.messages[0]?.y],
      ['Alice', l.messages[1]?.y],
      ['John', l.messages[2]?.y],
      ['Alice', l.messages[2]?.y],
    ]);
  });

  it('19 and 20: an `activate` line after a message starts the bar at that message, like the `+` shortcut', () => {
    const bars = (name: string) => layoutOf(name).scene.items.filter((it) => it.kind === 'box' && it.style === 'bar');
    expect(bars('19-activations')).toEqual(bars('20-activations-2'));
    const l = layoutOf('19-activations');
    const bar = bars('19-activations')[0];
    expect(bar?.kind === 'box' && bar.y).toBe(l.messages[0]?.y);
  });

  it('33: a nested highlight steps in from its parent and is painted apart from it', () => {
    const zones = layoutOf('33-background-highlighting').scene.items.filter(
      (it) => it.kind === 'box' && it.style === 'frame' && it.role?.includes('zone') && !it.role.includes('zone--dashed'),
    );
    const [outer, inner] = zones;
    if (outer?.kind !== 'box' || inner?.kind !== 'box') throw new Error('zones');
    expect(inner.x).toBeGreaterThan(outer.x);
    expect(inner.x + inner.w).toBeLessThan(outer.x + outer.w);
    expect(inner.y).toBeGreaterThan(outer.y);
    expect(inner.y + inner.h).toBeLessThan(outer.y + outer.h);
    expect([outer.role, inner.role]).toEqual([['zone'], ['zone', 'zone--plain']]);
    // Every highlight carries a dashed edge, which shows in the themes whose highlight fill is close to the page.
    expect(layoutOf('33-background-highlighting').scene.items.filter((it) => it.kind === 'box' && it.role?.includes('zone--dashed'))).toHaveLength(2);
  });

  it('35: `#9829;` and `#infin;` are written as the characters they stand for', () => {
    const texts = layoutOf('35-entity-codes-to-escape-characters').scene.items.flatMap((it) => (it.kind === 'text' ? [it.text] : []));
    expect(texts).toContain('I ♥ you!');
    expect(texts).toContain('I ♥ you ∞ times more!');
  });

  it('01, 37 and 38: `-)` is a solid line with an open head, apart from the dotted reply', () => {
    for (const name of ['01-sequence-diagrams', '37-actor-menus', '38-advanced-menu-syntax']) {
      const items = layoutOf(name).scene.items;
      const async = items.find((it) => it.kind === 'line' && it.data?.kind === 'async');
      const reply = items.find((it) => it.kind === 'line' && it.data?.kind === 'reply');
      if (async?.kind !== 'line' || reply?.kind !== 'line' || !Array.isArray(async.role) || !Array.isArray(reply.role)) throw new Error(name);
      expect(async.role).not.toContain('edge--pending');
      expect(async.role).not.toContain('edge--arrow');
      expect(reply.role).toContain('edge--pending');
      const tip = async.points[async.points.length - 1];
      const head = items.find((it) => it.kind === 'line' && it.points.length === 3 && it.points[1]?.x === tip?.x && it.points[1]?.y === tip?.y);
      expect(head, name).toBeDefined();
    }
  });
});

describe('arrows the examples do not show', () => {
  it('draws `<<->>` with a head at both ends and `<<-->>` dotted', () => {
    const roles = (src: string) => {
      const it = layoutSequence(parseSequence(`sequenceDiagram\n${src}`), ruler).scene.items.find((i) => i.kind === 'line' && i.data?.message === '0');
      return it?.kind === 'line' && Array.isArray(it.role) ? it.role : [];
    };
    expect(roles('A<<->>B: x')).toEqual(expect.arrayContaining(['edge--arrow', 'edge--arrow-start']));
    expect(roles('A<<->>B: x')).not.toContain('edge--pending');
    expect(roles('A<<-->>B: x')).toEqual(expect.arrayContaining(['edge--arrow', 'edge--arrow-start', 'edge--pending']));
  });

  it('keeps the colour word of a box group out of its label, and a plain label whole', () => {
    const labels = (src: string) => parseSequence(`sequenceDiagram\n${src}\nparticipant A\nend`).groups?.map((g) => g.label);
    expect(labels('box Aqua Group Description')).toEqual(['Group Description']);
    expect(labels('box rgb(33, 66, 99) Team')).toEqual(['Team']);
    expect(labels('box transparent Aqua')).toEqual(['Aqua']);
    expect(labels('box Group without description')).toEqual(['Group without description']);
  });
});
