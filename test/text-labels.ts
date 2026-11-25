/**
 * The labels of a terminal drawing that are not written in full: for every label text, how many times fewer it stands
 * in the rows of the drawing than it was asked for. A text that is part of another one is found more often than asked
 * for; that never counts. A label the drawing cut short with an ellipsis is told apart by `cut`.
 */
export function labelsNotShown(labels: readonly string[], lines: readonly string[]): Array<{ text: string; missing: number; cut: boolean }> {
  const wanted = new Map<string, number>();
  for (const t of labels) if (t.trim() !== '') wanted.set(t.trim(), (wanted.get(t.trim()) ?? 0) + 1);
  const times = (t: string): number => lines.reduce((n, line) => n + line.split(t).length - 1, 0);
  const shortened = (t: string): boolean => {
    for (let k = [...t].length - 1; k >= 1; k--) if (lines.some((line) => line.includes(`${[...t].slice(0, k).join('').trimEnd()}…`))) return true;
    return false;
  };
  const out: Array<{ text: string; missing: number; cut: boolean }> = [];
  for (const [text, count] of wanted) {
    const missing = count - times(text);
    if (missing > 0) out.push({ text, missing, cut: shortened(text) });
  }
  return out;
}
