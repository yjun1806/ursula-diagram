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
  /** Smallest clear distance between two neighbouring boxes of one row once boxes slide along the flow axis. */
  rankGapMin: number;
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
  /** Fine grid every node and lane coordinate and size is a multiple of. */
  grid: number;
  /** Canvas width of this medium when the caller gives none; absent when there is no natural width. */
  defaultWidth?: number;
  /** Spacing used by the sequence diagram family. */
  sequence: SequenceMetrics;
}

export interface SequenceMetrics {
  /** Thickness of one line: 0 in vector units, one cell in cells. */
  stroke: number;
  /** Smallest distance between two adjacent lifelines. */
  minSpan: number;
  /** Space between two adjacent header boxes. */
  headerGap: number;
  headerPadY: number;
  /** Room a message label needs beyond its text between the two lifelines. */
  labelPad: number;
  notePadX: number;
  notePadY: number;
  /** Space between a lifeline and a note beside it. */
  noteGap: number;
  /** Vertical space a note adds around its box. */
  rowGap: number;
  /** Vertical space above the label, between label and line, and below the line of a message row. */
  msgPadTop: number;
  msgDrop: number;
  msgPadBottom: number;
  selfPadBottom: number;
  loopW: number;
  loopH: number;
  loopGap: number;
  barW: number;
  barNest: number;
  tabH: number;
  tabPad: number;
  tabGap: number;
  frameHeadH: number;
  frameFootH: number;
  framePad: number;
  dividerH: number;
  /** Space between the header boxes and the first row. */
  firstGap: number;
  /** Space the lifelines continue below the last row. */
  tail: number;
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
    rankGapMin: 28,
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
    grid: 4,
    defaultWidth: 1280,
    sequence: {
      stroke: 0,
      minSpan: 96,
      headerGap: 24,
      headerPadY: 8,
      labelPad: 24,
      notePadX: 12,
      notePadY: 8,
      noteGap: 8,
      rowGap: 8,
      msgPadTop: 8,
      msgDrop: 4,
      msgPadBottom: 4,
      selfPadBottom: 8,
      loopW: 32,
      loopH: 16,
      loopGap: 8,
      barW: 8,
      barNest: 4,
      tabH: 20,
      tabPad: 8,
      tabGap: 8,
      frameHeadH: 28,
      frameFootH: 8,
      framePad: 16,
      dividerH: 24,
      firstGap: 12,
      tail: 16,
    },
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
    rankGapMin: 2,
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
    grid: 1,
    sequence: {
      stroke: 1,
      minSpan: 8,
      headerGap: 2,
      headerPadY: 0,
      labelPad: 4,
      notePadX: 1,
      notePadY: 0,
      noteGap: 1,
      rowGap: 0,
      msgPadTop: 0,
      msgDrop: 0,
      msgPadBottom: 1,
      selfPadBottom: 0,
      loopW: 3,
      loopH: 1,
      loopGap: 1,
      barW: 1,
      barNest: 1,
      tabH: 1,
      tabPad: 1,
      tabGap: 1,
      frameHeadH: 1,
      frameFootH: 1,
      framePad: 2,
      dividerH: 1,
      firstGap: 0,
      tail: 1,
    },
  };
}
