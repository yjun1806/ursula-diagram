import type { Ruler } from '../metrics.ts';
import type { Language } from '../text/language.ts';
import { languageOf } from '../text/language.ts';
import type { EdgeStyle, Layout, LegendItem } from '../types.ts';

export type LegendOption = false | Partial<Record<EdgeStyle, string>>;

/** The captions of the edge styles, in the language of the drawing's own text. */
export const LEGEND_CAPTIONS: Record<Language, Record<EdgeStyle, string>> = {
  en: { normal: 'Flow', thick: 'Request', dotted: 'Pending' },
  ko: { normal: '흐름', thick: '요청', dotted: '대기' },
};

/** Every text a layout draws: box titles and lines, line labels and their end labels, lane and cluster names. */
function textsOf(layout: Layout): string[] {
  return [
    ...layout.nodes.flatMap((n) => [n.title, ...n.lines, ...(n.compartments ?? []).flatMap((c) => c.lines)]),
    ...layout.edges.flatMap((e) => [e.label?.text ?? '', e.startLabel?.text ?? '', e.endLabel?.text ?? '']),
    ...layout.lanes.map((l) => l.label),
    ...(layout.clusters ?? []).map((c) => c.label),
  ];
}

const ORDER: readonly EdgeStyle[] = ['normal', 'thick', 'dotted'];

const tidy = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/**
 * Returns the layout with a legend below the drawing when two or more edge styles are used.
 * An existing legend is replaced, so the same layout can be re-captioned or have it removed.
 */
export function withLegend(layout: Layout, ruler: Ruler, option: LegendOption | undefined): Layout {
  const { legend: previous, ...rest } = layout;
  const bare: Layout = previous ? { ...rest, width: previous.base.width, height: previous.base.height } : rest;
  if (option === false) return bare;
  const used = ORDER.filter((s) => bare.edges.some((e) => e.style === s && !e.invisible));
  if (used.length < 2) return bare;

  const x0 = Math.min(...bare.lanes.map((l) => l.x), ...bare.nodes.map((n) => n.x), bare.width);
  const y = bare.height;
  const h = ruler.legendHeight;
  // A terminal leaves one blank line between the drawing and its legend.
  const lead = ruler.uniform ? 1 : 0;
  const rowY = y + lead + h / 2;
  let cursor = x0;
  const words = LEGEND_CAPTIONS[languageOf(textsOf(bare))];
  const items: LegendItem[] = used.map((style) => {
    const caption = option?.[style] ?? words[style];
    const w = ruler.legendSample + ruler.legendCaptionGap + ruler.textWidth(caption, 'edge');
    const item: LegendItem = {
      style,
      caption,
      x: tidy(cursor),
      y: tidy(rowY),
      w: tidy(w),
      sampleW: ruler.legendSample,
      captionX: tidy(cursor + ruler.legendSample + ruler.legendCaptionGap),
    };
    cursor += w + ruler.legendGap;
    return item;
  });
  const contentEnd = cursor - ruler.legendGap;
  // Pixels: a legend wider than the drawing widens it to a whole pixel.
  const width = tidy(Math.max(bare.width, ruler.uniform ? contentEnd + x0 : Math.ceil(contentEnd + x0 - 1e-9)));
  return {
    ...bare,
    width,
    height: tidy(y + lead + h),
    legend: { x: 0, y: tidy(y), w: width, h: h + lead, base: { width: bare.width, height: bare.height }, items },
  };
}
