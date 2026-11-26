/** Edits (insert, delete, change, swap two neighbours) between two words, ignoring case; stops counting past `most`. */
export function editDistance(a: string, b: string, most = Infinity): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (Math.abs(s.length - t.length) > most) return most + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let d = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d = Math.min(d, (prev2[j - 2] ?? 0) + 1);
      row.push(d);
      low = Math.min(low, d);
    }
    if (low > most) return most + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[t.length] ?? 0;
}

/**
 * The one candidate closest to `word`, when it is two edits away or nearer and no other candidate is as near.
 * A candidate that differs from `word` only in case counts as no edit. `word` itself is never suggested.
 */
export function closest(word: string, candidates: Iterable<string>, most = 2): string | undefined {
  if (word === '') return undefined;
  let best: string | undefined;
  let bestDistance = most + 1;
  let tied = false;
  const seen = new Set<string>();
  for (const c of candidates) {
    if (c === word || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    // Short words are too easy to reach; one edit at most below four letters.
    const limit = Math.min(most, c.length < 4 ? 1 : most);
    const d = editDistance(word, c, limit);
    if (d > limit) continue;
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
      tied = false;
    } else if (d === bestDistance) tied = true;
  }
  return tied ? undefined : best;
}
