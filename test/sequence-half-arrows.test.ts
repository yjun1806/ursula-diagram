// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { layoutSequence, parseSequence, pixelRuler, render, renderText } from '../src/index.ts';
import type { MessageStmt, SceneItem } from '../src/index.ts';

/** The half-arrow table of the documentation: arrow, dotted, side of the half head, head at the sender's end. */
const TABLE: ReadonlyArray<readonly [string, boolean, 'top' | 'bottom', boolean]> = [
  ['-|\\', false, 'top', false],
  ['--|\\', true, 'top', false],
  ['-|/', false, 'bottom', false],
  ['--|/', true, 'bottom', false],
  ['/|-', false, 'top', true],
  ['/|--', true, 'top', true],
  ['\\|-', false, 'bottom', true],
  ['\\|--', true, 'bottom', true],
  ['-\\\\', false, 'top', false],
  ['--\\\\', true, 'top', false],
  ['-//', false, 'bottom', false],
  ['--//', true, 'bottom', false],
  ['//-', false, 'top', true],
  ['//--', true, 'top', true],
  ['\\\\-', false, 'bottom', true],
  ['\\\\--', true, 'bottom', true],
];

/** One message per row of the table, left to right, then the same arrows right to left and to oneself. */
const forward = TABLE.map(([op]) => `Alice${op}John: ${op}`);
const backward = TABLE.map(([op]) => `John${op}Alice: ${op}`);
const self = TABLE.map(([op]) => `Alice${op}Alice: ${op}`);
const doc = ['sequenceDiagram', 'participant Alice', 'participant John', ...forward, ...backward, ...self].join('\n');

const messagesOf = (src: string): MessageStmt[] => parseSequence(src).statements.filter((s): s is MessageStmt => s.kind === 'message');

type Line = Extract<SceneItem, { kind: 'line' }>;

/** The half head of each message: the lone unlabelled stroke whose end is the tip of that message's line. */
function halfHeads(src: string): Array<{ msg: MessageStmt; tip: { x: number; y: number }; next: { x: number; y: number }; heads: Line[] }> {
  const items = layoutSequence(parseSequence(src), pixelRuler(), { legend: false }).scene.items;
  const lines = items.filter((it): it is Line => it.kind === 'line');
  return messagesOf(src).map((msg, i) => {
    const line = lines.find((l) => l.data?.message === String(i));
    if (!line) throw new Error(`no line for message ${i}`);
    const pts = line.points;
    const [tip, next] = msg.reverse ? [pts[0], pts[1]] : [pts[pts.length - 1], pts[pts.length - 2]];
    if (!tip || !next) throw new Error('short line');
    const heads = lines.filter((l) => l.data === undefined && l.points.some((p) => p.x === tip.x && p.y === tip.y));
    return { msg, tip, next, heads };
  });
}

describe('half arrows', () => {
  it('reads every arrow of the half-arrow table as a half open head with its side, its dots and its end', () => {
    const msgs = messagesOf(doc);
    expect(msgs).toHaveLength(TABLE.length * 3);
    msgs.forEach((m, i) => {
      const [, dashed, half, reverse] = TABLE[i % TABLE.length] ?? [];
      expect(m.head).toBe('open');
      expect(m.dashed).toBe(dashed);
      expect(m.half).toBe(half);
      expect(m.reverse ?? false).toBe(reverse);
    });
    expect(msgs.slice(0, TABLE.length).every((m) => m.from === 'Alice' && m.to === 'John')).toBe(true);
    expect(msgs.slice(TABLE.length, 2 * TABLE.length).every((m) => m.from === 'John' && m.to === 'Alice')).toBe(true);
  });

  it('keeps the activation marks and the centre dots around a half arrow', () => {
    const [on, off, centre] = messagesOf('sequenceDiagram\nA-|\\+B: a\nB--|/-A: b\nA()/|-()B: c');
    expect(on).toMatchObject({ from: 'A', to: 'B', half: 'top', activate: true });
    expect(off).toMatchObject({ from: 'B', to: 'A', half: 'bottom', dashed: true, deactivate: true });
    expect(centre).toMatchObject({ from: 'A', to: 'B', half: 'top', reverse: true, centreFrom: true, centreTo: true });
  });

  it('draws one stroke at the tip, bent above the line for top and below it for bottom, in every direction', () => {
    for (const { msg, tip, next, heads } of halfHeads(doc)) {
      const what = `${msg.from}${msg.reverse ? ' reverse' : ''} ${msg.half} line ${msg.line}`;
      expect(heads, what).toHaveLength(1);
      const stroke = heads[0]?.points ?? [];
      expect(stroke, what).toHaveLength(2);
      const tail = stroke.find((p) => p.x !== tip.x || p.y !== tip.y);
      if (!tail) throw new Error(what);
      // Same length and slope as one stroke of an open head: 8 along the line, 4 across it.
      expect(Math.abs(tail.x - tip.x), what).toBe(8);
      expect(tail.y - tip.y, what).toBe(msg.half === 'top' ? -4 : 4);
      // The stroke lies back along the line, not beyond its tip.
      expect(Math.sign(tail.x - tip.x), what).toBe(Math.sign(next.x - tip.x));
    }
  });

  it('dashes the dotted arrows, and gives none of them a marker head', () => {
    const svg = render(doc, { legend: false }).replace(/<style>[\s\S]*?<\/style>/, '');
    expect(svg).not.toContain('marker-end');
    expect(svg).not.toContain('marker-start');
    const lines = svg.match(/<path class="[^"]*" d="[^"]*" data-message[^>]*>/g) ?? [];
    expect(lines).toHaveLength(TABLE.length * 3);
    expect(lines.filter((l) => l.includes('ursula-edge--pending'))).toHaveLength(TABLE.length * 3 / 2);
  });

  it('draws the legend sample like the first half arrow', () => {
    const items = layoutSequence(parseSequence('sequenceDiagram\nA->>B: a\nA--|/B: b'), pixelRuler()).scene.items;
    const lines = items.filter((it): it is Line => it.kind === 'line');
    const rule = lines.find((l) => Array.isArray(l.role) && l.role.includes('rule'));
    const below = lines.filter((l) => l.data === undefined && (l.points[0]?.y ?? 0) > (rule?.points[0]?.y ?? Infinity));
    const sample = below.find((l) => l.dash === true);
    const tip = sample?.points[1];
    if (!tip) throw new Error('no async sample');
    const heads = below.filter((l) => l !== sample && l.points.some((p) => p.x === tip.x && p.y === tip.y));
    expect(heads).toHaveLength(1);
    expect(heads[0]?.points).toEqual([
      { x: tip.x, y: tip.y },
      { x: tip.x - 8, y: tip.y + 4 },
    ]);
  });

  it('writes the open head glyph at the end that carries the head', () => {
    const out = renderText('sequenceDiagram\nparticipant A\nparticipant B\nA-|\\B: x\nA/|-B: y\nB--//A: z\nA\\|-A: s', 60);
    if ('error' in out) throw new Error(out.error);
    const rows = out.lines.map((l) => l.trim());
    // To the receiver, to the sender, dotted to the receiver on the left, and to the sender on the top row of a self loop.
    expect(rows).toContain('├─ x ──▷┆');
    expect(rows).toContain('├◁ y ───┆');
    expect(rows).toContain('┆◁┄ z ┄┄┤');
    expect(rows).toContain('├◁─┐ s  ┆');
    expect(rows).toContain('┤──┘    ┆');
  });
});
