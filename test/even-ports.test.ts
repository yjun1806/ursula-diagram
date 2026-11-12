import { describe, expect, it } from 'vitest';
import { layout, parse, pixelRuler } from '../src/index.ts';
import { layeredRuler } from '../src/layered/index.ts';
import { evenOffsets, portOffsets, portRoom, sideOffsets } from '../src/layered/ports.ts';
import { endpointViolations, geometryViolations } from './helpers.ts';

const draw = (src: string) => {
  const g = parse(src);
  return { g, l: layout(g, pixelRuler(), { engine: 'layered', composition: 'lanes' }) };
};

const lanes = (targets: string[]): string =>
  ['swimlane-beta TD', 'subgraph one[One]', 'a[Alpha]', 'end', 'subgraph two[Two]', ...targets.map((t) => `${t}[Node ${t}]`), 'end', ...targets.map((t) => `a --> ${t}`)].join('\n');

describe('port lattices of a box side', () => {
  it('holds one port on whole steps and three on the dense lattice of a 48px side with a 24px step', () => {
    expect(portOffsets(48, 24)).toEqual([24]);
    expect(evenOffsets(48, 24)).toEqual([12, 24, 36]);
    expect(portRoom(48, 24, false)).toBe(3);
    expect(portRoom(48, 24, true)).toBe(1);
  });

  it('keeps every dense port 12px from the ends: a 40px side has only its centre', () => {
    expect(evenOffsets(40, 24)).toEqual([20]);
    expect(evenOffsets(72, 24)).toEqual([12, 24, 36, 48, 60]);
  });

  it('takes whole steps when they hold the ports, the dense lattice when only that does, whole steps when neither does', () => {
    expect(sideOffsets(48, 24, 1, false)).toEqual([24]);
    expect(sideOffsets(48, 24, 2, false)).toEqual([12, 24, 36]);
    expect(sideOffsets(48, 24, 3, false)).toEqual([12, 24, 36]);
    expect(sideOffsets(48, 24, 4, false)).toEqual([24]);
    expect(sideOffsets(144, 24, 3, false)).toEqual(portOffsets(144, 24));
    expect(portOffsets(144, 24)).toHaveLength(5);
  });

  it('never takes the dense lattice in a terminal', () => {
    expect(sideOffsets(48, 24, 2, true)).toEqual([24]);
  });
});

describe('a box with two edges on one side', () => {
  it('keeps the height of a box with one edge when two edges leave it', () => {
    const one = draw(lanes(['b'])).l.nodes.find((n) => n.id === 'a');
    const { g, l } = draw(lanes(['b', 'c']));
    const a = l.nodes.find((n) => n.id === 'a');
    expect(one?.h).toBe(48);
    expect(a?.h).toBe(48);
    expect(geometryViolations(l)).toEqual([]);
    expect(endpointViolations(l, layeredRuler(pixelRuler()), g)).toEqual([]);
  });

  it('puts the edges on the ports in the order of the boxes they lead to', () => {
    const { l } = draw(lanes(['b', 'c']));
    const y = (to: string): number => l.edges.find((e) => e.to === to)?.points[0]?.y ?? NaN;
    const target = (id: string): number => l.nodes.find((n) => n.id === id)?.y ?? NaN;
    expect(y('b') < y('c')).toBe(target('b') < target('c'));
  });

  it('grows the box with four edges on one side, as the three ports of a 48px side do not hold four', () => {
    const { g, l } = draw(lanes(['b', 'c', 'd', 'e']));
    const a = l.nodes.find((n) => n.id === 'a');
    expect(a?.h).toBeGreaterThan(48);
    expect(endpointViolations(l, layeredRuler(pixelRuler()), g)).toEqual([]);
  });
});
