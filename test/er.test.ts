// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { layout, pixelRuler, render, renderText, UrsulaError } from '../src/index.ts';
import { blankFrontMatter } from '../src/registry.ts';
import { parseEr } from '../src/er/parse.ts';
import { geometryViolations } from './helpers.ts';

const EXAMPLES: Array<[string, string]> = [
  [
    'entity-relationship-diagrams',
    `---
title: Order example
---
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
  ],
  [
    'entity-relationship-diagrams-2',
    `erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name
        string custNumber
        string sector
    }
    ORDER ||--|{ LINE-ITEM : contains
    ORDER {
        int orderNumber
        string deliveryAddress
    }
    LINE-ITEM {
        string productCode
        int quantity
        float pricePerUnit
    }`,
  ],
  [
    'with-the-defaults',
    `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  PRODUCT ||--o{ LINE_ITEM : "appears in"
  CUSTOMER {
    string name
    string email
  }
  ORDER {
    int id
    date placedAt
  }
  LINE_ITEM {
    int quantity
    float price
  }
  PRODUCT {
    string sku
    string title
  }`,
  ],
  [
    'the-previous-appearance',
    `---
config:
  theme: default
  look: classic
  layout: dagre
---
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  PRODUCT ||--o{ LINE_ITEM : "appears in"
  CUSTOMER {
    string name
    string email
  }
  ORDER {
    int id
    date placedAt
  }
  LINE_ITEM {
    int quantity
    float price
  }
  PRODUCT {
    string sku
    string title
  }`,
  ],
  [
    'unicode-text',
    `erDiagram
    "This ❤ Unicode"`,
  ],
  [
    'markdown-formatting',
    `erDiagram
    "This **is** _Markdown_"`,
  ],
  [
    'identification',
    `erDiagram
    CAR ||--o{ NAMED-DRIVER : allows
    PERSON }o..o{ NAMED-DRIVER : is`,
  ],
  [
    'identification-2',
    `erDiagram
    CAR 1 to zero or more NAMED-DRIVER : allows
    PERSON many(0) optionally to 0+ NAMED-DRIVER : is`,
  ],
  [
    'attributes',
    `erDiagram
    CAR ||--o{ NAMED-DRIVER : allows
    CAR {
        string registrationNumber
        string make
        string model
    }
    PERSON ||--o{ NAMED-DRIVER : is
    PERSON {
        string firstName
        string lastName
        int age
    }`,
  ],
  [
    'optional-attribute-types',
    `erDiagram
    PERSON {
        string firstName
        string? middleName
        string lastName
    }`,
  ],
  [
    'entity-name-aliases',
    `erDiagram
    p[Person] {
        string firstName
        string lastName
    }
    a["Customer Account"] {
        string email
    }
    p ||--o| a : has`,
  ],
  [
    'attribute-keys-and-comments',
    `erDiagram
    CAR ||--o{ NAMED-DRIVER : allows
    CAR {
        string registrationNumber PK
        string make
        string model
        string[] parts
    }
    PERSON ||--o{ NAMED-DRIVER : is
    PERSON {
        string driversLicense PK "The license #"
        string(99) firstName "Only 99 characters are allowed"
        string lastName
        string phone UK
        int age
    }
    NAMED-DRIVER {
        string carRegistrationNumber PK, FK
        string driverLicence PK, FK
    }
    MANUFACTURER only one to zero or more CAR : makes`,
  ],
  [
    'direction',
    `erDiagram
    direction TB
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name
        string custNumber
        string sector
    }
    ORDER ||--|{ LINE-ITEM : contains
    ORDER {
        int orderNumber
        string deliveryAddress
    }
    LINE-ITEM {
        string productCode
        int quantity
        float pricePerUnit
    }`,
  ],
  [
    'direction-2',
    `erDiagram
    direction LR
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name
        string custNumber
        string sector
    }
    ORDER ||--|{ LINE-ITEM : contains
    ORDER {
        int orderNumber
        string deliveryAddress
    }
    LINE-ITEM {
        string productCode
        int quantity
        float pricePerUnit
    }`,
  ],
  [
    'subgraphs',
    `erDiagram
    subgraph title1
        CUSTOMER
        CUSTOMER {
            string name
            string custNumber
            string sector
        }
    end
    subgraph title2
        CAR ||--o{ NAMED-DRIVER : allows
        subgraph title3
            PERSON
            PERSON {
                string firstName
                string lastName
                int age
            }
        end
    end`,
  ],
  [
    'subgraphs-2',
    `erDiagram
    subgraph title1
        CUSTOMER
    end`,
  ],
  [
    'subgraphs-3',
    `erDiagram
    subgraph "Customer Domain"
        CUSTOMER
    end`,
  ],
  [
    'subgraphs-4',
    `erDiagram
    subgraph id1 [title 1]
        CUSTOMER
    end`,
  ],
  [
    'relationships-involving-subgraphs',
    `erDiagram
    subgraph title1
        A1 ||--|| A2 : links
    end

    subgraph title2
        B1 ||--|| B2 : links
    end

    subgraph title3
        C1 ||--|| C2 : links
    end

    title1 ||--|| title2 : links
    title2 ||--|| title3 : links
    title2 ||--|| C2 : links`,
  ],
  [
    'direction-in-subgraphs',
    `erDiagram
    direction LR
    subgraph TOP
        direction TB
        subgraph B1
            direction RL
            I1 ||--|| F1 : links
        end
        subgraph B2
            direction BT
            I2 ||--|| F2 : links
        end
    end
    A ||--|| TOP : links
    TOP ||--|| B : links
    B1 ||--|| B2 : links`,
  ],
  [
    'styling-a-node',
    `erDiagram
    id1||--||id2 : label
    style id1 fill:#f9f,stroke:#333,stroke-width:4px
    style id2 fill:#bbf,stroke:#f66,stroke-width:2px,color:#fff,stroke-dasharray: 5 5`,
  ],
  [
    'classes',
    `erDiagram
    direction TB
    CAR:::someclass {
        string registrationNumber
        string make
        string model
    }
    PERSON:::someclass {
        string firstName
        string lastName
        int age
    }
    HOUSE:::someclass

    classDef someclass fill:#f96`,
  ],
  [
    'classes-2',
    `erDiagram
    CAR {
        string registrationNumber
        string make
        string model
    }
    PERSON {
        string firstName
        string lastName
        int age
    }
    PERSON:::foo ||--|| CAR : owns
    PERSON o{--|| HOUSE:::bar : has

    classDef foo stroke:#f00
    classDef bar stroke:#0f0
    classDef foobar stroke:#00f`,
  ],
  [
    'default-class',
    `erDiagram
    CAR {
        string registrationNumber
        string make
        string model
    }
    PERSON {
        string firstName
        string lastName
        int age
    }
    PERSON:::foo ||--|| CAR : owns
    PERSON o{--|| HOUSE:::bar : has

    classDef default fill:#f9f,stroke-width:4px
    classDef foo stroke:#f00
    classDef bar stroke:#0f0
    classDef foobar stroke:#00f`,
  ],
  [
    'layout',
    `---
title: Order example
config:
    layout: dagre
---
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
  ],
];

const example = (name: string): string => (EXAMPLES.find(([n]) => n === name) as [string, string])[1];
const read = (name: string) => parseEr(blankFrontMatter(example(name)));
describe('er: official examples', () => {
  for (const [name, src] of EXAMPLES) {
    it(`draws ${name}`, () => {
      expect(render(src)).toContain('data-theme="band"');
    });
  }

  it('draws every example for a terminal without an error', () => {
    for (const [, src] of EXAMPLES) expect('error' in renderText(src, 200)).toBe(false);
  });

  it('lays every example out without overlaps or lines through boxes', () => {
    for (const [name, src] of EXAMPLES) {
      const model = parseEr(blankFrontMatter(src));
      const laid = layout(model.graph, pixelRuler(), { legend: false });
      const bad = geometryViolations(laid);
      expect(bad, name).toEqual([]);
    }
  });
});

describe('er: reading', () => {
  it('reads the marks, the line style and the label of a relationship', () => {
    const { graph } = read('entity-relationship-diagrams');
    expect(graph.edges).toEqual([
      { from: 'CUSTOMER', to: 'ORDER', style: 'normal', startEnd: 'one', end: 'zero-many', label: 'places' },
      { from: 'ORDER', to: 'LINE-ITEM', style: 'normal', startEnd: 'one', end: 'one-many', label: 'contains' },
      { from: 'CUSTOMER', to: 'DELIVERY-ADDRESS', style: 'dotted', startEnd: 'one-many', end: 'one-many', label: 'uses' },
    ]);
  });

  it('takes the title of the front matter as the title of the model', () => {
    expect(parseEr(blankFrontMatter(example('entity-relationship-diagrams')), 'Order example').title).toBe('Order example');
  });

  it('reads attributes into a head and a body', () => {
    const { graph } = read('attributes');
    const car = graph.nodes.find((n) => n.id === 'CAR');
    expect(car?.compartments?.[0]?.lines).toEqual(['CAR']);
    expect(car?.compartments?.[1]?.lines).toEqual(['string\u00A0\u00A0registrationNumber', 'string\u00A0\u00A0make', 'string\u00A0\u00A0model']);
  });

  it('puts keys and the comment at the end of the row', () => {
    const { graph } = read('attribute-keys-and-comments');
    const person = graph.nodes.find((n) => n.id === 'PERSON')?.compartments?.[1]?.lines ?? [];
    const gap = '\u00A0\u00A0';
    expect(person[0]).toBe(['string', 'driversLicense'].join(gap) + gap + 'PK' + gap + '"The license #"');
    expect(person[3]).toBe(['string', 'phone'].join(gap) + gap + 'UK');
    const driver = graph.nodes.find((n) => n.id === 'NAMED-DRIVER')?.compartments?.[1]?.lines ?? [];
    expect(driver[0]).toContain('PK, FK');
  });

  it('reads the word forms of the marks and of the line', () => {
    const words = read('identification-2').graph.edges;
    expect(words[0]).toMatchObject({ from: 'CAR', to: 'NAMED-DRIVER', style: 'normal', startEnd: 'one', end: 'zero-many' });
    expect(words[1]).toMatchObject({ from: 'PERSON', to: 'NAMED-DRIVER', style: 'dotted', startEnd: 'zero-many', end: 'zero-many' });
    expect(read('attribute-keys-and-comments').graph.edges.at(-1)).toMatchObject({ from: 'MANUFACTURER', to: 'CAR', startEnd: 'one', end: 'zero-many', label: 'makes' });
  });

  it('reads both forms of every mark', () => {
    const g = parseEr('erDiagram\n A |o--o| B\n C o|..|o D\n E }|--|{ F\n G }o--o{ H').graph;
    expect(g.edges.map((e) => [e.startEnd, e.end])).toEqual([['zero-one', 'zero-one'], ['zero-one', 'zero-one'], ['one-many', 'one-many'], ['zero-many', 'zero-many']]);
    expect(g.edges[1]?.style).toBe('dotted');
  });

  it('reads aliases: the shown name differs from the name used in relationships', () => {
    const { graph } = read('entity-name-aliases');
    expect(graph.nodes.map((n) => [n.id, n.title])).toEqual([['p', 'Person'], ['a', 'Customer Account']]);
    expect(graph.edges[0]).toMatchObject({ from: 'p', to: 'a', startEnd: 'one', end: 'zero-one', label: 'has' });
  });

  it('reads quoted entity names and leaves out the marks of markdown', () => {
    expect(read('unicode-text').graph.nodes[0]?.title).toBe('This \u2764 Unicode');
    expect(read('markdown-formatting').graph.nodes[0]?.title).toBe('This is Markdown');
  });

  it('reads a bare entity and an entity with a class, and ignores styling', () => {
    const { graph } = read('classes');
    expect(graph.nodes.map((n) => n.id)).toEqual(['CAR', 'PERSON', 'HOUSE']);
    expect(graph.ignored).toEqual(['classDef someclass fill:#f96']);
    expect(read('styling-a-node').graph.ignored?.length).toBe(2);
  });

  it('reads the direction, including the reversed ones inside a subgraph', () => {
    expect(read('direction').graph.direction).toBe('TD');
    expect(read('direction-2').graph.direction).toBe('LR');
    const { graph } = read('direction-in-subgraphs');
    expect(graph.direction).toBe('LR');
    const byId = new Map((graph.clusters ?? []).map((c) => [c.id, c]));
    expect(byId.get('TOP')).toMatchObject({ direction: 'TD' });
    expect(byId.get('B1')).toMatchObject({ parent: 'TOP', direction: 'LR', mirror: 'RL' });
    expect(byId.get('B2')).toMatchObject({ parent: 'TOP', direction: 'TD', mirror: 'BT' });
  });

  it('reads subgraphs in the three forms of a name, nested, with edges that end at a subgraph', () => {
    expect(read('subgraphs-2').graph.clusters).toEqual([{ id: 'title1', label: 'title1' }]);
    expect(read('subgraphs-3').graph.clusters).toEqual([{ id: 'Customer Domain', label: 'Customer Domain' }]);
    expect(read('subgraphs-4').graph.clusters).toEqual([{ id: 'id1', label: 'title 1' }]);
    const nested = read('subgraphs').graph;
    expect(nested.clusters?.find((c) => c.id === 'title3')?.parent).toBe('title2');
    expect(nested.nodes.find((n) => n.id === 'PERSON')?.cluster).toBe('title3');
    const links = read('relationships-involving-subgraphs').graph;
    expect(links.edges.slice(-3).map((e) => [e.from, e.to])).toEqual([['title1', 'title2'], ['title2', 'title3'], ['title2', 'C2']]);
    expect(links.nodes.map((n) => n.id)).not.toContain('title1');
  });
});

describe('er: layout', () => {
  it('keeps entities in the order the marks read: one side on the left, many on the right', () => {
    const l = layout(read('entity-relationship-diagrams-2').graph, pixelRuler(), { legend: false });
    const x = (id: string): number => l.nodes.find((n) => n.id === id)?.x ?? NaN;
    expect(x('CUSTOMER')).toBeLessThan(x('ORDER'));
    expect(x('ORDER')).toBeLessThan(x('LINE-ITEM'));
  });

  it('draws a dotted line for a non-identifying relationship', () => {
    const svg = render(example('identification'));
    expect(svg).toMatch(/ursula-edge[^"]*dotted/);
  });

  it('keeps every text inside the drawing', () => {
    for (const [, src] of EXAMPLES) {
      const l = layout(parseEr(blankFrontMatter(src)).graph, pixelRuler(), { legend: false });
      for (const n of l.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x + n.w).toBeLessThanOrEqual(l.width);
      }
    }
  });

  it('draws one box with a head for an entity without attributes', () => {
    const l = layout(read('subgraphs-2').graph, pixelRuler(), { legend: false });
    expect(l.nodes[0]?.compartments?.length).toBe(2);
  });

  it('draws the head of every entity in a terminal', () => {
    const r = renderText(example('entity-relationship-diagrams-2'), 120);
    expect('lines' in r && r.lines.join('\n')).toContain('CUSTOMER');
  });
});

describe('er: errors', () => {
  it('names the line of a row it cannot read', () => {
    const bad = 'erDiagram\n  A ||--o{ B : has\n  A {\n    oops\n  }';
    try {
      render(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      expect((e as UrsulaError).line).toBe(4);
    }
  });

  it('rejects a statement that is no entity, relationship or block', () => {
    expect(() => render('erDiagram\n  A ||==o{ B')).toThrow(UrsulaError);
  });

  it('rejects a subgraph that is never closed, at the line it opens', () => {
    try {
      render('erDiagram\n  subgraph x\n    A');
      expect.unreachable();
    } catch (e) {
      expect((e as UrsulaError).line).toBe(2);
    }
  });
});

describe('a relation written from the side of many', () => {
  it('is kept from the side of one, with the ends swapped', () => {
    const g = parseEr('erDiagram\n  PERSON o{--|| HOUSE : has\n  PERSON ||--|| CAR : owns').graph;
    expect(g.edges[0]).toMatchObject({ from: 'HOUSE', to: 'PERSON', startEnd: 'one', end: 'zero-many', label: 'has' });
    expect(g.edges[1]).toMatchObject({ from: 'PERSON', to: 'CAR', startEnd: 'one', end: 'one' });
  });
});
