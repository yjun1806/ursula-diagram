// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler } from '../src/metrics.ts';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { layoutZenuml } from '../src/zenuml/layout.ts';
import { parseZenuml } from '../src/zenuml/parse.ts';
import { shiftPathDown } from '../src/zenuml/shift.ts';
import type { SceneText } from '../src/types.ts';

const REPLY = `zenuml
    title Reply message
    Client->A.method() {
      B.method() {
        if(condition) {
          return x1
          // return early
          @return
          A->Client: x11
        }
      }
      return x2
    }`;
const DEMO = `zenuml
    title Demo
    Alice->John: Hello John, how are you?
    John->Alice: Great!
    Alice->John: See you later!`;
const ALT = `zenuml
    Alice->Bob: Hello Bob, how are you?
    if(is_sick) {
      Bob->Alice: Not so good :(
    } else {
      Bob->Alice: Feeling fresh like a daisy
    }`;
const TRY = `zenuml
    try {
      Consumer->API: Book something
    } catch {
      API->Consumer: show failure
    } finally {
      API->Consumer: rollback status
    }`;
const KINDS = `zenuml
    @Actor Alice
    @Database Bob
    @Lambda Fn
    Alice->Bob: Hi Bob`;
const CREATE = `zenuml
    new A1
    new A2(with, parameters)`;
const SYNC = `zenuml
    A.SyncMessage
    A.SyncMessage(with, parameters) {
      B.nestedSyncMessage()
    }`;
const LOOPS = `zenuml
    Alice->John: Hello
    while(true) {
      John->Alice: Great!
    }
    for(i in xs) {
      John->Alice: again
    }`;
const COMMENT = `zenuml
    // a comment on a participant will not be rendered
    BookService
    // a comment on a message.
    // **Markdown** is supported.
    BookService.getBook()`;
const ASSIGN = `zenuml
    a = A.SyncMessage()
    SomeType b = A.Other() {
      B.inner()
    }`;

const ALL = [REPLY, DEMO, ALT, TRY, KINDS, CREATE, SYNC, LOOPS, COMMENT, ASSIGN];
const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/gu)].map((m) => m[1] ?? '');

describe('zenuml render', () => {
  it('draws every example', () => {
    for (const src of ALL) {
      const svg = render(src);
      expect(svg).toContain('data-theme="band"');
    }
  });

  it('draws the title and every label', () => {
    const t = texts(render(DEMO));
    expect(t).toEqual(expect.arrayContaining(['Demo', 'Alice', 'John', 'Hello John, how are you?', 'Great!', 'See you later!']));
  });

  it('takes a front-matter title when the text has none', () => {
    expect(texts(render('---\ntitle: From matter\n---\nzenuml\n  A->B: hi'))).toContain('From matter');
  });

  it('draws a terminal text', () => {
    const r = renderText(DEMO, 100);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines[0]).toBe('Demo');
    expect(r.lines.join('\n')).toContain('Hello John, how are you?');
  });
});

describe('zenuml parse', () => {
  it('turns nested calls into bars, replies and a frame', () => {
    const { sequence } = parseZenuml(REPLY);
    expect(sequence.participants.map((p) => p.id)).toEqual(['Client', 'A', 'B']);
    const kinds = sequence.statements.map((s) => s.kind);
    expect(kinds).toEqual(['message', 'message', 'open', 'message', 'note', 'message', 'close', 'deactivate', 'message']);
    const first = sequence.statements[0];
    expect(first).toMatchObject({ from: 'Client', to: 'A', lines: ['method()'], activate: true });
    const last = sequence.statements[sequence.statements.length - 1];
    expect(last).toMatchObject({ from: 'A', to: 'Client', lines: ['x2'], dashed: true, deactivate: true });
  });

  it('reads @return as a reply and a comment as a note', () => {
    const { sequence } = parseZenuml(REPLY);
    const note = sequence.statements.find((s) => s.kind === 'note');
    expect(note).toMatchObject({ lines: ['return early'], anchors: ['A', 'Client'] });
    expect(sequence.statements.find((s) => s.kind === 'message' && s.lines[0] === 'x11')).toMatchObject({ dashed: true, head: 'filled' });
  });

  it('adds a starter when a call has no sender', () => {
    const { sequence } = parseZenuml(SYNC);
    expect(sequence.participants.map((p) => p.id)).toEqual(['_STARTER_', 'A', 'B']);
    expect(sequence.participants[0]?.kind).toBe('actor');
  });

  it('maps annotators to kinds and keeps the name of the others', () => {
    const { sequence } = parseZenuml(KINDS);
    expect(sequence.participants.map((p) => p.kind)).toEqual(['actor', 'database', 'participant']);
    expect(sequence.participants[2]?.lines).toEqual(['Fn', '«Lambda»']);
  });

  it('reads aliases', () => {
    expect(parseZenuml('zenuml\n  A as Alice\n  A->B: hi').sequence.participants[0]?.lines).toEqual(['Alice']);
  });

  it('turns else and try/catch/finally into branches of one frame', () => {
    const alt = parseZenuml(ALT);
    expect(alt.sequence.statements.map((s) => s.kind)).toEqual(['message', 'open', 'message', 'branch', 'message', 'close']);
    expect(alt.sequence.statements[1]).toMatchObject({ block: 'alt', lines: ['is_sick'] });
    expect(alt.sequence.statements[3]).toMatchObject({ lines: ['else'] });
    const tr = parseZenuml(TRY);
    expect(tr.sequence.statements.filter((s) => s.kind === 'branch').map((s) => (s.kind === 'branch' ? s.lines[0] : ''))).toEqual(['catch', 'finally']);
    expect([...tr.tags.values()]).toEqual(['try']);
  });

  it('replies with the assigned variable', () => {
    const msgs = parseZenuml(ASSIGN).sequence.statements.filter((s) => s.kind === 'message');
    expect(msgs.map((m) => (m.kind === 'message' ? m.lines[0] : ''))).toEqual(['SyncMessage()', 'a', 'Other()', 'inner()', 'SomeType b']);
  });

  it('drops the emphasis marks of a comment but keeps its words', () => {
    const note = parseZenuml(COMMENT).sequence.statements.find((s) => s.kind === 'note');
    expect(note).toMatchObject({ lines: ['a comment on a message.', 'Markdown is supported.'] });
  });

  it('rejects wrong syntax with a line number', () => {
    let error: unknown;
    try {
      parseZenuml('zenuml\n  A->B: ok\n  what is this ?');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UrsulaError);
    expect((error as UrsulaError).line).toBe(3);
    expect(() => parseZenuml('zenuml\n  A.m() {\n')).toThrow(UrsulaError);
    expect(() => parseZenuml('zenuml\n  return x')).toThrow(/line 2/u);
  });
});

describe('zenuml layout', () => {
  const layout = layoutZenuml(parseZenuml(REPLY), pixelRuler());
  const textItems = layout.scene.items.filter((i): i is SceneText => i.kind === 'text');

  it('writes the frame tag of an if and shifts the drawing under the title', () => {
    expect(textItems.map((t) => t.text)).toEqual(expect.arrayContaining(['if', 'Reply message']));
    const title = textItems.find((t) => t.text === 'Reply message');
    const head = layout.participants[0];
    expect(title?.y).toBeLessThan(head?.box.y ?? 0);
    expect(layout.scene.height).toBeGreaterThan(layout.messages[layout.messages.length - 1]?.y ?? 0);
  });

  it('keeps the participants on the grid and the text inside the drawing', () => {
    for (const p of layout.participants) expect(p.box.y % 4).toBe(0);
    for (const t of textItems) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(layout.scene.width);
    }
  });

  it('puts no two texts on top of each other', () => {
    const ruler = pixelRuler();
    const boxes = textItems.map((t) => {
      const w = ruler.textWidth(t.text, 'edge');
      const x = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
      return { t: t.text, x1: x, x2: x + w, y1: t.y - 6, y2: t.y + 6 };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b) continue;
        const overlap = a.x1 < b.x2 - 1 && b.x1 < a.x2 - 1 && a.y1 < b.y2 - 1 && b.y1 < a.y2 - 1;
        expect(overlap, `${a.t} / ${b.t}`).toBe(false);
      }
    }
  });

  it('fits the tag pill to its keyword and keeps the keyword centred in it', () => {
    const tag = layout.scene.items.find((i) => i.kind === 'box' && i.role?.includes('tag'));
    const text = textItems.find((t) => t.role?.includes('tag-text'));
    if (tag?.kind !== 'box' || text === undefined) throw new Error('missing tag');
    expect(tag.w).toBe(28);
    expect(text.x).toBe(tag.x + tag.w / 2);
  });

  it('spans the if frame over the lifelines it covers, 24 out from each', () => {
    const frame = layout.frames[0];
    const xs = layout.participants.map((p) => p.x);
    expect(frame?.x).toBe((xs[0] ?? 0) - 24);
    expect((frame?.x ?? 0) + (frame?.w ?? 0)).toBe((xs[2] ?? 0) + 24);
  });

  it('writes the condition right of the tag, without brackets', () => {
    const tag = layout.scene.items.find((i) => i.kind === 'box' && i.role?.includes('tag'));
    const cond = textItems.find((t) => t.text === 'condition');
    expect(textItems.some((t) => t.text.includes('['))).toBe(false);
    if (tag?.kind !== 'box' || cond === undefined) throw new Error('missing tag or condition');
    expect(cond.x).toBe(tag.x + tag.w + 8);
    expect(cond.y).toBe(tag.y + tag.h / 2);
    const frame = layout.frames[0];
    const first = layout.messages.find((m) => (m.y ?? 0) > (frame?.y ?? 0));
    // The condition takes no row of its own: the first message inside sits as close as one without a condition.
    const bare = layoutZenuml(parseZenuml(REPLY.replace('if(condition)', 'opt')), pixelRuler());
    const bareFirst = bare.messages.find((m) => (m.y ?? 0) > (bare.frames[0]?.y ?? 0));
    expect((first?.y ?? 0) - (frame?.y ?? 0)).toBe((bareFirst?.y ?? 0) - (bare.frames[0]?.y ?? 0));
  });

  it('names a frame by the keyword written in the text', () => {
    const tagsOf = (src: string): string[] =>
      layoutZenuml(parseZenuml(src), pixelRuler()).scene.items.flatMap((i) => (i.kind === 'text' && i.role?.includes('tag-text') ? [i.text] : []));
    expect(tagsOf(LOOPS)).toEqual(['while', 'for']);
    expect(tagsOf(ALT)).toEqual(['if']);
    expect(tagsOf('zenuml\n  par {\n    A->B: hi\n  }')).toEqual(['par']);
  });

  it('draws an async message and a creation as solid lines; only replies are dashed', () => {
    const heads = layoutZenuml(parseZenuml('zenuml\n  A->B: hi\n  A.call()'), pixelRuler()).scene.items.flatMap((i) => (i.kind === 'line' && i.data?.['message'] !== undefined ? [String(i.role?.includes('edge--arrow'))] : []));
    expect(heads).toEqual(['false', 'true']);
    const dashedOf = (src: string): string[] =>
      layoutZenuml(parseZenuml(src), pixelRuler()).scene.items.flatMap((i) => (i.kind === 'line' && Array.isArray(i.role) && i.role.includes('edge--msg') && i.data?.['message'] !== undefined ? [String(i.role.includes('edge--pending'))] : []));
    expect(dashedOf(DEMO)).toEqual(['false', 'false', 'false']);
    expect(dashedOf(CREATE)).toEqual(['false', 'false']);
    expect(dashedOf('zenuml\n  @return\n  A->B: result')).toEqual(['true']);
  });

  it('fits a comment box to its text', () => {
    const ruler = pixelRuler();
    const note = layout.notes[0];
    expect(note?.box.w).toBeLessThanOrEqual(Math.ceil((ruler.textWidth('return early', 'line') + 24) / 4) * 4 + 2);
    const box = layout.scene.items.find((i) => i.kind === 'box' && i.role?.includes('note'));
    expect(box?.kind === 'box' ? box.w : 0).toBe(note?.box.w);
    const text = textItems.find((t) => t.text === 'return early');
    expect(text?.x).toBeCloseTo((note?.box.x ?? 0) + (note?.box.w ?? 0) / 2, 0);
  });

  it('moves absolute path data down', () => {
    expect(shiftPathDown('M10 20V30H40A4 2 0 0 1 8 6Z', 8)).toBe('M 10 28 V 38 H 40 A 4 2 0 0 1 8 14 Z');
  });
});
