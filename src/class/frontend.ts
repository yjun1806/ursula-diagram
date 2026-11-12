import { cellRuler, cellWidth, pixelRuler } from '../metrics.ts';
import { clip } from '../text/fit.ts';
import { registerFrontEnd } from '../registry.ts';
import { layout } from '../layout/index.ts';
import { renderSvg } from '../render/svg.ts';
import { renderTextLayout } from '../render/text.ts';
import { createAccessibilityReader } from '../front/accessibility.ts';
import type { Graph } from '../types.ts';
import { parseClass, readClassConfig } from './parse.ts';
import type { FrontValue } from '../front-matter.ts';

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

registerFrontEnd({
  name: 'class',
  headers: ['classDiagram', 'classDiagram-v2'],
  svg(src, opts) {
    const graph = read(src, opts.config);
    const title = opts.title ?? accessibleTitle(src) ?? opts.heading ?? `Class diagram: ${graph.nodes.filter((n) => n.shape === 'rect').length} classes, ${graph.edges.length} relations`;
    const { maxWidth, legend: _legend, engine, composition, quality, ...svgOpts } = opts;
    const laid = layout(graph, pixelRuler(), {
      legend: false,
      ...(maxWidth === undefined ? {} : { maxWidth }),
      ...(engine === undefined ? {} : { engine }),
      ...(composition === undefined ? {} : { composition }),
      ...(quality === undefined ? {} : { quality }),
    });
    return renderSvg(laid, { ...svgOpts, title, legend: false });
  },
  textLines(src, maxWidth, opts) {
    const graph = read(src, opts.config);
    const draw = (g: Graph): string[] => renderTextLayout(layout(g, cellRuler(), { legend: false, fold: true, ...(maxWidth === undefined ? {} : { maxWidth }) }));
    const widest = (lines: string[]): number => Math.max(0, ...lines.map(cellWidth));
    let lines = draw(graph);
    if (maxWidth === undefined) return lines;
    // A drawing that is too wide is drawn again with every line of every box cut shorter, from 40 cells down to 8.
    for (let limit = 40; widest(lines) > maxWidth && limit >= 8; limit -= 4) {
      const clipLines = (ls: string[]): string[] => ls.map((l) => clip(l, limit));
      lines = draw({
        ...graph,
        nodes: graph.nodes.map((n) => ({ ...n, title: clip(n.title, limit), lines: clipLines(n.lines), ...(n.compartments === undefined ? {} : { compartments: n.compartments.map((c) => ({ ...c, lines: clipLines(c.lines) })) }) })),
      });
    }
    return lines;
  },
  json(src, mode, opts) {
    return layout(read(src, opts.config), mode === 'text' ? cellRuler() : pixelRuler(), { legend: false });
  },
});
