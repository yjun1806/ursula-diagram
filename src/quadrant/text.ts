import { cellWidth } from '../metrics.ts';
import { quadrantOf } from './parse.ts';
import type { QuadrantChart } from './parse.ts';

function cut(text: string, width: number): string {
  if (cellWidth(text) <= width) return text;
  let out = '';
  for (const ch of text) {
    if (cellWidth(out + ch) > width - 1) break;
    out += ch;
  }
  return `${out}…`;
}

const padEnd = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - cellWidth(text)));
const padStart = (text: string, width: number): string => ' '.repeat(Math.max(0, width - cellWidth(text))) + text;

/** The values as a table: the title, then one row per point with its name, x, y and quadrant name. */
export function quadrantTextLines(chart: QuadrantChart, maxWidth: number | undefined): string[] {
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
  const lines: string[] = [];
  const title = chart.title ?? 'Quadrant chart';
  lines.push(maxWidth === undefined ? title : cut(title, maxWidth));
  for (const r of rows) {
    lines.push([padEnd(cut(r.name, nameW), nameW), padStart(r.x, xW), padStart(r.y, yW), cut(r.quadrant, quadW)].join(' '.repeat(GAP)).trimEnd());
  }
  return lines;
}
