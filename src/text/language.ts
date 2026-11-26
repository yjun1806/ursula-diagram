/** The languages the fixed words of a drawing (legend captions) are written in. */
export type Language = 'en' | 'ko';

const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/u;
const LATIN = /[A-Za-z]/;

/**
 * The language of a drawing's own text: Korean when more of its words are written in Hangul than in Latin letters,
 * English otherwise. Words without letters (numbers, symbols) do not count.
 */
export function languageOf(texts: Iterable<string | undefined>): Language {
  let hangul = 0;
  let latin = 0;
  for (const t of texts) {
    if (t === undefined) continue;
    for (const word of t.split(/\s+/)) {
      if (HANGUL.test(word)) hangul++;
      else if (LATIN.test(word)) latin++;
    }
  }
  return hangul > latin ? 'ko' : 'en';
}
