import { cellRuler, cellWidth, pixelRuler } from '../metrics.ts';
import { clip } from '../text/fit.ts';
import { registerFrontEnd } from '../registry.ts';
import { layout } from '../layout/index.ts';
import { renderSvg } from '../render/svg.ts';
import { renderTextLayout, renderTextLayoutSpans } from '../render/text.ts';
import { createAccessibilityReader } from '../front/accessibility.ts';
import type { Graph, Layout } from '../types.ts';
import { parseClass, readClassConfig } from './parse.ts';
import type { FrontValue } from '../front-matter.ts';
import { titledLines, titledSpans } from '../front/title.ts';

function read(src: string, config: Record<string, FrontValue> | undefined): Graph {
  return parseClass(src, readClassConfig(src, config));
}

/** The text of the `accTitle:` line of the source, when it has one. */
function accessibleTitle(src: string): string | undefined {
  const reader = createAccessibilityReader();
  for (const row of src.split(/\r?\n/u)) {
    const text = row.trim();
    if (!reader.insideBlock(text)) reader.read(text);
  }
  return reader.title === '' ? undefined : reader.title;
}

/** The terminal drawing. layout() cuts the lines of boxes divided into compartments itself; a drawing with none (notes only) that is too wide is drawn again with every line cut shorter, from 40 cells down to 8. */
function terminal(src: string, maxWidth: number | undefined, config: Parameters<typeof read>[1]): { lines: string[]; layout: Layout } {
  const graph = read(src, config);
  const draw = (g: Graph): { lines: string[]; layout: Layout } => {
    const laid = layout(g, cellRuler(), { legend: false, fold: true, ...(maxWidth === undefined ? {} : { maxWidth }) });
    return { lines: renderTextLayout(laid), layout: laid };
  };
  let drawn = draw(graph);
  if (maxWidth === undefined || graph.nodes.some((n) => n.compartments !== undefined)) return drawn;
  const widest = (ls: string[]): number => Math.max(0, ...ls.map(cellWidth));
  for (let limit = 40; widest(drawn.lines) > maxWidth && limit >= 8; limit -= 4) {
    drawn = draw({ ...graph, nodes: graph.nodes.map((n) => ({ ...n, title: clip(n.title, limit), lines: n.lines.map((l) => clip(l, limit)) })) });
  }
  return drawn;
}

registerFrontEnd({
  name: 'class',
  headers: ['classDiagram', 'classDiagram-v2'],
  svg(src, opts) {
    const graph = read(src, opts.config);
    const title = opts.title ?? accessibleTitle(src) ?? opts.heading ?? `Class diagram: ${graph.nodes.filter((n) => n.shape === 'rect').length} classes, ${graph.edges.length} relations`;
    const { maxWidth, legend: _legend, composition, quality, ...svgOpts } = opts;
    const laid = layout(graph, pixelRuler(), {
      legend: false,
      ...(maxWidth === undefined ? {} : { maxWidth }),
      ...(composition === undefined ? {} : { composition }),
      ...(quality === undefined ? {} : { quality }),
    });
    return renderSvg(laid, { ...svgOpts, title, legend: false, ...(opts.heading === undefined ? {} : { drawTitle: opts.heading }) });
  },
  textLines(src, maxWidth, opts) {
    return titledLines(terminal(src, maxWidth, opts.config).lines, opts.heading, maxWidth);
  },
  textSpans(src, maxWidth, opts) {
    return titledSpans(renderTextLayoutSpans(terminal(src, maxWidth, opts.config).layout), opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    return layout(read(src, opts.config), mode === 'text' ? cellRuler() : pixelRuler(), { legend: false });
  },
});
