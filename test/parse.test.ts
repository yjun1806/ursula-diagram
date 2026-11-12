import { describe, expect, it } from 'vitest';
import { parse, UrsulaError } from '../src/index.ts';

function failure(src: string): UrsulaError {
  try {
    parse(src);
  } catch (e) {
    if (e instanceof UrsulaError) return e;
    throw e;
  }
  throw new Error('expected parse to fail');
}

describe('parse', () => {
  it('reads direction, defaulting to TD and mapping TB', () => {
    expect(parse('flowchart LR\nA').direction).toBe('LR');
    expect(parse('graph TB\nA').direction).toBe('TD');
    expect(parse('flowchart\nA').direction).toBe('TD');
  });

  it('reads node shapes and labels', () => {
    const g = parse('flowchart LR\nA[square]\nB(round)\nC{choice}\nD((circle))\nE["quoted [text]"]\nF');
    expect(g.nodes.map((n) => [n.id, n.title])).toEqual([
      ['A', 'square'],
      ['B', 'round'],
      ['C', 'choice'],
      ['D', 'circle'],
      ['E', 'quoted [text]'],
      ['F', 'F'],
    ]);
  });

  it('splits labels on <br> into title and lines', () => {
    const g = parse('flowchart LR\nA[주문 접수<br>접수 시각<br/>담당자]');
    expect(g.nodes[0]).toMatchObject({ title: '주문 접수', lines: ['접수 시각', '담당자'] });
  });

  it('reads edge styles, labels and chains', () => {
    const g = parse(
      'flowchart LR\nA --> B --> C\nA ==> C\nA -.-> D\nA --- E\nA -.- F\nA -->|pipe| G\nA -- inline --> H\nA == bold ==> I\nA -. soft .-> J',
    );
    expect(g.edges.map((e) => [e.from, e.to, e.style, e.label])).toEqual([
      ['A', 'B', 'normal', undefined],
      ['B', 'C', 'normal', undefined],
      ['A', 'C', 'thick', undefined],
      ['A', 'D', 'dotted', undefined],
      ['A', 'E', 'normal', undefined],
      ['A', 'F', 'dotted', undefined],
      ['A', 'G', 'normal', 'pipe'],
      ['A', 'H', 'normal', 'inline'],
      ['A', 'I', 'thick', 'bold'],
      ['A', 'J', 'dotted', 'soft'],
    ]);
  });

  it('accepts semicolons and comments', () => {
    const g = parse('flowchart LR; A --> B; B --> C %% trailing\n%% whole line\n');
    expect(g.edges).toHaveLength(2);
  });

  it('puts nodes into subgraph lanes and the rest into an implicit lane', () => {
    const g = parse('flowchart LR\nsubgraph s1[First lane]\nA --> B\nend\nsubgraph "Second"\nC\nend\nB --> C\nD');
    expect(g.lanes.map((l) => l.label)).toEqual(['First lane', 'Second', '']);
    expect(g.nodes.map((n) => [n.id, n.lane])).toEqual([
      ['A', 's1'],
      ['B', 's1'],
      ['C', 'lane2'],
      ['D', '_'],
    ]);
  });

  it('uses one implicit lane without subgraphs', () => {
    const g = parse('flowchart TD\nA --> B');
    expect(g.lanes).toEqual([{ id: '_', label: '' }]);
  });

  it('ignores styling and click directives', () => {
    const g = parse(
      'flowchart LR\nA --> B\nclassDef hot fill:#f00\nclass A hot\nstyle B fill:#fff\nlinkStyle 0 stroke:red\nclick A callback\ndirection LR',
    );
    expect(g.nodes).toHaveLength(2);
  });

  it('reports errors with 1-based line numbers', () => {
    expect(failure('flowchart XY\nA')).toMatchObject({ code: 'syntax', line: 1 });
    expect(failure('flowchart LR\nA --> B\nsequenceDiagram')).toMatchObject({ line: 3 });
    expect(failure('sequenceDiagram\nA->>B: hi')).toMatchObject({ code: 'unsupported-diagram', line: 1 });
    expect(failure('flowchart LR\nsubgraph a\ndirection XY\nA\nend')).toMatchObject({ code: 'syntax', line: 3 });
    expect(failure('flowchart LR\nsubgraph a\nA')).toMatchObject({ line: 2 });
    expect(failure('flowchart LR\nend')).toMatchObject({ line: 2 });
    expect(failure('flowchart LR\nA --> B\nA ~~ B')).toMatchObject({ line: 3 });
    expect(failure('flowchart LR\nA[open')).toMatchObject({ line: 2 });
    expect(failure('flowchart LR\nA --> ')).toMatchObject({ line: 2 });
    expect(failure('A --> B')).toMatchObject({ line: 1 });
    expect(failure('')).toMatchObject({ code: 'syntax' });
  });

  it('drops icon words from a node label', () => {
    const g = parse('flowchart LR\na[fa:fa-car Car]\nb["fab:fa-name Two<br/>fas:fa-x-y Line"]\nc[far:fa-flag]\nd[Plain fa:fa-flag]');
    expect(g.nodes.map((n) => [n.id, n.title, n.lines])).toEqual([
      ['a', 'Car', []],
      ['b', 'Two', ['Line']],
      ['c', 'c', []],
      ['d', 'Plain', []],
    ]);
  });
});
