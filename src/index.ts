import { layout } from './layout/index.ts';
import { cellRuler, cellWidth, pixelRuler } from './metrics.ts';
import { parse } from './parse.ts';
import type { SvgOptions } from './render/svg.ts';
import { renderSvg } from './render/svg.ts';
import { renderTextLayout } from './render/text.ts';
import { UrsulaError } from './types.ts';

export { parse } from './parse.ts';
export { layout } from './layout/index.ts';
export type { LayoutOptions } from './layout/index.ts';
export { cellRuler, cellWidth, pixelRuler } from './metrics.ts';
export type { Ruler, TextRole } from './metrics.ts';
export { renderSvg } from './render/svg.ts';
export type { NodeHook, SvgOptions } from './render/svg.ts';
export { renderTextLayout } from './render/text.ts';
export { UrsulaError } from './types.ts';
export type * from './types.ts';

/** Parses `src`, lays it out in terminal cells and draws it as text. */
export function renderText(src: string, maxWidth: number): { lines: string[] } | { error: string } {
  try {
    const lines = renderTextLayout(layout(parse(src), cellRuler()));
    const widest = Math.max(0, ...lines.map(cellWidth));
    if (widest > maxWidth) return { error: `Drawing is ${widest} columns wide; the limit is ${maxWidth}.` };
    return { lines };
  } catch (err) {
    if (err instanceof UrsulaError) return { error: err.message };
    throw err;
  }
}

/** Parses `src`, lays it out in pixels and returns inline SVG. */
export function render(src: string, opts: SvgOptions & { maxWidth?: number } = {}): string {
  const { maxWidth, ...svgOpts } = opts;
  return renderSvg(layout(parse(src), pixelRuler(), maxWidth === undefined ? {} : { maxWidth }), svgOpts);
}
