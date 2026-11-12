import { describe, expect, it } from 'vitest';
import { createAccessibilityReader, escapeXml, withDescription } from '../src/front/accessibility.ts';
import { configSection, frontOf } from '../src/front/options.ts';

describe('accessibility reader', () => {
  it('reads the accTitle text and claims title and description lines', () => {
    const r = createAccessibilityReader();
    expect(r.read('accTitle: A chart')).toBe(true);
    expect(r.read('accDescr: about it')).toBe(true);
    expect(r.read('title Other')).toBe(false);
    expect(r.title).toBe('A chart');
  });

  it('skips the body of an accDescr block up to the closing brace', () => {
    const r = createAccessibilityReader();
    expect(r.read('accDescr {')).toBe(true);
    expect(r.insideBlock('first line')).toBe(true);
    expect(r.insideBlock('last line }')).toBe(true);
    expect(r.insideBlock('after')).toBe(false);
  });

  it('opens no block when the brace closes on the same line', () => {
    const r = createAccessibilityReader();
    expect(r.read('accDescr { short }')).toBe(true);
    expect(r.insideBlock('next')).toBe(false);
  });

  it('matches the keywords in any case only when asked', () => {
    expect(createAccessibilityReader().read('ACCTITLE: x')).toBe(false);
    const r = createAccessibilityReader({ ignoreCase: true });
    expect(r.read('ACCTITLE: x')).toBe(true);
    expect(r.title).toBe('x');
  });

  it('lets an empty title replace an earlier one unless told to keep it', () => {
    const replace = createAccessibilityReader();
    replace.read('accTitle: A');
    replace.read('accTitle:');
    expect(replace.title).toBe('');
    const keep = createAccessibilityReader({ emptyTitle: 'keep' });
    keep.read('accTitle: A');
    keep.read('accTitle:');
    expect(keep.title).toBe('A');
  });

  it('has no title before one is read', () => {
    expect(createAccessibilityReader().title).toBeUndefined();
  });
});

describe('description in SVG', () => {
  it('escapes markup characters', () => {
    expect(escapeXml('a<b>&c')).toBe('a&lt;b&gt;&amp;c');
  });

  it('adds a desc after the title, and nothing for an empty description', () => {
    const svg = '<svg><title>T</title></svg>';
    expect(withDescription(svg, 'a & b')).toBe('<svg><title>T</title><desc>a &amp; b</desc></svg>');
    expect(withDescription(svg, '')).toBe(svg);
    expect(withDescription(svg, undefined)).toBe(svg);
  });
});

describe('front-matter options', () => {
  it('takes a string heading and a map config, and ignores other types', () => {
    expect(frontOf({ heading: 'H', config: { a: 1 } })).toEqual({ heading: 'H', config: { a: 1 } });
    expect(frontOf({ heading: 3, config: null })).toEqual({});
    expect(frontOf({})).toEqual({});
  });

  it('finds a section map and nothing else', () => {
    const config = { gantt: { a: 1 }, list: [1], text: 'x' };
    expect(configSection(config, 'gantt')).toEqual({ a: 1 });
    expect(configSection(config, 'list')).toBeUndefined();
    expect(configSection(config, 'text')).toBeUndefined();
    expect(configSection(config, 'missing')).toBeUndefined();
    expect(configSection(undefined, 'gantt')).toBeUndefined();
    expect(configSection([1], 'gantt')).toBeUndefined();
  });
});
