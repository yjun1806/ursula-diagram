import type { Compartment } from '../types.ts';
import { COMPARTMENT_LINE, compartmentHeights, CYLINDER_CAP, hasCompartments } from '../layout/records.ts';
import { boxLength } from './ports.ts';
import type { Frame } from './route.ts';
import type { Ladder } from './model.ts';

/**
 * Boxes divided into compartments that stand in one row of the drawing (the same layer, or the same place along the order axis when layers are columns) are drawn as high
 * as the highest of them, compartment by compartment: each compartment takes the lines of the fullest one, so the
 * dividing rules and the bottoms line up. A rank whose boxes would not all fit their slots at that height is left as it is.
 * Returns the frame with the new heights, and the compartments padded with the blank lines that fill them.
 */
export function evenRecords(f: Frame, l: Ladder, start: readonly number[]): Frame {
  if (f.ruler.uniform || f.ruler.terminal === true) return f;
  const ranks = new Map<number, number[]>();
  f.graph.nodes.forEach((n, i) => {
    if (i >= l.realCount || n.box !== undefined || !hasCompartments(n)) return;
    const key = f.td ? Math.floor((start[i] ?? 0) / 2) : (l.nodes[i]?.layer ?? 0);
    ranks.set(key, [...(ranks.get(key) ?? []), i]);
  });
  const layerExt = [...f.layerExt];
  const bodyLen = [...(f.bodyLen ?? f.graph.nodes.map(() => undefined))];
  const compartments = new Map<number, Compartment[]>();
  for (const members of ranks.values()) {
    if (members.length < 2) continue;
    const cells = (i: number): readonly Compartment[] => f.graph.nodes[i]?.compartments ?? [];
    const heights = members.map((i) => compartmentHeights(cells(i), f.ruler));
    const tallest = Math.max(...heights.map((h) => h.length));
    const row = Array.from({ length: tallest }, (_, k) => Math.max(...heights.map((h) => h[k] ?? 0)));
    const caps = Math.max(...members.map((i) => (f.graph.nodes[i]?.shape === 'cylinder' ? 2 * CYLINDER_CAP : 0)));
    const target = row.reduce((a, b) => a + b, 0) + caps;
    if (f.td && members.some((i) => target > boxLength(l.nodes[i]?.units ?? 2, f.unit, f.gap))) continue;
    members.forEach((i, m) => {
      const own = heights[m] ?? [];
      compartments.set(i, cells(i).map((c, k) => (own[k] === (row[k] ?? 0) ? c : { ...c, lines: [...c.lines, ...Array.from({ length: Math.round(((row[k] ?? 0) - (own[k] ?? 0)) / COMPARTMENT_LINE) }, () => '')] })));
      if (f.td) bodyLen[i] = target;
      else layerExt[i] = target;
    });
  }
  return compartments.size === 0 ? f : { ...f, layerExt, bodyLen, compartments };
}
