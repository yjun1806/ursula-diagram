import type { Ruler } from '../metrics.ts';
import type { Compartment, NodeShape } from '../types.ts';

/** Pixels: height of one text line of a compartment, and the room a head and a body add around their lines. */
export const COMPARTMENT_LINE = 20;
export const HEAD_PAD = 20;
export const BODY_PAD = 16;
/** Pixels: extra room between the pill of a face and the line under it, and the room the pill takes around the text of its kind. */
export const FACE_PILL_GAP = 4;
export const FACE_PILL_PAD = 16;
/** Pixels: height of the pill and of the name of a face, of each line under the name, and the room a face adds around its lines in all (a cylinder's two caps come on top of it). */
export const FACE_HEAD_LINE = 20;
export const FACE_TEXT_LINE = 16;
export const FACE_PAD = 24;

/** Height of each line of a face: the pill and the name, then the lines under it. */
export const faceLineHeights = (lines: number): number[] => Array.from({ length: lines }, (_, k) => (k < 2 ? FACE_HEAD_LINE : FACE_TEXT_LINE));
/** Pixels: room a compartment box adds around its widest line, and its least width. */
export const COMPARTMENT_SIDE = 32;
export const COMPARTMENT_MIN_W = 120;
/** Pixels: distance from the left edge of a box to the text of a left-aligned compartment. */
export const COMPARTMENT_INSET = 16;
/** Distance between two columns of a band: in pixels, and in terminal cells. */
export const COLUMN_GAP = 16;
export const COLUMN_GAP_CELLS = 2;
/** Pixels: least width of a rounded box, so that a one-letter name is not drawn as a circle. */
export const ROUND_MIN_W = 80;

/** Pixels: height of each end cap of a cylinder (half the height of the ellipse that closes it). */
export const CYLINDER_CAP = 6;

/** Pixels: diameter of the start dot, and of the ring and the dot of the end mark. */
export const START_DOT = 16;
export const END_RING = 20;
export const END_CORE = 10;
/** Pixels: thickness and length of the bar that forks or joins a flow. */
export const BAR_THICK = 8;
export const BAR_LONG = 64;
/** Pixels: how far the folded corner of a note reaches in. */
export const NOTE_FOLD = 8;
/** Pixels: height of an ellipse, and what it adds around its text width. */
export const ELLIPSE_H = 48;
export const ELLIPSE_PAD = 48;
/** Pixels: size of the figure of an actor, the head diameter, and the distance of the name below it. */
export const ACTOR_W = 24;
export const ACTOR_H = 48;
export const ACTOR_HEAD = 16;
export const ACTOR_NAME_GAP = 16;
/** Pixels: height reserved for the name under an actor. */
export const ACTOR_NAME_H = 14;

export interface Body {
  w: number;
  h: number;
}

interface WithCompartments {
  compartments?: readonly Compartment[] | undefined;
}

export const hasCompartments = (n: WithCompartments): n is { compartments: readonly Compartment[] } => (n.compartments?.length ?? 0) > 0;

/** How a line of a band is drawn: its own entry, else the band's, else the head is a title and the others are bodies. */
export const lineEmphasis = (c: Compartment, line: number, band: number): 'title' | 'tag' | 'body' => c.lineEmphasis?.[line] ?? c.emphasis ?? (band === 0 ? 'title' : 'body');

/** Width of the text of one cell or line, in the ruler's unit. */
const cellWidth = (text: string, emphasis: 'title' | 'tag' | 'body', ruler: Ruler): number => ruler.textWidth(text, emphasis === 'title' ? 'title' : 'line');

/**
 * The width of each column of a band that has `columns`: the widest cell of the column, and 0 for a column with no text.
 * A band without `columns` has none.
 */
export function columnWidths(c: Compartment, ruler: Ruler): number[] {
  const rows = c.columns ?? [];
  const count = Math.max(0, ...rows.map((r) => r.length));
  return Array.from({ length: count }, (_, k) => Math.max(0, ...rows.map((r, i) => (r[k] === undefined || r[k] === '' ? 0 : cellWidth(r[k] as string, lineEmphasis(c, i, 1), ruler)))));
}

/** Where each column of a band starts, from the left edge of its text; a column with no text takes no room and no gap. */
export function columnStarts(c: Compartment, ruler: Ruler): number[] {
  const gap = ruler.terminal === true ? COLUMN_GAP_CELLS : COLUMN_GAP;
  let at = 0;
  return columnWidths(c, ruler).map((w) => {
    const start = at;
    if (w > 0) at += w + gap;
    return start;
  });
}

/** Width of the text of a band: its columns side by side, or its widest line. */
function widest(c: Compartment, i: number, ruler: Ruler): number {
  if (c.columns !== undefined) {
    const widths = columnWidths(c, ruler).filter((w) => w > 0);
    return widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * (ruler.terminal === true ? COLUMN_GAP_CELLS : COLUMN_GAP);
  }
  return Math.max(0, ...c.lines.map((line, k) => cellWidth(line, lineEmphasis(c, k, i), ruler)));
}

/** Height of every compartment of a box; a terminal box gives each at least one row. */
export function compartmentHeights(compartments: readonly Compartment[], ruler: Ruler): number[] {
  if (ruler.terminal === true) return compartments.map((c) => Math.max(1, c.lines.length));
  return compartments.map((c, i) => (c.face === true ? faceLineHeights(c.lines.length).reduce((a, b) => a + b, 0) + FACE_PILL_GAP + FACE_PAD : i === 0 ? c.lines.length * COMPARTMENT_LINE + HEAD_PAD : c.lines.length === 0 ? BODY_PAD : c.lines.length * COMPARTMENT_LINE + BODY_PAD));
}

/** Width of a box divided into compartments. A terminal box also has a column of border on each side. */
export function recordWidth(compartments: readonly Compartment[], ruler: Ruler): number {
  const text = Math.max(0, ...compartments.map((c, i) => widest(c, i, ruler)));
  if (ruler.terminal === true) return text + 2 * ruler.nodePadX + 2 * ruler.nodeBorder;
  return Math.max(COMPARTMENT_MIN_W, Math.ceil((text + COMPARTMENT_SIDE) / 4 - 1e-9) * 4);
}

/** Height of a box divided into compartments; a terminal box has a border row on each side and a rule row between two compartments. */
export function recordHeight(compartments: readonly Compartment[], ruler: Ruler): number {
  const sum = compartmentHeights(compartments, ruler).reduce((a, b) => a + b, 0);
  return ruler.terminal === true ? sum + compartments.length - 1 + 2 * ruler.nodeBorder : sum;
}

/**
 * The size of a shape that does not grow with a slot: the whole of it, in a drawing laid out left to right (`td`
 * false) or top down. The bar stands across the reading direction. Terminal drawings draw these shapes as boxes.
 */
export function fixedBody(shape: NodeShape | undefined, td: boolean, ruler: Ruler): Body | undefined {
  if (ruler.terminal === true) return undefined;
  switch (shape) {
    case 'start-dot':
      return { w: START_DOT, h: START_DOT };
    case 'end-dot':
      return { w: END_RING, h: END_RING };
    case 'bar':
      return td ? { w: BAR_LONG, h: BAR_THICK } : { w: BAR_THICK, h: BAR_LONG };
    case 'actor':
      return { w: ACTOR_W, h: ACTOR_H };
    default:
      return undefined;
  }
}

/** Shapes that keep a size of their own inside the slot they stand in (an ellipse across the reading direction only). */
export const isFixedShape = (shape: NodeShape | undefined): boolean => shape === 'start-dot' || shape === 'end-dot' || shape === 'bar' || shape === 'actor' || shape === 'ellipse';

interface Sizable extends WithCompartments {
  title: string;
  lines: string[];
  shape?: NodeShape | undefined;
  box?: Body | undefined;
}

/**
 * The size a node asks of its slot, when it differs from the one every text box gets: compartments, the fixed
 * shapes, the ellipse. A node of an ordinary shape gets nothing here. A box with compartments and a size given from
 * outside (`box`) is at least that large.
 */
export function ownSize(n: Sizable, td: boolean, ruler: Ruler): Body | undefined {
  if (hasCompartments(n)) {
    // A cylinder keeps its compartments between its two caps.
    const caps = n.shape === 'cylinder' && ruler.terminal !== true ? 2 * CYLINDER_CAP : 0;
    return { w: Math.max(recordWidth(n.compartments, ruler), n.box?.w ?? 0), h: Math.max(recordHeight(n.compartments, ruler) + caps, n.box?.h ?? 0) };
  }
  if (ruler.terminal === true) return undefined;
  const fixed = fixedBody(n.shape, td, ruler);
  if (n.shape === 'actor') {
    const name = ruler.textWidth(n.title, 'line');
    return { w: Math.max(ACTOR_W, name), h: ACTOR_H + ACTOR_NAME_GAP + ACTOR_NAME_H };
  }
  if (fixed) return fixed;
  if (n.shape === 'ellipse') return { w: Math.max(ruler.textWidth(n.title, 'title'), ...n.lines.map((l) => ruler.textWidth(l, 'line'))) + ELLIPSE_PAD, h: ELLIPSE_H };
  return undefined;
}
