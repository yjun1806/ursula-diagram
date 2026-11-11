import { describe, expect, it } from 'vitest';
import { parseSequence, UrsulaError } from '../src/index.ts';
import type { MessageStmt, NoteStmt } from '../src/index.ts';

function failure(src: string): UrsulaError {
  try {
    parseSequence(src);
  } catch (err) {
    if (err instanceof UrsulaError) return err;
    throw err;
  }
  throw new Error('expected a parse error');
}

const msg = (src: string): MessageStmt => {
  const m = parseSequence(`sequenceDiagram\n${src}`).statements[0];
  if (m?.kind !== 'message') throw new Error('not a message');
  return m;
};

describe('parseSequence participants', () => {
  it('declares participants and actors with optional labels', () => {
    const seq = parseSequence('sequenceDiagram\nparticipant A\nparticipant B as Checkout Service\nactor C as 고객');
    expect(seq.participants).toEqual([
      { id: 'A', lines: ['A'], actor: false },
      { id: 'B', lines: ['Checkout Service'], actor: false },
      { id: 'C', lines: ['고객'], actor: true },
    ]);
  });

  it('adds implicit participants in order of first use', () => {
    const seq = parseSequence('sequenceDiagram\nparticipant Z\nB->>A: hi\nC->>B: hey');
    expect(seq.participants.map((p) => p.id)).toEqual(['Z', 'B', 'A', 'C']);
  });

  it('keeps the position of a participant that is declared after its first use', () => {
    const seq = parseSequence('sequenceDiagram\nB->>A: hi\nparticipant A as Alice');
    expect(seq.participants.map((p) => [p.id, p.lines])).toEqual([
      ['B', ['B']],
      ['A', ['Alice']],
    ]);
  });

  it('splits labels on <br/>', () => {
    const seq = parseSequence('sequenceDiagram\nparticipant S as Upload<br/>Service');
    expect(seq.participants[0]?.lines).toEqual(['Upload', 'Service']);
  });
});

describe('parseSequence messages', () => {
  it.each([
    ['A->>B: x', false, 'filled'],
    ['A-->>B: x', true, 'filled'],
    ['A->B: x', false, 'none'],
    ['A-->B: x', true, 'none'],
    ['A-xB: x', false, 'cross'],
    ['A--xB: x', true, 'cross'],
    ['A-)B: x', false, 'open'],
    ['A--)B: x', true, 'open'],
  ] as const)('reads the arrow of %s', (src, dashed, head) => {
    expect(msg(src)).toMatchObject({ from: 'A', to: 'B', dashed, head, lines: ['x'] });
  });

  it('reads text with <br/> breaks, colons and no text', () => {
    expect(msg('A->>B: first<br/>second<br>third').lines).toEqual(['first', 'second', 'third']);
    expect(msg('A->>B: GET /a: ok').lines).toEqual(['GET /a: ok']);
    expect(msg('A->>B:').lines).toEqual([]);
    expect(msg('A->>B').lines).toEqual([]);
  });

  it('reads self messages and names with a hyphen', () => {
    expect(msg('A->>A: retry')).toMatchObject({ from: 'A', to: 'A' });
    expect(msg('web-app->>db-1: q')).toMatchObject({ from: 'web-app', to: 'db-1' });
  });

  it('reads activation suffixes', () => {
    expect(msg('A->>+B: go')).toMatchObject({ to: 'B', activate: true, deactivate: false });
    const seq = parseSequence('sequenceDiagram\nA->>+B: go\nB-->>-A: done');
    expect(seq.statements[1]).toMatchObject({ from: 'B', to: 'A', activate: false, deactivate: true });
  });

  it('numbers messages after autonumber, with start and step', () => {
    const seq = parseSequence('sequenceDiagram\nA->>B: a\nautonumber\nA->>B: b\nA->>B: c\nautonumber off\nA->>B: d');
    expect(seq.statements.map((s) => (s.kind === 'message' ? s.number : -1))).toEqual([undefined, 1, 2, undefined]);
    const stepped = parseSequence('sequenceDiagram\nautonumber 10 5\nA->>B: a\nA->>B: b');
    expect(stepped.statements.map((s) => (s.kind === 'message' ? s.number : -1))).toEqual([10, 15]);
  });
});

describe('parseSequence statements', () => {
  it('reads activate and deactivate', () => {
    const seq = parseSequence('sequenceDiagram\nactivate A\nA->>B: x\ndeactivate A');
    expect(seq.statements.map((s) => s.kind)).toEqual(['activate', 'message', 'deactivate']);
  });

  it('reads notes on every side', () => {
    const seq = parseSequence(
      'sequenceDiagram\nNote right of A: r\nNote left of A: l\nNote over A: o\nNote over A,B: two<br/>lines',
    );
    const notes = seq.statements as NoteStmt[];
    expect(notes.map((n) => [n.side, n.anchors, n.lines])).toEqual([
      ['right', ['A'], ['r']],
      ['left', ['A'], ['l']],
      ['over', ['A'], ['o']],
      ['over', ['A', 'B'], ['two', 'lines']],
    ]);
  });

  it('reads nested blocks with else and and branches', () => {
    const seq = parseSequence(
      [
        'sequenceDiagram',
        'loop Every minute',
        'alt ok',
        'A->>B: x',
        'else failed',
        'opt retry',
        'A->>B: y',
        'end',
        'end',
        'par one',
        'A->>B: p',
        'and two',
        'B->>A: q',
        'end',
        'end',
      ].join('\n'),
    );
    expect(seq.statements.map((s) => (s.kind === 'open' ? `open:${s.block}:${s.lines.join('')}` : s.kind))).toEqual([
      'open:loop:Every minute',
      'open:alt:ok',
      'message',
      'branch',
      'open:opt:retry',
      'message',
      'close',
      'close',
      'open:par:one',
      'message',
      'branch',
      'message',
      'close',
      'close',
    ]);
  });

  it('skips comments and blank lines', () => {
    const seq = parseSequence('%% top\n\nsequenceDiagram\n  %% hi\nA->>B: x %% trailing');
    expect(seq.statements).toHaveLength(1);
    expect((seq.statements[0] as MessageStmt).lines).toEqual(['x']);
  });

  it('accepts and ignores title, link, links, destroy, box and rect', () => {
    const seq = parseSequence(
      [
        'sequenceDiagram',
        'title Login',
        'box Aqua Backend',
        'participant A',
        'end',
        'participant B',
        'link A: Docs @ https://example.test',
        'links A: {"Docs": "https://example.test"}',
        'rect rgb(240, 240, 255)',
        'A->>B: x',
        'end',
        'destroy B',
      ].join('\n'),
    );
    expect(seq.statements.map((s) => s.kind)).toEqual(['message']);
    expect(seq.participants.map((p) => p.id)).toEqual(['A', 'B']);
  });

  it('registers participants declared with create', () => {
    const seq = parseSequence('sequenceDiagram\nA->>B: x\ncreate participant C as Cache\nB->>C: y');
    expect(seq.participants.map((p) => [p.id, p.lines[0]])).toEqual([
      ['A', 'A'],
      ['B', 'B'],
      ['C', 'Cache'],
    ]);
  });
});

describe('parseSequence errors', () => {
  it('rejects a missing or wrong header', () => {
    expect(failure('A->>B: x')).toMatchObject({ line: 1, code: 'syntax' });
    expect(failure('\n\nflowchart LR\nA-->B')).toMatchObject({ line: 3 });
    expect(failure('')).toMatchObject({ line: 1 });
  });

  it('rejects unsupported syntax with its line', () => {
    expect(failure('sequenceDiagram\nA->>B: ok\nwhat is this')).toMatchObject({ line: 3, code: 'syntax' });
    expect(failure('sequenceDiagram\ncritical Try\nend')).toMatchObject({ line: 2 });
  });

  it('rejects unbalanced blocks', () => {
    expect(failure('sequenceDiagram\nend')).toMatchObject({ line: 2 });
    expect(failure('sequenceDiagram\nA->>B: x\nloop Forever\nA->>B: y')).toMatchObject({ line: 3 });
  });

  it('rejects branches outside their block', () => {
    expect(failure('sequenceDiagram\nelse nope')).toMatchObject({ line: 2 });
    expect(failure('sequenceDiagram\nloop L\nand nope\nend')).toMatchObject({ line: 3 });
    expect(failure('sequenceDiagram\npar P\nelse nope\nend')).toMatchObject({ line: 3 });
  });

  it('rejects deactivating a participant that is not active', () => {
    expect(failure('sequenceDiagram\nA->>B: x\ndeactivate B')).toMatchObject({ line: 3 });
    expect(failure('sequenceDiagram\nA->>-B: x')).toMatchObject({ line: 2 });
  });

  it('rejects malformed notes and names', () => {
    expect(failure('sequenceDiagram\nNote over A')).toMatchObject({ line: 2 });
    expect(failure('sequenceDiagram\nNote over A,B,C: x')).toMatchObject({ line: 2 });
    expect(failure('sequenceDiagram\nNote right of A,B: x')).toMatchObject({ line: 2 });
    expect(failure('sequenceDiagram\nparticipant')).toMatchObject({ line: 2 });
    expect(failure('sequenceDiagram\nactivate')).toMatchObject({ line: 2 });
    expect(failure('sequenceDiagram\nautonumber x')).toMatchObject({ line: 2 });
  });

  it('prefixes the line number in the message', () => {
    expect(failure('sequenceDiagram\nwhat').message).toMatch(/^line 2: /);
  });
});
