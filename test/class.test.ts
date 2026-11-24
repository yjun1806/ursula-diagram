// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { cellRuler, layout, pixelRuler, render, renderText, THEMES, UrsulaError } from '../src/index.ts';
import { genericsOf, parseClass } from '../src/class/parse.ts';
import type { Layout, LayoutNode } from '../src/index.ts';

const ANIMAL = `---
title: Animal example
---
classDiagram
    note "From Duck till Zebra"
    Animal <|-- Duck
    note for Duck "can fly<br>can swim"
    Animal <|-- Fish
    Animal : +int age
    Animal: +isMammal()
    class Duck{
        +String beakColor
        +swim()
    }
    class Fish{
        -int sizeInFeet
        -canEat()
    }`;

const DEFAULTS = `classDiagram
  class Customer {
    +String name
  }
  class Payment {
    <<interface>>
    +authorise() bool
  }
  Customer "1" --> "*" Order : places
  Order "1" *-- "*" LineItem : contains
  Order --> Payment : settled by`;

const KINDS = `classDiagram
classA <|-- classB
classC *-- classD
classE o-- classF
classG <-- classH
classI -- classJ
classK <.. classL
classM <|.. classN
classO .. classP
classQ --|> classR
classS ..|> classT
Animal <|--|> Zebra`;

const NAMESPACES = `classDiagram
    namespace Platform {
        namespace Auth {
            class UserService {
                +login()
            }
        }
        class Gateway {
            +route()
        }
    }
    namespace Company.Engineering.Backend {
        class Developer
    }
    Gateway --> UserService : delegates`;

const GENERIC = `classDiagram
class Square~Shape~{
    int id
    List~int~ position
    getDistanceMatrix() List~List~int~~
}
Square : -List~string~ messages`;

const IGNORED = `classDiagram
class Shape
link Shape "https://example.com" "tip"
click Shape href "https://example.com"
callback Shape "fn"
style Shape fill:#f9f
classDef x fill:#f96
class Animal:::x
cssClass "Shape" x`;

const edge = (g: ReturnType<typeof parseClass>, from: string, to: string) => g.edges.find((e) => e.from === from && e.to === to);

describe('class diagram: reading', () => {
  it('reads classes, members and notes into three bands', () => {
    const g = parseClass(ANIMAL.replace(/^---[\s\S]*?---\n/u, ''));
    const duck = g.nodes.find((n) => n.id === 'Duck');
    expect(duck?.compartments?.map((c) => c.lines)).toEqual([['Duck'], ['+String beakColor'], ['+swim()']]);
    const animal = g.nodes.find((n) => n.id === 'Animal');
    expect(animal?.compartments?.map((c) => c.lines)).toEqual([['Animal'], ['+int age'], ['+isMammal()']]);
    const notes = g.nodes.filter((n) => n.shape === 'note');
    expect(notes.map((n) => [n.title, ...n.lines])).toEqual([['From Duck till Zebra'], ['can fly', 'can swim']]);
    expect(g.edges.find((e) => e.to === 'Duck' && e.style === 'dotted')?.from).toBe(notes[1]?.id);
  });

  it('maps the eight relations and both-sided ends', () => {
    const g = parseClass(KINDS);
    expect(edge(g, 'classA', 'classB')).toMatchObject({ startEnd: 'triangle-open', end: 'none', style: 'normal' });
    expect(edge(g, 'classC', 'classD')).toMatchObject({ startEnd: 'diamond-filled' });
    expect(edge(g, 'classE', 'classF')).toMatchObject({ startEnd: 'diamond-open' });
    expect(edge(g, 'classG', 'classH')).toMatchObject({ startEnd: 'arrow-open' });
    expect(edge(g, 'classI', 'classJ')).toMatchObject({ end: 'none' });
    expect(edge(g, 'classI', 'classJ')?.startEnd).toBeUndefined();
    expect(edge(g, 'classK', 'classL')).toMatchObject({ startEnd: 'arrow-open', style: 'dotted' });
    expect(edge(g, 'classM', 'classN')).toMatchObject({ startEnd: 'triangle-open', style: 'dotted' });
    expect(edge(g, 'classO', 'classP')).toMatchObject({ end: 'none', style: 'dotted' });
    // Written from the child: kept as the line from the parent.
    expect(edge(g, 'classR', 'classQ')).toMatchObject({ startEnd: 'triangle-open', end: 'none' });
    expect(edge(g, 'classT', 'classS')).toMatchObject({ startEnd: 'triangle-open', end: 'none', style: 'dotted' });
    expect(edge(g, 'Animal', 'Zebra')).toMatchObject({ startEnd: 'triangle-open', end: 'triangle-open' });
  });

  it('reads multiplicities, labels and annotations', () => {
    const g = parseClass(DEFAULTS);
    expect(edge(g, 'Customer', 'Order')).toMatchObject({ startLabel: '1', endLabel: '*', label: 'places', end: 'arrow-open' });
    expect(edge(g, 'Order', 'LineItem')).toMatchObject({ startEnd: 'diamond-filled', label: 'contains' });
    expect(g.nodes.find((n) => n.id === 'Payment')?.compartments?.[0]?.lines).toEqual(['«interface»', 'Payment']);
    expect(g.nodes.find((n) => n.id === 'Order')?.compartments).toHaveLength(3);
  });

  it('writes type arguments with angle brackets, nested too', () => {
    expect(genericsOf('List~List~int~~')).toBe('List<List<int>>');
    expect(genericsOf('setPoints(List~int~ points)')).toBe('setPoints(List<int> points)');
    const sq = parseClass(GENERIC).nodes[0];
    expect(sq?.id).toBe('Square');
    expect(sq?.compartments?.[0]?.lines).toEqual(['Square<Shape>']);
    expect(sq?.compartments?.[1]?.lines).toEqual(['int id', 'List<int> position', '-List<string> messages']);
    expect(sq?.compartments?.[2]?.lines).toEqual(['getDistanceMatrix() List<List<int>>']);
  });

  it('nests namespaces and flattens them in compact mode', () => {
    const deep = parseClass(NAMESPACES);
    expect(deep.clusters?.map((c) => [c.id, c.parent])).toEqual([
      ['Platform', undefined],
      ['Platform.Auth', 'Platform'],
      ['Company', undefined],
      ['Company.Engineering', 'Company'],
      ['Company.Engineering.Backend', 'Company.Engineering'],
    ]);
    expect(deep.nodes.find((n) => n.id === 'UserService')?.cluster).toBe('Platform.Auth');
    const flat = parseClass(NAMESPACES, { hierarchicalNamespaces: false, hideEmptyMembersBox: false });
    expect(flat.clusters?.map((c) => c.label)).toEqual(['Platform', 'Auth', 'Company.Engineering.Backend']);
  });

  it('hides empty bands when asked', () => {
    const g = parseClass('classDiagram\nclass Duck', { hierarchicalNamespaces: true, hideEmptyMembersBox: true });
    expect(g.nodes[0]?.compartments).toHaveLength(1);
    const svg = render('---\nconfig:\n  class:\n    hideEmptyMembersBox: true\n---\nclassDiagram\n  class Duck');
    expect(svg).toContain('Duck');
  });

  it('reads and ignores links, callbacks and styles', () => {
    const g = parseClass(IGNORED);
    expect(g.nodes.map((n) => n.id)).toEqual(['Shape', 'Animal']);
    expect(g.ignored).toHaveLength(6);
  });

  it('turns direction into a reading direction and a mirror', () => {
    expect(parseClass('classDiagram\ndirection RL\nclass A')).toMatchObject({ direction: 'LR', mirror: 'RL' });
    expect(parseClass('classDiagram\ndirection LR\nclass A')).toMatchObject({ direction: 'LR' });
  });

  it('reports an unknown statement with its line', () => {
    try {
      parseClass('classDiagram\nclass A\nthis is nonsense');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      expect((e as UrsulaError).line).toBe(3);
    }
  });

  it('reports a class body that is never closed', () => {
    expect(() => parseClass('classDiagram\nclass A {\n  +x')).toThrow(/never closed/u);
  });
});

const SOURCES: Record<string, string> = { ANIMAL, DEFAULTS, KINDS, NAMESPACES, GENERIC, IGNORED };

describe('class diagram: drawing', () => {
  it.each(Object.entries(SOURCES))('draws %s in three themes', (_name, src) => {
    for (const theme of THEMES) expect(render(src, { theme })).toContain(`data-theme="${theme}"`);
  });

  it('keeps text inside the drawing and out of other text', () => {
    for (const src of Object.values(SOURCES)) {
      const l: Layout = layout(parseClass(src.replace(/^---[\s\S]*?---\n/u, '')), pixelRuler(), { legend: false });
      for (const n of l.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x + n.w).toBeLessThanOrEqual(l.width);
        expect(n.y + n.h).toBeLessThanOrEqual(l.height);
      }
      const box = (n: LayoutNode) => n;
      for (const a of l.nodes) for (const b of l.nodes) {
        if (a.id >= b.id) continue;
        const apart = box(a).x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('widens a class box to its longest member', () => {
    const l = layout(parseClass(GENERIC), pixelRuler(), { legend: false });
    const text = pixelRuler().textWidth('getDistanceMatrix() List<List<int>>', 'line');
    expect(l.nodes[0]?.w).toBeGreaterThanOrEqual(text + 32);
  });

  it('draws as text', () => {
    const r = renderText(DEFAULTS, 100);
    expect('lines' in r).toBe(true);
    if ('lines' in r) expect(r.lines.join('\n')).toContain('Customer');
    expect(cellRuler().terminal).toBe(true);
  });
});

describe('class diagram: interfaces on stubs and tags', () => {
  it('reads `()` as a stub of the other class named after the interface, and adds no box for it', () => {
    const g = parseClass('classDiagram\n  class Class01\n  Class01 --() bar\n  foo ()-- Class01');
    expect(g.nodes.map((n) => n.id)).toEqual(['Class01']);
    expect(g.edges).toEqual([
      { from: 'Class01', to: 'Class01', style: 'normal', end: 'lollipop', endLabel: 'bar' },
      { from: 'Class01', to: 'Class01', style: 'normal', end: 'lollipop', endLabel: 'foo' },
    ]);
  });

  it('puts the annotation in the head as a tag line over the name', () => {
    const head = parseClass('classDiagram\n  class Payment {\n    <<interface>>\n    +pay()\n  }').nodes[0]?.compartments?.[0];
    expect(head?.lines).toEqual(['«interface»', 'Payment']);
    expect(head?.lineEmphasis).toEqual(['tag', 'title']);
  });
});

describe('a parent written at the end of a line', () => {
  it('is read as the line from the parent, with the counts on the ends they were written at', () => {
    const g = parseClass('classDiagram\n  Duck "1" --|> "0..1" Animal : is a\n  Impl ..|> Api');
    expect(g.edges[0]).toMatchObject({ from: 'Animal', to: 'Duck', startEnd: 'triangle-open', end: 'none', startLabel: '0..1', endLabel: '1', label: 'is a' });
    expect(g.edges[1]).toMatchObject({ from: 'Api', to: 'Impl', startEnd: 'triangle-open', end: 'none', style: 'dotted' });
  });

  it('stands above its child', () => {
    const l = layout(parseClass('classDiagram\n  Duck --|> Animal\n  Fish --|> Animal'), pixelRuler());
    const y = (id: string): number => l.nodes.find((n) => n.id === id)?.y ?? NaN;
    expect(y('Animal')).toBeLessThan(y('Duck'));
    expect(y('Animal')).toBeLessThan(y('Fish'));
  });
});
