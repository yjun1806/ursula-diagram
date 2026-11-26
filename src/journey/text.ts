import { cellWidth } from '../metrics.ts';
import { cut, padEnd, padStart, spansOf, trimEndSpans } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
import type { Journey } from './model.ts';


const GAP = 2;
const MIN = 4;

/**
 * The values as a table: a title line, then one row per task with its section, score and actors. The title and the
 * section names are bold, the actors dim, and the score of the worst-scored tasks is an accent when the scores differ.
 */
export function journeyTextSpans(journey: Journey, maxWidth: number | undefined): TextSpan[][] {
  const tasks = journey.sections.flatMap((sec) => sec.tasks);
  const scores = tasks.map((t) => t.score);
  const worst = Math.min(...scores);
  const marked = scores.some((v) => v !== worst);
  const rows = journey.sections.flatMap((sec) =>
    sec.tasks.map((t, i) => ({ section: i === 0 ? (sec.name ?? '') : '', task: t.name, score: t.scoreText, actors: t.actors.join(', '), low: marked && t.score === worst })),
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
  const gap = ' '.repeat(GAP);
  const lines = rows.map((r) => {
    const section = cut(r.section, w.section);
    return trimEndSpans(
      spansOf(
        ...(w.section > 0 ? [[section, 'bold'] as const, padEnd('', w.section - cellWidth(section)), gap] : []),
        padEnd(cut(r.task, w.task), w.task),
        gap,
        [padStart(r.score, w.score), r.low ? 'accent' : 'normal'],
        ...(w.actors > 0 ? [gap, [cut(r.actors, w.actors), 'dim'] as const] : []),
      ),
    );
  });
  const head = journey.title === undefined ? [] : [spansOf([maxWidth === undefined ? journey.title : cut(journey.title, maxWidth), 'bold'])];
  return [...head, ...lines];
}
