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
  /** Grid every box coordinate and size, gap, lane padding and lane rectangle is a multiple of. */
  nodeGrid: number;
  /** When set, the common box width is the widest that is no more than this many times the middle width, instead of the width three quarters of the boxes fit. */
  commonWithin?: number;
  /** Finer grid every edge bend, track offset and label position is a multiple of. Attachment points on a side are exempt. */
  edgeGrid: number;
  /**
   * Distance between neighbouring attachment ports on a side that runs along the flow axis; the layout rounds it
   * so that it divides the slot unit and ports of boxes half a step apart coincide.
   */
  portPitch: number;
  /** Number of ports (at equal fractions, always including the centre) on a side that runs across the flow axis. */
  sidePorts: number;
  /** Grid of the sequence diagram family. */
  grid: number;
  /** The medium is a terminal: the layered engine draws it with its own rules (no spare-width spreading, per-drawing box width). */
  terminal?: boolean;
  /** Terminal stages: cells between two neighbouring pass-through lines of a gap (1 when they may stand on adjacent lines). */
  linePitch?: number;
  /** Set by the layered engine on the ruler it derives for a terminal: every box has the width of the widest. */
  uniform?: boolean;
  /** Canvas width of this medium when the caller gives none; absent when there is no natural width. */
  defaultWidth?: number;
  /** How much wider a bold run is than the same run in the regular weight; 1 when absent. */
  boldScale?: number;
  /** Spacing used by the sequence diagram family. */
  sequence: SequenceMetrics;
}

export interface SequenceMetrics {
  /** Thickness of one line: 0 in vector units, one cell in cells. */
  stroke: number;
  /** Outer margin of the drawing. */
  margin: number;
  /** Height of a header box with one text line. */
  headH: number;
  /** Smallest header width, shared by all headers. */
  headMinW: number;
  /** Width a header adds around its widest text. */
  headPadX: number;
  /** Clear distance between two header boxes at the normal and at the tight lifeline pitch. */
  pitchGap: number;
  pitchGapTight: number;
  /** Room a message label needs beyond its text inside its span. */
  labelPad: number;
  notePadX: number;
  notePadY: number;
  /** Space between a lifeline and a note beside it. */
  noteGap: number;
  /** Narrowest note box once its text is wrapped to stay inside the header extent. */
  noteMinW: number;
  /** Clear space above the next element after the headers, after a message or note, a frame, and a frame head or divider. */
  gapFirst: number;
  gapMsg: number;
  gapFrame: number;
  gapHead: number;
  /** Space between the bottom of a label and its line. */
  labelDrop: number;
  /** Space between the sequence number and the label text. */
  numGap: number;
  /** Horizontal room of the backing behind a label. */
  labelBgPad: number;
  /** Distance a failed message stops short of the lifeline. */
  failGap: number;
  loopW: number;
  loopH: number;
  loopR: number;
  loopGap: number;
  barW: number;
  barNest: number;
  /** Length a bar that is never deactivated continues below its last message line. */
  barTail: number;
  tabW: number;
  tabH: number;
  tabPad: number;
  tabGap: number;
  /** Tab text width relative to a label of the same characters, and extra advance per character. */
  tabScale: number;
  tabSpacing: number;
  /** Distance between a tab or divider and its condition text, and the height of that text; 0 puts the text on the tab row. */
  condGap: number;
  condH: number;
  /** Width of small captions relative to a label of the same characters. */
  captionScale: number;
  /** Distance from the last row to the bottom of a frame, and between a nested frame bottom and its parent. */
  frameFoot: number;
  frameInset: number;
  dividerInset: number;
  /** Distance of condition texts from the left edge of a frame. */
  condInset: number;
  /** Space the lifelines continue below the last row. */
  tail: number;
  /** Distance from the lifeline ends to the legend rule, from the rule to the legend row, and from the row to the end. */
  legendTop: number;
  legendRow: number;
  legendBelow: number;
  /** Rules of the terminal text drawing; absent for media that have no text mode. */
  text?: SequenceTextMetrics;
}

/** Spacing of the sequence text drawing, which has its own layout rules instead of the pixel ones. */
export interface SequenceTextMetrics {
  /** Blank cells a header adds around its widest label line, inside the border. */
  headPad: number;
  /** Cells between the extents of two neighbouring header boxes, plus one. */
  headGap: number;
  /** Smallest distance between two neighbouring lifelines. */
  pitchMin: number;
  /** Blank cells on each side of a label embedded in an arrow. */
  labelSpace: number;
  /** Line glyphs a label leaves on each side of itself, counting the tee and the head. */
  labelRun: number;
  /** Cells from the lifeline to the corner of a self message, and the blank cells before its label. */
  selfReach: number;
  selfGap: number;
  /** Cells between a lifeline and the bar or box of a note beside it. */
  noteOffset: number;
  /** Blank cells inside a boxed note, on each side. */
  noteBoxPad: number;
  /** Narrowest region a wrapped label or note is squeezed into. */
  wrapMin: number;
  /** Cells a frame side bar sits outside what it holds. */
  frameOutset: number;
  /** Line glyphs before a frame title, blank cells around it, and line glyphs after it. */
  frameLead: number;
  frameTitlePad: number;
  frameTrail: number;
  /** Cells between two legend items. */
  legendGap: number;
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
    boldScale: 1.05,
    nodePadX: 16,
    nodePadY: 12,
    nodeBorder: 0,
    labelPadX: 4,
    labelPadY: 2,
    widthStep: 8,
    rankGap: 48,
    rankGapMin: 32,
    laneGap: 16,
    rowGap: 48,
    trackGap: 12,
    lanePad: 32,
    laneLabelGap: 8,
    legendSample: 40,
    legendCaptionGap: 8,
    legendGap: 24,
    legendHeight: 32,
    snap: (v) => v,
    nodeGrid: 16,
    edgeGrid: 2,
    portPitch: 24,
    sidePorts: 3,
    grid: 4,
    defaultWidth: 1280,
    sequence: {
      stroke: 0,
      margin: 40,
      headH: 44,
      headMinW: 120,
      headPadX: 32,
      pitchGap: 48,
      pitchGapTight: 24,
      labelPad: 32,
      notePadX: 8,
      notePadY: 6,
      noteGap: 12,
      noteMinW: 120,
      gapFirst: 20,
      gapMsg: 20,
      gapFrame: 24,
      gapHead: 12,
      labelDrop: 4,
      numGap: 6,
      labelBgPad: 4,
      failGap: 4,
      loopW: 36,
      loopH: 32,
      loopR: 8,
      loopGap: 8,
      barW: 8,
      barNest: 4,
      barTail: 16,
      tabW: 40,
      tabH: 18,
      tabPad: 8,
      tabGap: 8,
      tabScale: 0.84,
      tabSpacing: 0.8,
      condGap: 12,
      condH: 14,
      captionScale: 0.92,
      frameFoot: 24,
      frameInset: 8,
      dividerInset: 8,
      condInset: 12,
      tail: 32,
      legendTop: 16,
      legendRow: 24,
      legendBelow: 12,
    },
  };
}

/** Width of a line written as runs: the sum of the runs, a bold run widened by the ruler's `boldScale`. */
export function spansWidth(ruler: Ruler, spans: readonly { text: string; weight?: 'bold'; italic?: true }[], role: TextRole): number {
  return spans.reduce((sum, span) => sum + ruler.textWidth(span.text, role) * (span.weight === 'bold' ? (ruler.boldScale ?? 1) : 1), 0);
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
    laneGap: 2,
    rowGap: 2,
    trackGap: 1,
    lanePad: 2,
    laneLabelGap: 1,
    legendSample: 2,
    legendCaptionGap: 1,
    legendGap: 3,
    legendHeight: 1,
    snap: (v) => Math.round(v),
    nodeGrid: 2,
    edgeGrid: 1,
    portPitch: 2,
    sidePorts: 1,
    grid: 1,
    terminal: true,
    sequence: {
      stroke: 1,
      margin: 1,
      headH: 3,
      headMinW: 7,
      headPadX: 4,
      pitchGap: 4,
      pitchGapTight: 2,
      labelPad: 4,
      notePadX: 1,
      notePadY: 0,
      noteGap: 1,
      noteMinW: 12,
      gapFirst: 0,
      gapMsg: 0,
      gapFrame: 0,
      gapHead: 0,
      labelDrop: 0,
      numGap: 1,
      labelBgPad: 1,
      failGap: 0,
      loopW: 3,
      loopH: 1,
      loopR: 0,
      loopGap: 1,
      barW: 1,
      barNest: 1,
      barTail: 0,
      tabW: 4,
      tabH: 1,
      tabPad: 1,
      tabGap: 1,
      tabScale: 1,
      tabSpacing: 0,
      condGap: 0,
      condH: 0,
      captionScale: 1,
      frameFoot: 1,
      frameInset: 1,
      dividerInset: 0,
      condInset: 2,
      tail: 1,
      legendTop: 0,
      legendRow: 1,
      legendBelow: 1,
      text: {
        headPad: 2,
        headGap: 2,
        pitchMin: 8,
        labelSpace: 1,
        labelRun: 2,
        selfReach: 3,
        selfGap: 1,
        noteOffset: 2,
        noteBoxPad: 1,
        wrapMin: 12,
        frameOutset: 1,
        frameLead: 1,
        frameTitlePad: 1,
        frameTrail: 1,
        legendGap: 3,
      },
    },
  };
}
