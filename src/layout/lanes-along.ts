import type { Ruler } from '../metrics.ts';
import type { LayoutLane } from '../types.ts';
import type { Geo, Skeleton } from './place.ts';
import { edgeNear, gridUp } from './place.ts';

/**
 * Lanes that follow one another along the flow axis. The nodes live in one lane of the slot grid;
 * this describes which rank columns belong to which lane so that bands can be drawn around them.
 */
export interface AlongSpec {
  /** Lanes in flow order. */
  lanes: Array<{ id: string; label: string }>;
  /** First rank column of every lane. */
  starts: number[];
  /** Lane of every node. */
  laneOf: Map<string, string>;
}

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

const floorGrid = (ruler: Ruler, v: number): number => Math.floor(v / ruler.grid + 1e-9) * ruler.grid;

/** Space a lane label takes at the start of its band. */
function labelRegion(along: AlongSpec, ruler: Ruler): number {
  return along.lanes.some((l) => l.label !== '') ? gridUp(ruler, 2 * ruler.laneLabelGap + ruler.lineHeight('lane')) : 0;
}

/** Widens the channels where bands meet and keeps tracks clear of the lane labels. */
export function shapeAlong(sk: Skeleton, ruler: Ruler, along: AlongSpec): Skeleton {
  const region = labelRegion(along, ruler);
  const baseWf = [...sk.baseWf];
  const baseWc = [...sk.baseWc];
  const inset = new Map<string, number>();
  const bump = (a: number, v: number): void => {
    baseWf[a] = Math.max(baseWf[a] ?? 0, gridUp(ruler, v));
  };
  const pad = ruler.lanePad;
  const gap = sk.laneGap;
  if (!sk.td) {
    for (const a of along.starts.slice(1)) bump(a, 2 * pad + gap);
    if (region > 0) {
      baseWc[0] = Math.max(baseWc[0] ?? 0, region);
      inset.set('c0', region);
    }
  } else {
    along.starts.forEach((a, k) => {
      const ins = region === 0 ? 0 : k === 0 ? region : pad + gap + region;
      if (ins > 0) inset.set(`f${a}`, ins);
      bump(a, ins + pad);
    });
  }
  return { ...sk, baseWf, baseWc, inset };
}

/** Rectangles of the lane bands, with the label box of each. */
export function alongBands(sk: Skeleton, geo: Geo, ruler: Ruler, along: AlongSpec): LayoutLane[] {
  const flowEnd = geo.totalF - sk.margin;
  const crossExt = geo.totalC - 2 * sk.margin;
  // Where one band ends and the next begins, by lane.
  const ends: number[] = [];
  const begins: number[] = [sk.margin];
  along.starts.slice(1).forEach((a) => {
    const at = geo.fStart[a] ?? 0;
    const end = at + (sk.td ? ruler.lanePad : floorGrid(ruler, ((geo.wf[a] ?? 0) - sk.laneGap) / 2));
    ends.push(end);
    begins.push(end + sk.laneGap);
  });
  ends.push(flowEnd);
  return along.lanes.map((lane, k) => {
    const f0 = begins[k] ?? sk.margin;
    const ext = (ends[k] ?? flowEnd) - f0;
    const labelW = ruler.textWidth(lane.label, 'lane');
    const labelH = ruler.lineHeight('lane');
    if (sk.td) {
      return {
        id: lane.id,
        label: lane.label,
        x: tidy(sk.margin),
        y: tidy(f0),
        w: tidy(crossExt),
        h: tidy(ext),
        labelBox: { x: tidy(sk.margin + ruler.laneLabelGap), y: tidy(f0 + ruler.laneLabelGap), w: labelW, h: labelH },
      };
    }
    return {
      id: lane.id,
      label: lane.label,
      x: tidy(f0),
      y: tidy(sk.margin),
      w: tidy(ext),
      h: tidy(crossExt),
      labelBox: {
        x: tidy(edgeNear(ruler, f0 + (ext - labelW) / 2)),
        y: tidy(sk.margin + ruler.laneLabelGap),
        w: labelW,
        h: labelH,
      },
    };
  });
}
