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
  /** Space between two adjacent lane bands. */
  laneGap: number;
  rowGap: number;
  trackGap: number;
  lanePad: number;
  laneLabelGap: number;
  /** Length of a sample line in the legend. */
  legendSample: number;
  /** Space between a legend sample and its caption. */
  legendCaptionGap: number;
  /** Space between two legend items. */
  legendGap: number;
  /** Height the legend adds below the drawing. */
  legendHeight: number;
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

/**
 * Average advance of each character class as a fraction of the font size. The values are measured
 * glyph advances of a system sans-serif stack with a Korean fallback at 12-13 px, plus a margin of
 * about 3 %. The same table serves every text role.
 */
const EM = {
  wide: 0.89,
  upper: 0.71,
  lower: 0.57,
  digit: 0.65,
  space: 0.29,
  narrow: 0.33,
  widePunct: 0.89,
  punct: 0.5,
  other: 0.62,
} as const;

const NARROW = new Set(".,:;'!|il\u00b7");
const WIDE_SYMBOLS = new Set('@#%&MW');
const PUNCTUATION = new Set('()[]/-_+=?');

function emWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (isWide(cp) || cp > 0xffff) return EM.wide;
  if (ch === ' ') return EM.space;
  if (NARROW.has(ch)) return EM.narrow;
  if (WIDE_SYMBOLS.has(ch)) return EM.widePunct;
  if (ch >= 'A' && ch <= 'Z') return EM.upper;
  if (ch >= 'a' && ch <= 'z') return EM.lower;
  if (ch >= '0' && ch <= '9') return EM.digit;
  if (PUNCTUATION.has(ch) || cp < 0x80) return EM.punct;
  return EM.other;
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
    rankGap: 40,
    laneGap: 4,
    rowGap: 40,
    trackGap: 12,
    lanePad: 20,
    laneLabelGap: 8,
    legendSample: 40,
    legendCaptionGap: 8,
    legendGap: 24,
    legendHeight: 32,
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
    laneGap: 1,
    rowGap: 2,
    trackGap: 1,
    lanePad: 1,
    laneLabelGap: 1,
    legendSample: 2,
    legendCaptionGap: 1,
    legendGap: 3,
    legendHeight: 1,
    snap: (v) => Math.round(v),
  };
}
