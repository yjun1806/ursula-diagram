import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart, spansOf, trimEndSpans } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import { quadrantOf } from './parse.ts';
import type { QuadrantChart } from './parse.ts';


/** The values as a table: the title, then one row per point with its name, x, y and quadrant name. The title and the point names are bold, the quadrant names dim. */
export function quadrantTextSpans(chart: QuadrantChart, maxWidth: number | undefined): TextSpan[][] {
  const GAP = 2;
  const MIN = 4;
  const rows = chart.points.map((p) => {
    const q = quadrantOf(p.x, p.y);
    const named = chart.quadrants[q - 1] ?? '';
    return { name: p.name, x: p.xText, y: p.yText, quadrant: named === '' ? `quadrant-${q}` : named };
  });
  const xW = Math.max(0, ...rows.map((r) => cellWidth(r.x)));
  const yW = Math.max(0, ...rows.map((r) => cellWidth(r.y)));
  let nameW = Math.max(0, ...rows.map((r) => cellWidth(r.name)));
  let quadW = Math.max(0, ...rows.map((r) => cellWidth(r.quadrant)));
  if (maxWidth !== undefined) {
    const excess = (): number => nameW + xW + yW + quadW + 3 * GAP - maxWidth;
    // Shorten the name column first, then the quadrant names.
    let over = excess();
    if (over > 0) {
      const take = Math.min(over, Math.max(0, nameW - MIN));
      nameW -= take;
      over -= take;
    }
    if (over > 0) quadW = Math.max(MIN, quadW - over);
  }
  const lines: TextSpan[][] = [];
  const title = chart.title ?? 'Quadrant chart';
  lines.push(spansOf([maxWidth === undefined ? title : cut(title, maxWidth), 'bold']));
  const gap = ' '.repeat(GAP);
  for (const r of rows) {
    const name = cut(r.name, nameW);
    lines.push(trimEndSpans(spansOf([name, 'bold'], padEnd('', nameW - cellWidth(name)), gap, padStart(r.x, xW), gap, padStart(r.y, yW), gap, [cut(r.quadrant, quadW), 'dim'])));
  }
  return lines;
}
