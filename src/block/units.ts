import { ceilTo } from '../chart/grid.ts';
import type { Ruler } from '../metrics.ts';

/** The sizes of one medium: pixels for a picture, terminal cells for text. Everything the layout measures comes from here. */
export interface Units {
  terminal: boolean;
  /** Grid every box coordinate and size is a multiple of. */
  grid: number;
  snap(v: number): number;
  margin: number;
  /** Space between two columns and between two rows. */
  colGap: number;
  rowGap: number;
  /** Height of a row that holds nothing but empty blocks. */
  spaceHeight: number;
  /** Room between a group's edge and the blocks inside it. */
  pad: number;
  lineHeight: number;
  /** Smallest width and height of a block. */
  minWidth: number;
  minHeight: number;
  /** Widest a line of a block label may be before it is wrapped. */
  wrapWidth: number;
  /** Narrower wrap width for the label of a circle and of a diamond. */
  roundWrap: number;
  diamondWrap: number;
  textWidth(text: string): number;
  /** Shortest piece of line a link keeps straight where it leaves or enters a block. */
  stub: number;
  /** Clear distance a link keeps from the blocks it passes. */
  clear: number;
  /** Distance between two lines that share a passage. */
  lane: number;
  /** How far outside the outermost block a link may run to get around. */
  around: number;
  /** Length by which an arrowhead stands off the face it points at. */
  headGap: number;
  chipHeight: number;
  chipPad: number;
  titleHeight: number;
}

export function unitsOf(ruler: Ruler, compact = false): Units {
  if (ruler.terminal === true) {
    return {
      terminal: true,
      grid: 1,
      snap: Math.ceil,
      margin: compact ? 2 : 3,
      colGap: compact ? 4 : 6,
      rowGap: 2,
      spaceHeight: 3,
      pad: compact ? 1 : 2,
      lineHeight: 1,
      minWidth: compact ? 5 : 9,
      minHeight: 3,
      wrapWidth: 40,
      roundWrap: 40,
      diamondWrap: 40,
      textWidth: (t) => ruler.textWidth(t, 'title'),
      stub: 1,
      clear: 1,
      lane: 1,
      around: compact ? 1 : 2,
      headGap: 0,
      chipHeight: 1,
      chipPad: 2,
      titleHeight: 2,
    };
  }
  return {
    terminal: false,
    grid: 4,
    snap: (v) => ceilTo(v, 4),
    margin: 24,
    colGap: 48,
    rowGap: 24,
    spaceHeight: 48,
    pad: 16,
    lineHeight: ruler.lineHeight('title'),
    minWidth: 152,
    minHeight: 48,
    wrapWidth: 232,
    roundWrap: 112,
    diamondWrap: 104,
    textWidth: (t) => ruler.textWidth(t, 'title'),
    stub: 12,
    clear: 6,
    lane: 16,
    around: 12,
    headGap: 3,
    chipHeight: 24,
    chipPad: 22,
    titleHeight: 36,
  };
}
