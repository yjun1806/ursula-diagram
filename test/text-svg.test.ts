import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTextSvg, spansToSvg } from '../src/index.ts';

const root = new URL('..', import.meta.url).pathname;
const normal = (text: string) => [{ text, tone: 'normal' as const }];

describe('a terminal drawing as a picture', () => {
  it('draws lines as paths and leaves no line character in the text', () => {
    const svg = spansToSvg(['┌────┐', '│ ab │', '└────┘'].map(normal));
    expect(svg).toContain('viewBox="0 0 64 67"');
    expect(svg).not.toMatch(/[\u2500-\u257f]/);
    // The two sides stand in the middle of the first and the last column.
    expect(svg).toContain('M12 16.5V50.5');
    expect(svg).toContain('M52 16.5V50.5');
    expect(svg).toContain('<text x="24" y="38" textLength="16" lengthAdjust="spacingAndGlyphs">ab</text>');
  });

  it('gives a word of wide characters two cells for each', () => {
    const svg = spansToSvg([normal('│ 주문 ab│')]);
    expect(svg).toContain('<text x="24" y="21" textLength="32" lengthAdjust="spacingAndGlyphs">주문</text>');
    expect(svg).toContain('<text x="64" y="21" textLength="16" lengthAdjust="spacingAndGlyphs">ab</text>');
    expect(svg).toContain('M84 8V25');
  });

  it('keeps the tones and reads the colours from the variables', () => {
    const svg = spansToSvg([[{ text: '├─ ', tone: 'dim' }, { text: 'src', tone: 'bold' }, { text: ' x', tone: 'accent' }]]);
    expect(svg).toContain('class="ursula-tl ursula-tl--dim"');
    expect(svg).toContain('<text class="ursula-tt--bold"');
    expect(svg).toContain('<text class="ursula-tt--accent"');
    expect(svg).toContain('var(--ursula-fg,#201f1e)');
    expect(svg).toContain('@media (prefers-color-scheme: dark)');
  });

  it('draws arrowheads and dashed and heavy lines as shapes', () => {
    const svg = spansToSvg([normal('┄┄▶ ━━▷ ●')]);
    expect(svg).toContain('ursula-tl--dash3');
    expect(svg).toContain('ursula-tl--heavy');
    expect(svg).toContain('class="ursula-ts"');
    expect(svg).not.toContain('<text');
  });

  it('draws a diagram within the width, or says why not', () => {
    const src = readFileSync(`${root}examples/order-flow.mmd`, 'utf8');
    const drawn = renderTextSvg(src, 100);
    if ('error' in drawn) throw new Error(drawn.error);
    expect(drawn.svg.startsWith('<svg ')).toBe(true);
    expect(drawn.svg).toContain('>주문</text>');
    expect(renderTextSvg(src, 20)).toHaveProperty('error');
  });
});
