import type { LayoutOptions } from './index.ts';

/** The options of a drawing that reach its layout. */
export type LayoutChoice = Pick<LayoutOptions, 'maxWidth' | 'maxHeight' | 'legend' | 'composition' | 'quality'>;

/**
 * The layout options among the options of a drawing, the ones that are given. Every front end lays out its svg, its
 * terminal drawing and its json with these, so that the check report (the json of the svg layout) describes the drawing.
 */
export function layoutOptionsOf(opts: { [K in keyof LayoutChoice]?: LayoutChoice[K] | undefined }): LayoutChoice {
  return {
    ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
    ...(opts.maxHeight === undefined ? {} : { maxHeight: opts.maxHeight }),
    ...(opts.legend === undefined ? {} : { legend: opts.legend }),
    ...(opts.composition === undefined ? {} : { composition: opts.composition }),
    ...(opts.quality === undefined ? {} : { quality: opts.quality }),
  };
}
