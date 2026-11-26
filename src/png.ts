import { render } from './index.ts';
import type { SvgOptions } from './index.ts';
import { extraFontDirs } from './node/font-dirs.ts';
import type { PngOptions, ResvgModule } from './render/png.ts';
import { PNG_RENDERER, svgToPng } from './render/png.ts';

export type { PngOptions, PngTheme } from './render/png.ts';

/** The error `renderPng` throws when the optional renderer is not installed. */
export class PngRendererMissing extends Error {
  readonly code = 'URSULA_NO_PNG_RENDERER';
  constructor() {
    super(`install ${PNG_RENDERER} to write PNG: npm i ${PNG_RENDERER}`);
    this.name = 'PngRendererMissing';
  }
}

async function loadRenderer(): Promise<ResvgModule> {
  try {
    const mod = (await import(PNG_RENDERER)) as ResvgModule & { default?: ResvgModule };
    return mod.default ?? mod;
  } catch {
    throw new PngRendererMissing();
  }
}

/**
 * Picks the front-end by the header of `src` and draws it as PNG bytes, in the colours of `theme` (light by default)
 * on the page colour, at `scale` pixels per unit (2 by default). Needs the optional package @resvg/resvg-js, which
 * uses the system fonts; without it the promise rejects with `PngRendererMissing`. Runs in Node, not in a browser.
 */
export async function renderPng(src: string, opts: PngOptions & SvgOptions & { maxWidth?: number } = {}): Promise<Uint8Array> {
  const { scale, theme, ...svgOpts } = opts;
  const resvg = await loadRenderer();
  return svgToPng(render(src, svgOpts), resvg, { ...(scale === undefined ? {} : { scale }), ...(theme === undefined ? {} : { theme }), fontDirs: extraFontDirs() });
}
