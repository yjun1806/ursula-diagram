// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { layout, pixelRuler, render, UrsulaError } from '../src/index.ts';
import { parseState } from '../src/state/parse.ts';
import type { Theme } from '../src/index.ts';

const EXAMPLES: string[] = [
  `---
title: Simple sample
---
stateDiagram-v2
    [*] --> Still
    Still --> [*]

    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]`,
  `stateDiagram
    [*] --> Still
    Still --> [*]

    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]`,
  `stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted : submit
  state Review {
    [*] --> Screening
    Screening --> Decision
  }
  Submitted --> Review
  Review --> Published : approved
  Review --> Draft : rejected
  Published --> [*]`,
  `---
config:
  theme: default
  look: classic
  layout: dagre
---
stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted : submit
  state Review {
    [*] --> Screening
    Screening --> Decision
  }
  Submitted --> Review
  Review --> Published : approved
  Review --> Draft : rejected
  Published --> [*]`,
  `stateDiagram-v2
    stateId`,
  `stateDiagram-v2
    state "This is a state description" as s2`,
  `stateDiagram-v2
    s2 : This is a state description`,
  `stateDiagram-v2
    s1 --> s2`,
  `stateDiagram-v2
    s1 --> s2: A transition`,
  `stateDiagram-v2
    [*] --> s1
    s1 --> [*]`,
  `stateDiagram-v2
    [*] --> First
    state First {
        [*] --> second
        second --> [*]
    }

    [*] --> NamedComposite
    NamedComposite: Another Composite
    state NamedComposite {
        [*] --> namedSimple
        namedSimple --> [*]
        namedSimple: Another simple
    }`,
  `stateDiagram-v2
    [*] --> First

    state First {
        [*] --> Second

        state Second {
            [*] --> second
            second --> Third

            state Third {
                [*] --> third
                third --> [*]
            }
        }
    }`,
  `stateDiagram-v2
    [*] --> First
    First --> Second
    First --> Third

    state First {
        [*] --> fir
        fir --> [*]
    }
    state Second {
        [*] --> sec
        sec --> [*]
    }
    state Third {
        [*] --> thi
        thi --> [*]
    }`,
  `stateDiagram-v2
    state if_state <<choice>>
    [*] --> IsPositive
    IsPositive --> if_state
    if_state --> False: if n < 0
    if_state --> True : if n >= 0`,
  `   stateDiagram-v2
    state fork_state <<fork>>
      [*] --> fork_state
      fork_state --> State2
      fork_state --> State3

      state join_state <<join>>
      State2 --> join_state
      State3 --> join_state
      join_state --> State4
      State4 --> [*]`,
  `    stateDiagram-v2
        State1: The state with a note
        note right of State1
            Important information! You can write
            notes.
        end note
        State1 --> State2
        note left of State2 : This is the note to the left.`,
  `stateDiagram-v2
    [*] --> Active

    state Active {
        [*] --> NumLockOff
        NumLockOff --> NumLockOn : EvNumLockPressed
        NumLockOn --> NumLockOff : EvNumLockPressed
        --
        [*] --> CapsLockOff
        CapsLockOff --> CapsLockOn : EvCapsLockPressed
        CapsLockOn --> CapsLockOff : EvCapsLockPressed
        --
        [*] --> ScrollLockOff
        ScrollLockOff --> ScrollLockOn : EvScrollLockPressed
        ScrollLockOn --> ScrollLockOff : EvScrollLockPressed
    }`,
  `stateDiagram
    direction LR
    [*] --> A
    A --> B
    B --> C
    state B {
      direction LR
      a --> b
    }
    B --> D`,
  `stateDiagram-v2
    [*] --> Still
    Still --> [*]
%% this is a comment
    Still --> Moving
    Moving --> Still %% another comment
    Moving --> Crash
    Crash --> [*]`,
  `   stateDiagram
   direction TB

   accTitle: This is the accessible title
   accDescr: This is an accessible description

   classDef notMoving fill:white
   classDef movement font-style:italic
   classDef badBadEvent fill:#f00,color:white,font-weight:bold,stroke-width:2px,stroke:yellow

   [*]--> Still
   Still --> [*]
   Still --> Moving
   Moving --> Still
   Moving --> Crash
   Crash --> [*]

   class Still notMoving
   class Moving, Crash movement
   class Crash badBadEvent
   class end badBadEvent`,
  `stateDiagram
   direction TB

   accTitle: This is the accessible title
   accDescr: This is an accessible description

   classDef notMoving fill:white
   classDef movement font-style:italic;
   classDef badBadEvent fill:#f00,color:white,font-weight:bold,stroke-width:2px,stroke:yellow

   [*] --> Still:::notMoving
   Still --> [*]
   Still --> Moving:::movement
   Moving --> Still
   Moving --> Crash:::movement
   Crash:::badBadEvent --> [*]`,
  `stateDiagram
    classDef yourState font-style:italic,font-weight:bold,fill:white

    yswsii: Your state with spaces in it
    [*] --> yswsii:::yourState
    [*] --> SomeOtherState
    SomeOtherState --> YetAnotherState
    yswsii --> YetAnotherState
    YetAnotherState --> [*]`,
];

const STILL = `stateDiagram-v2
    [*] --> Still
    Still --> [*]

    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]`;

const COMPOSITE = `stateDiagram-v2
    [*] --> First
    state First {
        [*] --> second
        second --> [*]
    }

    [*] --> NamedComposite
    NamedComposite: Another Composite
    state NamedComposite {
        [*] --> namedSimple
        namedSimple --> [*]
        namedSimple: Another simple
    }`;

const CONCURRENT = `stateDiagram-v2
    [*] --> Active
    state Active {
        [*] --> NumLockOff
        NumLockOff --> NumLockOn : EvNumLockPressed
        --
        [*] --> CapsLockOff
        CapsLockOff --> CapsLockOn : EvCapsLockPressed
    }`;

const NOTES = `stateDiagram-v2
    State1: The state with a note
    note right of State1
        Important information! You can write
        notes.
    end note
    State1 --> State2
    note left of State2 : This is the note to the left.`;

const FORK = `stateDiagram-v2
    state fork_state <<fork>>
    state if_state <<choice>>
    [*] --> fork_state
    fork_state --> if_state
    if_state --> A: if n < 0`;

describe('state diagram: reading', () => {
  it('turns [*] into one start and one end per scope', () => {
    const { graph } = parseState(STILL);
    expect(graph.nodes.filter((n) => n.shape === 'start-dot')).toHaveLength(1);
    expect(graph.nodes.filter((n) => n.shape === 'end-dot')).toHaveLength(1);
    expect(graph.nodes.filter((n) => n.shape === 'round').map((n) => n.id)).toEqual(['Still', 'Moving', 'Crash']);
    expect(graph.edges).toHaveLength(6);
  });

  it('gives each composite state its own start and end, and a cluster box', () => {
    const { graph } = parseState(COMPOSITE);
    expect(graph.clusters?.map((c) => [c.id, c.label])).toEqual([
      ['First', 'First'],
      ['NamedComposite', 'Another Composite'],
    ]);
    expect(graph.nodes.filter((n) => n.shape === 'start-dot')).toHaveLength(3);
    expect(graph.nodes.find((n) => n.id === 'namedSimple')).toMatchObject({ title: 'namedSimple', lines: ['Another simple'], cluster: 'NamedComposite' });
    expect(graph.edges.some((e) => e.from.startsWith('[*]start:') && e.to === 'First')).toBe(true);
  });

  it('splits "--" into unnamed regions inside the composite', () => {
    const { graph } = parseState(CONCURRENT);
    const regions = graph.clusters?.filter((c) => c.parent === 'Active') ?? [];
    expect(regions).toHaveLength(2);
    expect(regions.every((r) => r.label === '')).toBe(true);
    expect(graph.nodes.find((n) => n.id === 'CapsLockOff')?.cluster).toBe(regions[1]?.id);
  });

  it('reads fork, join and choice shapes, and notes with a dotted line', () => {
    const f = parseState(FORK).graph;
    expect(f.nodes.find((n) => n.id === 'fork_state')?.shape).toBe('bar');
    expect(f.nodes.find((n) => n.id === 'if_state')?.shape).toBe('diamond');
    expect(f.edges.find((e) => e.to === 'A')?.label).toBe('if n < 0');
    const n = parseState(NOTES).graph;
    const notes = n.nodes.filter((x) => x.shape === 'note');
    expect(notes.map((x) => x.lines)).toEqual([['Important information! You can write', 'notes.'], ['This is the note to the left.']]);
    expect(n.edges.filter((e) => e.style === 'dotted' && e.end === 'none')).toHaveLength(2);
  });

  it('reads direction, a quoted name, styles and ::: classes', () => {
    const g = parseState(`stateDiagram
      direction LR
      classDef a fill:white
      state "Long name" as L
      [*] --> L:::a
      L --> B
      state B {
        direction TB
        x --> y
      }`).graph;
    expect(g.direction).toBe('LR');
    expect(g.nodes.find((n) => n.id === 'L')?.title).toBe('Long name');
    expect(g.clusters?.[0]?.direction).toBe('TD');
    expect(g.ignored).toEqual(['classDef a fill:white']);
  });

  it('reads accTitle', () => {
    expect(parseState('stateDiagram\n accTitle: Hello\n a --> b').accTitle).toBe('Hello');
  });
});

describe('state diagram: official examples', () => {
  it('draws every example in every theme', () => {
    expect(EXAMPLES).toHaveLength(22);
    for (const [i, src] of EXAMPLES.entries()) {
      for (const theme of ['solid', 'outline', 'card'] as Theme[]) {
        expect(render(src, { theme }), `example ${i + 1}`).toContain(`data-theme="${theme}"`);
      }
    }
  });
});

describe('state diagram: layout', () => {
  const px = pixelRuler();
  it('keeps every box and label inside the drawing', () => {
    for (const src of [STILL, COMPOSITE, CONCURRENT, NOTES, FORK]) {
      const l = layout(parseState(src).graph, px, { legend: false });
      for (const n of l.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x + n.w).toBeLessThanOrEqual(l.width + 1e-6);
        expect(n.y + n.h).toBeLessThanOrEqual(l.height + 1e-6);
      }
      for (const e of l.edges) {
        if (e.label === undefined) continue;
        expect(e.label.x).toBeGreaterThanOrEqual(0);
        expect(e.label.x + e.label.w).toBeLessThanOrEqual(l.width + 1e-6);
      }
    }
  });

  it('draws nodes of one composite inside its box', () => {
    const l = layout(parseState(COMPOSITE).graph, px, { legend: false });
    const box = l.clusters?.find((c) => c.id === 'First');
    const inner = l.nodes.find((n) => n.id === 'second');
    expect(box && inner && inner.x >= box.x && inner.x + inner.w <= box.x + box.w && inner.y >= box.y && inner.y + inner.h <= box.y + box.h).toBe(true);
  });
});

describe('state diagram: errors', () => {
  it('reports a line number for an unreadable statement', () => {
    const run = (): string => render('stateDiagram-v2\n  a --> b\n  state {{ nope');
    expect(run).toThrow(UrsulaError);
    try {
      run();
    } catch (e) {
      expect((e as UrsulaError).line).toBe(3);
    }
  });

  it('reports an unclosed block', () => {
    expect(() => parseState('stateDiagram-v2\n state A {\n  x --> y')).toThrow(UrsulaError);
  });
});
