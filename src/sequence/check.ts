import type { Box, SequenceLayout } from './model.ts';

interface Named {
  name: string;
  box: Box;
  /** Index of the message whose own line runs under this text; undefined for notes and headers. */
  message?: number;
}

/** Positive area in common; boxes that only touch do not count. */
function overlaps(a: Box, b: Box): boolean {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

/**
 * The quality report of a placed sequence diagram: a summary line, then one line per problem.
 * Lifelines are not counted as lines under texts, as labels are drawn over them on purpose. A self
 * message has no width here, so its loop is not counted either; the layout does not give its size.
 */
export function sequenceCheckLines(l: SequenceLayout): string[] {
  const texts: Named[] = [
    ...l.participants.map((p) => ({ name: `header ${p.id}`, box: p.box })),
    ...l.messages.flatMap((m) => (m.label ? [{ name: `message ${m.index + 1} label`, box: m.label, message: m.index }] : [])),
    ...l.notes.map((n, i) => ({ name: `note ${i + 1}`, box: n.box })),
  ];
  const details: string[] = [];

  let textOverlaps = 0;
  texts.forEach((a, i) =>
    texts.slice(i + 1).forEach((b) => {
      if (!overlaps(a.box, b.box)) return;
      textOverlaps++;
      details.push(`overlap: ${a.name} and ${b.name}`);
    }),
  );

  let onLines = 0;
  for (const t of texts) {
    if (t.name.startsWith('header ')) continue;
    for (const m of l.messages) {
      if (m.index === t.message) continue;
      const line: Box = { x: Math.min(m.fromX, m.toX), y: m.y, w: Math.abs(m.toX - m.fromX), h: 0 };
      const crosses = line.y > t.box.y && line.y < t.box.y + t.box.h && Math.min(line.x + line.w, t.box.x + t.box.w) > Math.max(line.x, t.box.x);
      if (!crosses) continue;
      onLines++;
      details.push(`on line: ${t.name} under message ${m.index + 1}`);
    }
  }

  const overflow = l.diagnostics.filter((d) => d.kind === 'overflow');
  for (const d of overflow) details.push(`overflow: ${d.message}`);
  const summary = `width ${l.width} · overflow ${overflow.length > 0 ? 'yes' : 'none'} · text overlaps ${textOverlaps} · labels on lines ${onLines}`;
  return [summary, ...details];
}
