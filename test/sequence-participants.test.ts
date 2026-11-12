import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellRuler, layoutSequence, layoutSequenceText, parseSequence, pixelRuler, render, renderText, UrsulaError } from '../src/index.ts';
import type { ParticipantKind, SceneItem } from '../src/index.ts';

const KINDS: readonly ParticipantKind[] = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'];

const kindsOf = (src: string): ParticipantKind[] => parseSequence(`sequenceDiagram\n${src}`).participants.map((p) => p.kind);

/** Scene items drawn for one participant, without its lifeline. */
function itemsOf(src: string, id: string): SceneItem[] {
  const scene = layoutSequence(parseSequence(`sequenceDiagram\n${src}`), pixelRuler()).scene;
  return scene.items.filter((it) => it.kind !== 'line' && 'data' in it && it.data?.participant === id);
}

const numbers = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

function pathOf(items: SceneItem[]): { d: string; role: string[] } {
  const p = items.find((i) => i.kind === 'path');
  if (p?.kind !== 'path') throw new Error('no path');
  return p;
}

function ringOf(items: SceneItem[]): { cx: number; cy: number; r: number; role: string[] } {
  const c = items.find((i) => i.kind === 'circle');
  if (c?.kind !== 'circle') throw new Error('no circle');
  return c;
}

function failure(src: string): UrsulaError {
  try {
    parseSequence(`sequenceDiagram\n${src}`);
  } catch (err) {
    if (err instanceof UrsulaError) return err;
    throw err;
  }
  throw new Error('expected a parse error');
}

describe('participant kinds: reading', () => {
  it('reads each of the eight kinds from the type setting', () => {
    for (const kind of KINDS) expect(kindsOf(`participant A@{ "type": "${kind}" }`)).toEqual([kind]);
  });

  it('takes the kind from the keyword when there is no setting, and lets the setting win over `actor`', () => {
    expect(kindsOf('participant A\nactor B\nactor C@{ "type": "database" }\nparticipant D@{ "type": "actor" }')).toEqual([
      'participant',
      'actor',
      'database',
      'actor',
    ]);
  });

  it('accepts a space before the setting and braces inside strings', () => {
    const seq = parseSequence('sequenceDiagram\nparticipant A @{ "type" : "queue", "alias": "a } b" }');
    expect(seq.participants).toEqual([{ id: 'A', lines: ['a } b'], kind: 'queue' }]);
  });

  it('reads the external alias, the inline alias, and lets the external one win', () => {
    const seq = parseSequence(
      [
        'sequenceDiagram',
        'participant A as Alice',
        'participant API@{ "type": "boundary" } as Public API',
        'actor DB@{ "type": "database" } as User Database',
        'participant S@{ "type": "control", "alias": "Auth Service" }',
        'participant X@{ "type": "entity", "alias": "Internal" } as External',
        'actor Z as Zed',
      ].join('\n'),
    );
    expect(seq.participants.map((p) => [p.id, p.lines.join('|'), p.kind])).toEqual([
      ['A', 'Alice', 'participant'],
      ['API', 'Public API', 'boundary'],
      ['DB', 'User Database', 'database'],
      ['S', 'Auth Service', 'control'],
      ['X', 'External', 'entity'],
      ['Z', 'Zed', 'actor'],
    ]);
  });

  it('reads the setting after `create`', () => {
    const seq = parseSequence('sequenceDiagram\nA->>B: hi\ncreate participant C@{ "type": "queue" } as Jobs\nA->>C: go\ncreate actor D as Dee\nA->>D: yo');
    expect(seq.participants.map((p) => [p.id, p.kind, p.lines[0]])).toEqual([
      ['A', 'participant', 'A'],
      ['B', 'participant', 'B'],
      ['C', 'queue', 'Jobs'],
      ['D', 'actor', 'Dee'],
    ]);
  });

  it('rejects an unknown type, broken JSON, an unclosed brace and trailing words', () => {
    expect(failure('participant A@{ "type": "robot" }').message).toContain("unknown participant type 'robot'");
    expect(failure('participant A@{ type: boundary }').message).toContain('not valid JSON');
    expect(failure('participant A@{ "type": "queue"').message).toContain("missing '}'");
    expect(failure('participant A@{ "type": "queue" } later').message).toContain("expected 'as <label>'");
    expect(failure('participant @{ "type": "queue" }').message).toContain('needs a participant name');
  });
});

describe('participant kinds: drawing', () => {
  const solo = (kind: string): SceneItem[] => itemsOf(`participant A@{ "type": "${kind}" }\nA->>A: x`, 'A');

  it('draws an actor as a head circle of 16 and one stroke path 48 high in all', () => {
    const items = itemsOf('actor A\nA->>A: x', 'A');
    expect(items.map((i) => i.kind)).toEqual(['circle', 'path']);
    const head = ringOf(items);
    expect([head.r, head.role]).toEqual([8, ['edge']]);
    const path = pathOf(items);
    expect(path.role).toEqual(['edge']);
    const n = numbers(path.d);
    const top = head.cy - 8;
    expect(n[0]).toBe(head.cx);
    expect([n[1], n[2]]).toEqual([top + 16, top + 32]);
    expect((n[5] ?? 0) - (n[3] ?? 0)).toBe(24);
    expect([n[9], n[13]]).toEqual([top + 48, top + 48]);
    expect([(n[8] ?? 0) - head.cx, (n[12] ?? 0) - head.cx]).toEqual([-8, 8]);
  });

  it('draws boundary, control and entity as a circle of 32 with edge-only lines', () => {
    for (const kind of ['boundary', 'control', 'entity']) {
      const items = solo(kind);
      expect(items.map((i) => i.kind)).toEqual(['circle', 'path']);
      expect([ringOf(items).r, ringOf(items).role, pathOf(items).role]).toEqual([16, ['edge'], ['edge']]);
    }
  });

  it('draws the boundary bar 32 high and 12 left of the circle', () => {
    const items = solo('boundary');
    const ring = ringOf(items);
    const [bar, top, bottom, , middle, join] = numbers(pathOf(items).d);
    expect(ring.cx - 16 - (bar ?? 0)).toBe(12);
    expect((bottom ?? 0) - (top ?? 0)).toBe(32);
    expect([middle, join]).toEqual([ring.cy, ring.cx - 16]);
  });

  it('draws the control arrowhead 8 wide on top of the circle, pointing left', () => {
    const items = solo('control');
    const [tail, top, tip, tipY, tail2, bottom] = numbers(pathOf(items).d);
    expect([(tail ?? 0) - (tip ?? 0), tail2]).toEqual([8, tail]);
    expect([tipY, (bottom ?? 0) - (top ?? 0)]).toEqual([ringOf(items).cy - 16, 8]);
  });

  it('draws the entity line 32 wide directly under the circle', () => {
    const items = solo('entity');
    const [left, y, right] = numbers(pathOf(items).d);
    expect([(right ?? 0) - (left ?? 0), y]).toEqual([32, ringOf(items).cy + 16]);
  });

  it('draws a database as one filled path 40 wide and 44 high', () => {
    const items = solo('database');
    expect(items.map((i) => i.kind)).toEqual(['path']);
    const path = pathOf(items);
    expect(path.role).toEqual(['box']);
    const n = numbers(path.d);
    expect((n[7] ?? 0) - (n[0] ?? 0)).toBe(40);
    // The lid is 8 high: the outline starts 4 below the top and the sides end 4 above the bottom.
    expect((n[9] ?? 0) + 4 - ((n[1] ?? 0) - 4)).toBe(44);
    expect(path.d).toContain('A20 4');
  });

  it('draws collections as two boxes of the plain size, the back one 4 right and 4 up', () => {
    const src = 'participant C@{ "type": "collections" }\nparticipant P\nC->>P: x';
    const items = itemsOf(src, 'C');
    expect(items.map((i) => i.kind)).toEqual(['box', 'box']);
    const [back, front] = items;
    const plain = itemsOf(src, 'P')[0];
    if (back?.kind !== 'box' || front?.kind !== 'box' || plain?.kind !== 'box') throw new Error('boxes');
    expect([front.w, front.h]).toEqual([plain.w, plain.h]);
    expect([back.x - front.x, front.y - back.y, back.w, back.h]).toEqual([4, 4, front.w, front.h]);
    expect([front.role, back.role]).toEqual([['box'], ['box']]);
  });

  it('draws a queue as one filled path, as wide as a plain box and 44 high', () => {
    const src = 'participant Q@{ "type": "queue" }\nparticipant P\nQ->>P: x';
    const items = itemsOf(src, 'Q');
    expect(items.map((i) => i.kind)).toEqual(['path']);
    const path = pathOf(items);
    expect(path.role).toEqual(['box']);
    expect(path.d).toContain('A4 22');
    const plain = itemsOf(src, 'P')[0];
    if (plain?.kind !== 'box') throw new Error('plain');
    const n = numbers(path.d);
    // Ends are 4 deep each side, so the box edges lie 4 outside the first and the third number.
    expect((n[2] ?? 0) + 4 - ((n[0] ?? 0) - 4)).toBe(plain.w);
    expect((n[9] ?? 0) - (n[1] ?? 0)).toBe(44);
    expect(plain.h).toBe(44);
  });

  it('keeps a plain participant as the old box', () => {
    expect(itemsOf('participant P\nP->>P: x', 'P').map((i) => i.kind)).toEqual(['box']);
  });
});

describe('participant kinds: header height and lifelines', () => {
  const src = [
    'sequenceDiagram',
    'actor A',
    'participant B@{ "type": "boundary" }',
    'participant C@{ "type": "database" }',
    'participant D@{ "type": "collections" }',
    'participant E@{ "type": "queue" }',
    'participant F',
    'A->>F: x',
  ].join('\n');
  const layout = layoutSequence(parseSequence(src), pixelRuler());

  it('makes the header area as high as the tallest symbol plus its name', () => {
    const tallest = 48 + 8 + pixelRuler().lineHeight('title');
    const bottoms = new Set(layout.participants.map((p) => p.box.y + p.box.h));
    expect(bottoms.size).toBe(1);
    const height = layout.participants[0]?.box.h ?? 0;
    expect(height).toBeGreaterThanOrEqual(tallest);
    expect(height - tallest).toBeLessThan(pixelRuler().grid);
  });

  it('starts every lifeline at the same y, the bottom of the header area', () => {
    const lifelines = layout.scene.items.filter((it) => it.kind === 'line' && Array.isArray(it.role) && it.role.includes('lifeline'));
    expect(lifelines).toHaveLength(6);
    const starts = new Set(lifelines.map((l) => (l.kind === 'line' ? l.points[0]?.y : undefined)));
    expect(starts.size).toBe(1);
    expect([...starts][0]).toBe((layout.participants[0]?.box.y ?? 0) + (layout.participants[0]?.box.h ?? 0));
  });

  it('puts the plain box against the lifeline start and the names of symbols on one baseline', () => {
    const start = (layout.participants[0]?.box.y ?? 0) + (layout.participants[0]?.box.h ?? 0);
    const plain = layout.scene.items.find((it) => it.kind === 'box' && it.data?.participant === 'F');
    expect(plain && plain.kind === 'box' ? plain.y + plain.h : 0).toBe(start);
    const nameY = (id: string): number => {
      const t = layout.scene.items.find((it) => it.kind === 'text' && it.text === id);
      return t && t.kind === 'text' ? t.y : NaN;
    };
    expect(new Set([nameY('A'), nameY('B'), nameY('C')]).size).toBe(1);
  });

  it('leaves the header area at the plain box height when no symbol is used', () => {
    const plain = layoutSequence(parseSequence('sequenceDiagram\nA->>B: x'), pixelRuler());
    expect(plain.participants[0]?.box.h).toBe(44);
  });

  it('keeps the terminal ruler on boxes', () => {
    const cell = layoutSequence(parseSequence(src), cellRuler());
    expect(cell.scene.items.some((it) => it.kind === 'circle' && it.data?.participant !== undefined)).toBe(false);
  });
});

describe('participant kinds: text drawing', () => {
  const lines = (src: string, width?: number): string[] =>
    layoutSequenceText(parseSequence(`sequenceDiagram\n${src}`), cellRuler(), width, undefined).map((l) => l.map((s) => s.text).join(''));

  it('writes a short tag before the name of a symbol participant', () => {
    const out = lines('actor U as User\nparticipant D@{ "type": "database" } as Store\nparticipant P\nU->>D: q\nD-->>P: r').join('\n');
    expect(out).toContain('[actor] User');
    expect(out).toContain('[db] Store');
    expect(out).not.toContain('[participant]');
  });

  it('drops the tags when they would add rows at a narrow width', () => {
    const src = 'actor U\nparticipant D@{ "type": "database" }\nU->>D: a fairly long message label here';
    const wide = lines(src, 200).join('\n');
    expect(wide).toContain('[actor] U');
    for (const w of [60, 40]) {
      for (const l of lines(src, w)) expect([...l].length).toBeLessThanOrEqual(w);
    }
  });
});

describe('Mermaid documentation examples', () => {
  const dir = new URL('./sequence-official/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.mmd'));

  it('keeps all 38 examples', () => {
    expect(files).toHaveLength(38);
  });

  it('draws every one of them in the pixel and the text form', () => {
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      expect(() => render(src), f).not.toThrow();
      expect(renderText(src, 200), f).toHaveProperty('lines');
    }
  });
});
