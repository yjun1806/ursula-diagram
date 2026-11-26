// Node only. Chooses the font files a PNG needs, as the renderer would pick them among all system fonts:
// - each font-family list of the SVG takes its first family the system has; generic names (sans-serif and the like)
//   match nothing, and a list with no match takes the family of the first font the renderer loads;
// - a character none of those files has is drawn from the first font file, in the renderer's order, that has it.
// Handing the renderer just these files draws the same picture as handing it every system font, much faster.
import type { PngFonts } from '../render/png.ts';
import type { FontIndex } from './font-index.ts';
import { coverageOf, systemFontIndex } from './font-index.ts';
import type { Coverage } from './sfnt.ts';

/** Hangul, kana, CJK ideographs and their punctuation and full-width forms. */
const EAST_ASIAN = /[ᄀ-ᇿ⺀-⿟　-㏿㐀-䶿一-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏＀-￯]/u;

/** The names the renderer does not map to a font: they fall to the default family. */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy']);

export const NO_FONT = 'no font file found, so the PNG has no text; install a font (on Debian or Ubuntu: apt install fonts-noto-core)';
export const NO_EAST_ASIAN =
  'no font has the Korean, Chinese or Japanese characters of this drawing, so they are missing from the PNG; install one (on Debian or Ubuntu: apt install fonts-noto-cjk)';

const ENTITY = /&(?:#x([0-9a-f]+)|#([0-9]+)|(lt|gt|amp|quot|apos));/gi;
const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** The text an SVG draws: what stands between tags, outside its style, title and description. */
export function textOf(svg: string): string {
  return svg
    .replace(/<(style|title|desc|script)\b[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(ENTITY, (_, hex: string | undefined, dec: string | undefined, name: string | undefined) =>
      hex !== undefined ? String.fromCodePoint(parseInt(hex, 16)) : dec !== undefined ? String.fromCodePoint(Number(dec)) : (NAMED[(name ?? '').toLowerCase()] ?? ''),
    );
}

/** Each font-family list of an SVG, as lower-case names without quotes. */
export function familyLists(svg: string): string[][] {
  const lists = [...svg.matchAll(/font-family(?::|=")([^;}"<>]*)/g)].map((m) =>
    (m[1] ?? '')
      .split(',')
      .map((f) => f.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
      .filter((f) => f !== ''),
  );
  return lists.filter((l) => l.length > 0);
}

/** The first family of `names` the index has; generic names never match. */
export function firstFamily(names: readonly string[], index: FontIndex): string | undefined {
  return names.find((name) => !GENERIC.has(name) && index.families.has(name));
}

export interface ChosenFonts {
  fonts: PngFonts;
  /** Why the PNG will lack text, when it will. */
  warnings: string[];
}

/** The fonts for the PNG of `svg` among the fonts of `index`, and warnings when its text cannot be drawn. */
export function chooseFonts(svg: string, index: FontIndex, coverage: (path: string) => Coverage = coverageOf): ChosenFonts {
  const chars = [...new Set(textOf(svg))].filter((c) => c.trim() !== '');
  if (chars.length === 0) return { fonts: { files: [] }, warnings: [] };
  const first = index.files[0];
  if (first === undefined) return { fonts: { system: true }, warnings: [NO_FONT] };
  // The renderer's default family: the family of the first face it loads.
  const fallbackFamily = first.families[0]?.toLowerCase() ?? '';
  const families = new Set(familyLists(svg).map((list) => firstFamily(list, index) ?? fallbackFamily));
  if (families.size === 0) families.add(fallbackFamily);
  const primary = [...families].map((f) => index.families.get(f)?.files ?? []);
  const files = new Set(primary.flat());
  const has = (path: string, cp: number): boolean => coverage(path)(cp);
  let lacking = false;
  for (const c of chars) {
    const cp = c.codePointAt(0) ?? 0;
    // A character every chosen family has needs nothing more; any other may fall back, whichever list it is in.
    if (primary.every((group) => group.some((f) => has(f, cp)))) continue;
    const found = index.files.find((f) => has(f.path, cp));
    if (found !== undefined) files.add(found.path);
    else if (EAST_ASIAN.test(c)) lacking = true;
  }
  // In the renderer's order, so that its fallback among these files meets them as it would among all.
  const order = new Map(index.files.map((f, i) => [f.path, i]));
  const sorted = [...files].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const usesFallback = families.has(fallbackFamily);
  const defaultFamily = usesFallback ? first.families[0] : index.families.get([...families][0] ?? '')?.name;
  return {
    fonts: { files: sorted, ...(defaultFamily === undefined ? {} : { defaultFamily }) },
    warnings: lacking ? [NO_EAST_ASIAN] : [],
  };
}

/**
 * The fonts for the PNG of `svg` among the system fonts and `extraDirs`. When the system fonts cannot be listed,
 * the renderer loads them all by itself, as it would without this choice.
 */
export function pngFonts(svg: string, extraDirs: readonly string[] = []): ChosenFonts {
  let index: FontIndex;
  try {
    index = systemFontIndex(extraDirs);
  } catch {
    return { fonts: { system: true, dirs: [...extraDirs] }, warnings: [] };
  }
  const chosen = chooseFonts(svg, index);
  return 'system' in chosen.fonts ? { ...chosen, fonts: { system: true, dirs: [...extraDirs] } } : chosen;
}
