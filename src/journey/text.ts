import { cellWidth } from '../metrics.ts';
import type { Journey } from './model.ts';

function cut(text: string, cap: number): string {
  if (cellWidth(text) <= cap) return text;
  let out = '';
  for (const ch of text) {
    if (cellWidth(`${out}${ch}…`) > cap) break;
    out += ch;
  }
  return `${out}…`;
}

const padEnd = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - cellWidth(s)));
const padStart = (s: string, w: number): string => ' '.repeat(Math.max(0, w - cellWidth(s))) + s;

const GAP = 2;
const MIN = 4;

/** The values as a table: a title line, then one row per task with its section, score and actors. */
export function journeyTextLines(journey: Journey, maxWidth: number | undefined): string[] {
  const rows = journey.sections.flatMap((sec) =>
    sec.tasks.map((t, i) => ({ section: i === 0 ? (sec.name ?? '') : '', task: t.name, score: t.scoreText, actors: t.actors.join(', ') })),
  );
  const widthOf = (key: 'section' | 'task' | 'score' | 'actors'): number => Math.max(0, ...rows.map((r) => cellWidth(r[key])));
  const w = { section: widthOf('section'), task: widthOf('task'), score: widthOf('score'), actors: widthOf('actors') };
  const total = (): number => w.section + w.task + w.score + w.actors + (w.section > 0 ? GAP : 0) + GAP + (w.actors > 0 ? GAP : 0);
  if (maxWidth !== undefined) {
    while (total() > maxWidth) {
      const key = (['actors', 'task', 'section'] as const).filter((k) => w[k] > MIN).sort((a, b) => w[b] - w[a])[0];
      if (key === undefined) break;
      w[key] -= 1;
    }
  }
  const lines = rows.map((r) => {
    const parts: string[] = [];
    if (w.section > 0) parts.push(padEnd(cut(r.section, w.section), w.section));
    parts.push(padEnd(cut(r.task, w.task), w.task));
    parts.push(padStart(r.score, w.score));
    if (w.actors > 0) parts.push(cut(r.actors, w.actors));
    return parts.join(' '.repeat(GAP)).trimEnd();
  });
  const head = journey.title === undefined ? [] : [maxWidth === undefined ? journey.title : cut(journey.title, maxWidth)];
  return [...head, ...lines];
}
