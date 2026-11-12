import './index.ts';
import { selectFrontEnd } from './registry.ts';
import { renderHtmlDocument } from './render/html.ts';
import type { Theme } from './render/html.ts';
import type { Layout } from './types.ts';

export { renderHtmlDocument } from './render/html.ts';
export type { HtmlOptions, Theme } from './render/html.ts';

/**
 * Picks the front-end by the header of `src` and returns one HTML file: the drawing, a theme switch, saving as PNG
 * or SVG, copying the source, and pressing a node to follow its edges. Nothing is loaded from outside.
 */
export function renderHtml(src: string, opts: { title?: string; maxWidth?: number; theme?: Theme } = {}): string {
  const frontEnd = selectFrontEnd(src);
  const svgOpts = { ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }), ...(opts.title === undefined ? {} : { title: opts.title }) };
  const svg = frontEnd.svg(src, svgOpts);
  const laid = frontEnd.json(src, 'svg', svgOpts);
  const layout = typeof laid === 'object' && laid !== null && 'nodes' in laid && 'edges' in laid ? (laid as Layout) : undefined;
  return renderHtmlDocument(svg, layout, src, { ...(opts.title === undefined ? {} : { title: opts.title }), ...(opts.theme === undefined ? {} : { theme: opts.theme }) });
}
