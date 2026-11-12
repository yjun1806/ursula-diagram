import { describe, expect, it } from 'vitest';
import { cellRuler, cellWidth, pixelRuler, spansWidth } from '../src/metrics.ts';
import { clip, shrinkToFit } from '../src/text/fit.ts';
import { cut, joinSpans, padEnd, padStart, span } from '../src/text/terminal.ts';
import { wrapParagraphs, wrapWords } from '../src/text/wrap.ts';

describe('wrapWords', () => {
  const chars = (s: string): number => s.length;

  it('joins words greedily with single spaces', () => {
    expect(wrapWords('aa bb cc dd', 5, chars)).toEqual(['aa bb', 'cc dd']);
  });

  it('cuts a word wider than a line between characters by default', () => {
    expect(wrapWords('ab abcdefg', 4, chars)).toEqual(['ab', 'abcd', 'efg']);
  });

  it('keeps a wide word whole on its own line with longWord keep', () => {
    expect(wrapWords('ab abcdefg x', 4, chars, { longWord: 'keep' })).toEqual(['ab', 'abcdefg', 'x']);
  });

  it('splits at any whitespace by default and at single spaces only with split space', () => {
    expect(wrapWords('a\tb c', 10, chars)).toEqual(['a b c']);
    expect(wrapWords('a\tb c', 10, chars, { split: 'space' })).toEqual(['a\tb c']);
  });

  it('gives no line for text without words, or one empty line with blank', () => {
    expect(wrapWords('   ', 5, chars)).toEqual([]);
    expect(wrapWords('   ', 5, chars, { blank: true })).toEqual(['']);
  });

  it('measures with the given function', () => {
    expect(wrapWords('한글 한글', 4, cellWidth)).toEqual(['한글', '한글']);
  });

  it('wraps every paragraph on its own', () => {
    expect(wrapParagraphs(['aa bb', '', 'cc'], 2, chars, { blank: true })).toEqual(['aa', 'bb', '', 'cc']);
  });
});

describe('clip and shrinkToFit', () => {
  it('returns text that fits unchanged', () => {
    expect(clip('abc', 3)).toBe('abc');
    expect(shrinkToFit('abc', 3, cellWidth)).toBe('abc');
  });

  it('ends a clipped text in an ellipsis within the limit', () => {
    expect(clip('abcdef', 4)).toBe('abc…');
    expect(clip('한글한글', 5)).toBe('한글…');
  });

  it('clips to the ellipsis alone when the limit is below one character', () => {
    expect(clip('abc', 0)).toBe('…');
  });

  it('drops the spaces a cut leaves before the ellipsis', () => {
    expect(shrinkToFit('ab cd', 4, cellWidth)).toBe('ab…');
    expect(clip('ab cd', 4)).toBe('ab …');
  });

  it('gives nothing when not even the ellipsis fits', () => {
    expect(shrinkToFit('abc', 0, cellWidth)).toBeUndefined();
    expect(shrinkToFit('abc', 1, cellWidth)).toBe('…');
  });
});

describe('terminal helpers', () => {
  it('cuts by cells', () => {
    expect(cut('한글한글', 6)).toBe('한글…');
  });

  it('pads by cells on either side and never shortens', () => {
    expect(padEnd('한', 4)).toBe('한  ');
    expect(padStart('ab', 4)).toBe('  ab');
    expect(padEnd('abcd', 2)).toBe('abcd');
  });

  it('builds spans with a tone and joins them without tones', () => {
    expect(span('x')).toEqual({ text: 'x', tone: 'normal' });
    expect(joinSpans([span('a'), span('b', 'bold')])).toBe('ab');
  });
});

describe('spansWidth', () => {
  it('adds the runs, a bold run measured wider than the same plain run', () => {
    const px = pixelRuler();
    const plain = px.textWidth('Root', 'title') + px.textWidth(' with', 'title');
    expect(spansWidth(px, [{ text: 'Root' }, { text: ' with' }], 'title')).toBeCloseTo(plain, 6);
    const bold = spansWidth(px, [{ text: 'Root', weight: 'bold' }, { text: ' with' }], 'title');
    expect(bold).toBeGreaterThan(plain);
    expect(spansWidth(px, [{ text: 'Root', italic: true }], 'title')).toBeCloseTo(px.textWidth('Root', 'title'), 6);
  });

  it('counts a bold run in cells as wide as a plain one', () => {
    expect(spansWidth(cellRuler(), [{ text: 'Root', weight: 'bold' }, { text: ' with' }], 'line')).toBe(9);
  });
});
