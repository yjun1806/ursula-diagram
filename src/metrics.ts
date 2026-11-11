export type TextRole = 'title' | 'line' | 'edge' | 'lane';

/**
 * Converts text and spacing into the unit of one output medium. The layout code
 * only ever uses numbers that come from a ruler, so one algorithm serves pixels
 * and terminal cells alike.
 */
export interface Ruler {
  textWidth(text: string, role: TextRole): number;
  lineHeight(role: TextRole): number;
  nodePadX: number;
  nodePadY: number;
  /** Border thickness that a node box takes on each side in addition to its padding. */
  nodeBorder: number;
  /** Padding around an edge label's text. */
  labelPadX: number;
  labelPadY: number;
  widthStep: number;
  rankGap: number;
  rowGap: number;
  trackGap: number;
  lanePad: number;
  laneLabelGap: number;
  snap(v: number): number;
}

const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
];

function isWide(cp: number): boolean {
  return WIDE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** Display width in terminal cells of one code point. */
export function cellWidthOf(cp: number): number {
  return isWide(cp) ? 2 : 1;
}

export function cellWidth(text: string): number {
  let total = 0;
  for (const ch of text) total += cellWidthOf(ch.codePointAt(0) ?? 0);
  return total;
}

const NARROW_PUNCTUATION = new Set(".,:;'\"!|()[]{}`");

function emWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (isWide(cp) || cp > 0xffff) return 0.95;
  if (ch === ' ') return 0.3;
  if (NARROW_PUNCTUATION.has(ch)) return 0.3;
  if (ch >= 'A' && ch <= 'Z') return 0.68;
  if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) return 0.56;
  return 0.6;
}

export function pixelRuler(): Ruler {
  const size = (role: TextRole): number => (role === 'title' ? 13 : 12);
  return {
    textWidth(text, role) {
      let em = 0;
      for (const ch of text) em += emWidth(ch);
      return em * size(role);
    },
    lineHeight: (role) => (role === 'title' ? 18 : 16),
    nodePadX: 16,
    nodePadY: 12,
    nodeBorder: 0,
    labelPadX: 4,
    labelPadY: 2,
    widthStep: 8,
    rankGap: 48,
    rowGap: 40,
    trackGap: 12,
    lanePad: 20,
    laneLabelGap: 8,
    snap: (v) => v,
  };
}

export function cellRuler(): Ruler {
  return {
    textWidth: (text) => cellWidth(text),
    lineHeight: () => 1,
    nodePadX: 1,
    nodePadY: 0,
    nodeBorder: 1,
    labelPadX: 1,
    labelPadY: 0,
    widthStep: 1,
    rankGap: 4,
    rowGap: 2,
    trackGap: 1,
    lanePad: 1,
    laneLabelGap: 1,
    snap: (v) => Math.round(v),
  };
}
