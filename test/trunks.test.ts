import { describe, expect, it } from 'vitest';
import { cellRuler, render } from '../src/index.ts';
import { selectFrontEnd } from '../src/registry.ts';
import type { Layout, LayoutEdge } from '../src/index.ts';

const CLASSES = `classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal <|-- Zebra
    class Duck{
      +swim()
      +quack()
    }
    class Fish{
      -canEat()
    }
    class Zebra{
      +run()
    }`;

const REQUIREMENTS = `requirementDiagram
requirement a {
  id: 1
  text: top
  risk: high
  verifymethod: test
}
requirement b {
  id: 1.1
  text: first
  risk: low
  verifymethod: test
}
requirement c {
  id: 1.2
  text: second
  risk: low
  verifymethod: test
}
requirement d {
  id: 1.3
  text: third
  risk: low
  verifymethod: test
}
a - contains -> b
a - contains -> c
a - contains -> d
`;

const ACTOR = `usecase-beta
direction TD
actor User("User")
Login("Log in")
ViewProfile("View profile")
Logout("Log out")
User --> Login
User --> ViewProfile
User --> Logout
`;

function drawn(src: string, mode: 'svg' | 'text' = 'svg'): Layout {
  const out = selectFrontEnd(src).json(src, mode, {}) as Layout | { layout: Layout };
  return 'layout' in out ? out.layout : out;
}

const trunked = (l: Layout): LayoutEdge[] => l.edges.filter((e) => e.trunk !== undefined);

describe('trunks of same-kind relations at one box', () => {
  it('draws three inheritance lines out of one point of the parent, with one triangle', () => {
    const l = drawn(CLASSES);
    const edges = trunked(l);
    expect(edges).toHaveLength(3);
    expect(new Set(edges.map((e) => e.trunk?.id)).size).toBe(1);
    const lead = edges.filter((e) => e.trunk?.lead);
    expect(lead).toHaveLength(1);
    expect(lead[0]?.startEnd).toBe('triangle-open');
    expect(edges.filter((e) => !e.trunk?.lead).every((e) => e.startEnd === 'none')).toBe(true);
    const animal = l.nodes.find((n) => n.id === 'Animal');
    const start = lead[0]?.points[0];
    expect(start?.y).toBeCloseTo((animal?.y ?? 0) + (animal?.h ?? 0));
    // Every branch splits off at the same height, half way between the box and the nearest child.
    const junction = new Set(edges.flatMap((e) => e.points.flatMap((p, i) => (e.points[i + 1]?.y === p.y && e.points[i + 1]?.x !== p.x ? [p.y] : []))));
    expect(junction.size).toBe(1);
  });

  it('draws the triangle once in the svg', () => {
    const svg = render(CLASSES);
    expect(svg.match(/marker-start="url\(#ursula-end-triangle-open\)"/g)).toHaveLength(1);
  });

  it('does not draw a trunk for a single line or for lines on other faces', () => {
    expect(trunked(drawn('classDiagram\n  Animal <|-- Duck'))).toHaveLength(0);
    expect(trunked(drawn('classDiagram\n  A --> B\n  A --> C'))).toHaveLength(0);
  });

  it('leaves a terminal drawing as it was', () => {
    expect(trunked(drawn(CLASSES, 'text'))).toHaveLength(0);
    expect(cellRuler().terminal).toBe(true);
  });

  it('draws containment lines out of one container with one ring and a label on each branch', () => {
    const l = drawn(REQUIREMENTS);
    const edges = trunked(l);
    expect(edges).toHaveLength(3);
    expect(edges.filter((e) => e.startEnd === 'circle-plus')).toHaveLength(1);
    for (const e of edges) {
      const label = e.label;
      const last = e.points.at(-1);
      expect(label).toBeDefined();
      // The label stands on the vertical piece that runs into the contained box.
      expect(Math.abs((label?.x ?? 0) + (label?.w ?? 0) / 2 - (last?.x ?? 0))).toBeLessThan(1);
    }
  });

  it('splits the lines of an actor at a dot', () => {
    const l = drawn(ACTOR);
    const edges = trunked(l);
    expect(edges).toHaveLength(3);
    const dots = edges.flatMap((e) => (e.trunk?.dot === undefined ? [] : [e.trunk.dot]));
    expect(dots).toHaveLength(1);
    expect(render(ACTOR).match(/class="ursula-end-dot"/g)).toHaveLength(1);
  });

  it('does not run a branch through a box', () => {
    const l = drawn(CLASSES);
    for (const e of trunked(l))
      for (const n of l.nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        for (let i = 0; i + 1 < e.points.length; i++) {
          const [a, b] = [e.points[i], e.points[i + 1]];
          if (!a || !b) continue;
          const inside = Math.max(a.x, b.x) > n.x && Math.min(a.x, b.x) < n.x + n.w && Math.max(a.y, b.y) > n.y && Math.min(a.y, b.y) < n.y + n.h;
          expect(inside).toBe(false);
        }
      }
  });
});
