import { createAccessibilityReader } from '../front/accessibility.ts';
import { configSection } from '../front/options.ts';
import { fail } from '../errors/fail.ts';
import type { Pie, PieSlice } from './model.ts';

const SLICE = /^"([^"]*)"\s*:\s*(.+)$/u;
const NUMBER = /^\d+(?:\.\d+)?$/u;

/** Parses a Mermaid pie chart: `pie [showData] [title ...]`, then `"label" : value` lines. */
/**
 * `heading` is the title of a leading front-matter block; a title line in the body wins over it. `config` is its
 * `config` map, of which `pie.donutHole` is read.
 */
export function parsePie(src: string, heading?: string, config?: unknown): Pie {
  const rows = src.split(/\r?\n/);
  const slices: PieSlice[] = [];
  let title: string | undefined;
  let bodyTitle = false;
  let showData = false;
  let headerSeen = false;
  const acc = createAccessibilityReader();
  for (let n = 0; n < rows.length; n++) {
    const lineNo = n + 1;
    const s = (rows[n] ?? '').trim();
    if (acc.insideBlock(s)) continue;
    if (s === '' || s.startsWith('%%')) continue;

    if (!headerSeen) {
      const head = /^pie(?:\s+(.*))?$/u.exec(s);
      if (head === null) fail('A pie chart starts with "pie".', lineNo, 'header');
      headerSeen = true;
      let rest = (head[1] ?? '').trim();
      for (;;) {
        const flag = /^showData(?:\s+(.*))?$/u.exec(rest);
        if (flag !== null) {
          showData = true;
          rest = (flag[1] ?? '').trim();
          continue;
        }
        const t = /^title(?:\s+(.*))?$/u.exec(rest);
        if (t !== null) {
          const text = (t[1] ?? '').trim();
          if (text !== '') {
            title = text;
            bodyTitle = true;
          }
          rest = '';
        }
        break;
      }
      if (rest !== '') fail(`Unexpected "${rest}" after "pie".`, lineNo);
      continue;
    }

    if (/^showData$/u.test(s)) {
      showData = true;
      continue;
    }
    const t = /^title(?:\s+(.*))?$/u.exec(s);
    if (t !== null) {
      const text = (t[1] ?? '').trim();
      if (text !== '') {
        title = text;
        bodyTitle = true;
      }
      continue;
    }
    if (acc.read(s)) continue;

    const m = SLICE.exec(s);
    if (m === null) fail(`Cannot read "${s}"; a slice is written "label" : value.`, lineNo);
    const raw = (m[2] ?? '').trim();
    if (/^-\d/u.test(raw)) fail(`"${m[1] ?? ''}" has the negative value ${raw}; values must be greater than zero.`, lineNo, 'value');
    if (!NUMBER.test(raw)) fail(`"${raw}" is not a number; a value is digits with an optional decimal part.`, lineNo, 'value');
    const value = Number(raw);
    if (value <= 0) fail(`"${m[1] ?? ''}" has the value ${raw}; values must be greater than zero.`, lineNo, 'value');
    slices.push({ label: m[1] ?? '', value, valueText: raw });
  }

  if (!headerSeen) fail('A pie chart starts with "pie".', 1, 'header');
  if (slices.length === 0) fail('A pie chart needs at least one slice.', rows.length, 'empty');
  if (!bodyTitle && heading !== undefined && heading !== '') title = heading;
  const hole = configSection(config, 'pie')?.['donutHole'];
  const donutHole = typeof hole === 'number' && Number.isFinite(hole) ? Math.min(0.9, Math.max(0, hole)) : 0;
  return { ...(title === undefined ? {} : { title }), showData, donutHole, slices };
}
