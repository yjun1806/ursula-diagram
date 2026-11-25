import { cellWidthOf } from '../metrics.ts';
import type { TextSpan, TextTone } from '../types.ts';
import { escapeXml, num, styleSheet } from './svg.ts';

/** Size of one terminal cell in the picture, the size of its text and the margin around the drawing. */
const CW = 8;
const CH = 17;
const FONT_SIZE = 13;
const BASELINE = 13;
const PAD = 8;

const FONT = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', 'D2Coding', 'Nanum Gothic Coding', monospace";

type Weight = 'light' | 'heavy' | 'dash3' | 'dash2' | 'dash4';

/** The arms of a line character from the middle of its cell: up, right, down, left. */
interface Arms {
  n?: Weight;
  e?: Weight;
  s?: Weight;
  w?: Weight;
  round?: boolean;
}

function arms(sides: string, weight: Weight, round = false): Arms {
  return { ...Object.fromEntries([...sides].map((side) => [side, weight])), ...(round ? { round } : {}) };
}

const LINES: Record<string, Arms> = {
  '─': arms('ew', 'light'), '│': arms('ns', 'light'),
  '┌': arms('se', 'light'), '┐': arms('sw', 'light'), '└': arms('ne', 'light'), '┘': arms('nw', 'light'),
  '├': arms('nse', 'light'), '┤': arms('nsw', 'light'), '┬': arms('esw', 'light'), '┴': arms('new', 'light'), '┼': arms('nesw', 'light'),
  '━': arms('ew', 'heavy'), '┃': arms('ns', 'heavy'),
  '┏': arms('se', 'heavy'), '┓': arms('sw', 'heavy'), '┗': arms('ne', 'heavy'), '┛': arms('nw', 'heavy'),
  '┣': arms('nse', 'heavy'), '┫': arms('nsw', 'heavy'), '┳': arms('esw', 'heavy'), '┻': arms('new', 'heavy'), '╋': arms('nesw', 'heavy'),
  '┒': { w: 'light', s: 'heavy' },
  '┄': arms('ew', 'dash3'), '┆': arms('ns', 'dash3'), '┈': arms('ew', 'dash4'), '┊': arms('ns', 'dash4'), '╌': arms('ew', 'dash2'), '╎': arms('ns', 'dash2'),
  '╭': arms('se', 'light', true), '╮': arms('sw', 'light', true), '╰': arms('ne', 'light', true), '╯': arms('nw', 'light', true),
};

/** Characters drawn as shapes: arrowheads, the marks at the ends of relation lines, dots and bars. */
const SHAPES = new Set('▶◀▼▲▷◁▽△◆◇●○◉⊕⊗█▏╱╲');

interface Cell {
  ch: string;
  tone: TextTone;
  /** Cells the character takes. */
  span: number;
}

/** One cell per column: a wide character fills its first cell and leaves the next one undefined. */
function grid(lines: readonly (readonly TextSpan[])[]): (Cell | undefined)[][] {
  return lines.map((line) =>
    line.flatMap((span) =>
      [...span.text].flatMap((ch): (Cell | undefined)[] => {
        const wide = cellWidthOf(ch.codePointAt(0) ?? 0) === 2;
        return wide ? [{ ch, tone: span.tone, span: 2 }, undefined] : [{ ch, tone: span.tone, span: 1 }];
      }),
    ),
  );
}

/** Pieces of straight line that share a row or a column, kept as stretches so that neighbours join into one. */
class Strokes {
  private readonly tracks = new Map<string, Array<[number, number]>>();

  add(tone: TextTone, weight: Weight, upright: boolean, at: number, from: number, to: number): void {
    const key = `${tone} ${weight} ${upright ? 'v' : 'h'} ${at}`;
    const track = this.tracks.get(key) ?? [];
    const last = track[track.length - 1];
    if (last !== undefined && Math.abs(last[1] - from) < 1e-9) last[1] = to;
    else track.push([from, to]);
    this.tracks.set(key, track);
  }

  /** The path data of every stretch, by tone and weight. */
  paths(): Map<string, string> {
    const out = new Map<string, string>();
    for (const [key, track] of this.tracks) {
      const [tone, weight, way, at] = key.split(' ');
      const d = track.map(([from, to]) => (way === 'v' ? `M${at} ${num(from)}V${num(to)}` : `M${num(from)} ${at}H${num(to)}`)).join('');
      const group = `${tone} ${weight}`;
      out.set(group, (out.get(group) ?? '') + d);
    }
    return out;
  }
}

const toneClass = (base: string, tone: TextTone): string => (tone === 'normal' ? '' : ` ${base}--${tone}`);

/** The shape of one character in the cell whose top left corner is (x, y); `joins` tells which neighbours reach it. */
function shape(ch: string, x: number, y: number, joins: { n: boolean; e: boolean; s: boolean; w: boolean }): { fill?: string; stroke?: string } {
  const cx = x + CW / 2;
  const cy = y + CH / 2;
  const right = x + CW;
  const bottom = y + CH;
  const head = 8;
  const half = 4;
  const r = 3.5;
  const stubs =
    (joins.n ? `M${num(cx)} ${num(y)}V${num(cy - r)}` : '') +
    (joins.s ? `M${num(cx)} ${num(bottom)}V${num(cy + r)}` : '') +
    (joins.w ? `M${num(x)} ${num(cy)}H${num(cx - r)}` : '') +
    (joins.e ? `M${num(right)} ${num(cy)}H${num(cx + r)}` : '');
  const circle = `M${num(cx - r)} ${num(cy)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const diamond = `M${num(x)} ${num(cy)}L${num(cx)} ${num(cy - r - 1)}L${num(right)} ${num(cy)}L${num(cx)} ${num(cy + r + 1)}Z`;
  const upright = (joins.n ? `M${num(cx)} ${num(y)}V${num(cy - r - 1)}` : '') + (joins.s ? `M${num(cx)} ${num(bottom)}V${num(cy + r + 1)}` : '');
  switch (ch) {
    case '▶':
    case '▷': {
      const d = `M${num(x)} ${num(cy - half)}L${num(right)} ${num(cy)}L${num(x)} ${num(cy + half)}Z`;
      return ch === '▶' ? { fill: d } : { stroke: d };
    }
    case '◀':
    case '◁': {
      const d = `M${num(right)} ${num(cy - half)}L${num(x)} ${num(cy)}L${num(right)} ${num(cy + half)}Z`;
      return ch === '◀' ? { fill: d } : { stroke: d };
    }
    case '▼':
    case '▽': {
      const d = `M${num(cx - half)} ${num(bottom - head)}L${num(cx)} ${num(bottom)}L${num(cx + half)} ${num(bottom - head)}Z`;
      const stub = joins.n ? `M${num(cx)} ${num(y)}V${num(bottom - head)}` : '';
      return ch === '▼' ? { fill: d, stroke: stub } : { stroke: d + stub };
    }
    case '▲':
    case '△': {
      const d = `M${num(cx - half)} ${num(y + head)}L${num(cx)} ${num(y)}L${num(cx + half)} ${num(y + head)}Z`;
      const stub = joins.s ? `M${num(cx)} ${num(bottom)}V${num(y + head)}` : '';
      return ch === '▲' ? { fill: d, stroke: stub } : { stroke: d + stub };
    }
    case '◆':
      return { fill: diamond, stroke: upright };
    case '◇':
      return { stroke: diamond + upright };
    case '●':
      return { fill: circle, stroke: stubs };
    case '○':
      return { stroke: circle + stubs };
    case '◉':
      return { fill: `M${num(cx - 1.5)} ${num(cy)}a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0Z`, stroke: circle + stubs };
    case '⊕':
      return { stroke: `${circle}M${num(cx - r)} ${num(cy)}H${num(cx + r)}M${num(cx)} ${num(cy - r)}V${num(cy + r)}${stubs}` };
    case '⊗': {
      const k = r * Math.SQRT1_2;
      return { stroke: `${circle}M${num(cx - k)} ${num(cy - k)}L${num(cx + k)} ${num(cy + k)}M${num(cx + k)} ${num(cy - k)}L${num(cx - k)} ${num(cy + k)}${stubs}` };
    }
    case '█': {
      const top = joins.n ? y : y + 3;
      const low = joins.s ? bottom : bottom - 3;
      return { fill: `M${num(x)} ${num(top)}H${num(right)}V${num(low)}H${num(x)}Z` };
    }
    case '▏':
      return { fill: `M${num(x)} ${num(y)}H${num(x + 1.5)}V${num(bottom)}H${num(x)}Z` };
    case '╱':
      return { stroke: `M${num(x)} ${num(bottom)}L${num(right)} ${num(y)}` };
    case '╲':
      return { stroke: `M${num(x)} ${num(y)}L${num(right)} ${num(bottom)}` };
    default:
      return {};
  }
}

function rules(): string[] {
  return [
    `.ursula-text{background:$bg;font-family:${FONT};font-size:${FONT_SIZE}px}`,
    '.ursula-tt{fill:$fg}',
    '.ursula-tt--dim{fill:$muted}',
    '.ursula-tt--bold{font-weight:700}',
    '.ursula-tt--accent{fill:$accent}',
    '.ursula-tl{fill:none;stroke:$line;stroke-width:1;stroke-linecap:square;stroke-linejoin:miter}',
    '.ursula-tl--heavy{stroke-width:2.5}',
    '.ursula-tl--dash3{stroke-dasharray:2 2;stroke-linecap:butt}',
    '.ursula-tl--dash2{stroke-dasharray:4 4;stroke-linecap:butt}',
    '.ursula-tl--dash4{stroke-dasharray:1 3;stroke-linecap:butt}',
    '.ursula-tl--round{stroke-linecap:butt}',
    '.ursula-tl--dim{stroke:$faint}',
    '.ursula-tl--bold{stroke:$fg}',
    '.ursula-tl--accent{stroke:$accent}',
    '.ursula-ts{fill:$line;stroke:none}',
    '.ursula-ts--dim{fill:$faint}',
    '.ursula-ts--bold{fill:$fg}',
    '.ursula-ts--accent{fill:$accent}',
  ];
}

/**
 * A terminal drawing as a picture. Lines, arrowheads and marks are drawn as shapes on the grid of cells, and every
 * word is set at the cell it starts in with the width of its cells, so no font moves a column out of line.
 */
export function renderTextSvg(lines: readonly (readonly TextSpan[])[]): string {
  const cells = grid(lines);
  const columns = Math.max(0, ...cells.map((row) => row.length));
  const width = columns * CW + 2 * PAD;
  const height = cells.length * CH + 2 * PAD;
  const at = (r: number, c: number): Cell | undefined => cells[r]?.[c];
  const arm = (r: number, c: number, side: 'n' | 'e' | 's' | 'w'): Weight | undefined => LINES[at(r, c)?.ch ?? '']?.[side];

  const strokes = new Strokes();
  const curves = new Map<TextTone, string>();
  const outlines = new Map<TextTone, string>();
  const fills = new Map<TextTone, string>();
  const texts: string[] = [];
  const append = (map: Map<TextTone, string>, tone: TextTone, d: string | undefined): void => {
    if (d !== undefined && d !== '') map.set(tone, (map.get(tone) ?? '') + d);
  };

  cells.forEach((row, r) => {
    const y = PAD + r * CH;
    const cy = y + CH / 2;
    let run: { from: number; cells: number; text: string; tone: TextTone; wide: boolean } | undefined;
    const flush = (): void => {
      if (run === undefined) return;
      texts.push(`<text${run.tone === 'normal' ? '' : ` class="${toneClass('ursula-tt', run.tone).trim()}"`} x="${num(PAD + run.from * CW)}" y="${num(y + BASELINE)}" textLength="${num(run.cells * CW)}" lengthAdjust="spacingAndGlyphs">${escapeXml(run.text)}</text>`);
      run = undefined;
    };
    row.forEach((cell, c) => {
      if (cell === undefined) return;
      const x = PAD + c * CW;
      const cx = x + CW / 2;
      const line = LINES[cell.ch];
      if (line !== undefined) {
        flush();
        if (line.round === true) {
          const down = line.s !== undefined;
          const east = line.e !== undefined;
          const k = CW / 2;
          append(curves, cell.tone, `M${num(cx)} ${num(down ? y + CH : y)}V${num(down ? cy + k : cy - k)}Q${num(cx)} ${num(cy)} ${num(east ? cx + k : cx - k)} ${num(cy)}`);
          return;
        }
        if (line.w !== undefined) strokes.add(cell.tone, line.w, false, cy, x, cx);
        if (line.e !== undefined) strokes.add(cell.tone, line.e, false, cy, cx, x + CW);
        if (line.n !== undefined) strokes.add(cell.tone, line.n, true, cx, y, cy);
        if (line.s !== undefined) strokes.add(cell.tone, line.s, true, cx, cy, y + CH);
        return;
      }
      if (SHAPES.has(cell.ch)) {
        flush();
        const solid = cell.ch === '█';
        const drawn = shape(cell.ch, x, y, {
          n: solid ? at(r - 1, c)?.ch === '█' : arm(r - 1, c, 's') !== undefined,
          s: solid ? at(r + 1, c)?.ch === '█' : arm(r + 1, c, 'n') !== undefined,
          w: arm(r, c - 1, 'e') !== undefined,
          e: arm(r, c + 1, 'w') !== undefined,
        });
        append(fills, cell.tone, drawn.fill);
        append(outlines, cell.tone, drawn.stroke);
        return;
      }
      if (cell.ch === ' ') {
        flush();
        return;
      }
      const wide = cell.span === 2;
      if (run !== undefined && (run.tone !== cell.tone || run.wide !== wide)) flush();
      run = run === undefined ? { from: c, cells: cell.span, text: cell.ch, tone: cell.tone, wide } : { ...run, cells: run.cells + cell.span, text: run.text + cell.ch };
    });
    flush();
  });

  const paths = [
    ...[...strokes.paths()].map(([group, d]) => {
      const [tone, weight] = group.split(' ') as [TextTone, Weight];
      return `<path class="ursula-tl${weight === 'light' ? '' : ` ursula-tl--${weight}`}${toneClass('ursula-tl', tone)}" d="${d}"/>`;
    }),
    ...[...curves].map(([tone, d]) => `<path class="ursula-tl ursula-tl--round${toneClass('ursula-tl', tone)}" d="${d}"/>`),
    ...[...outlines].map(([tone, d]) => `<path class="ursula-tl ursula-tl--round${toneClass('ursula-tl', tone)}" d="${d}"/>`),
    ...[...fills].map(([tone, d]) => `<path class="ursula-ts${toneClass('ursula-ts', tone)}" d="${d}"/>`),
  ];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="ursula ursula-text" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`,
    `<title>Text drawing: ${cells.length} rows, ${columns} columns</title>`,
    `<style>${styleSheet(rules())}</style>`,
    ...paths,
    `<g class="ursula-tt">${texts.join('')}</g>`,
    '</svg>',
  ].join('');
}
