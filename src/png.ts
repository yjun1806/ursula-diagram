import { render } from './index.ts';
import type { SvgOptions } from './index.ts';
import { extraFontDirs } from './node/font-dirs.ts';
import { pngFonts } from './node/png-fonts.ts';
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

export interface RenderPngOptions extends PngOptions, SvgOptions {
  maxWidth?: number;
  /**
   * Called with each warning about the text: when the system has no font at all, or none with the Korean, Chinese or
   * Japanese characters of the drawing. The PNG is still drawn, without those characters.
   */
  onWarning?: (message: string) => void;
}

/**
 * Picks the front-end by the header of `src` and draws it as PNG bytes, in the colours of `theme` (light by default)
 * on the page colour, at `scale` pixels per unit (2 by default). Needs the optional package @resvg/resvg-js; without
 * it the promise rejects with `PngRendererMissing`. The text is set in the system fonts (and those in `fontDirs`):
 * the families are listed once per process, and each PNG loads only the font files its text needs. Runs in Node, not
 * in a browser.
 */
export async function renderPng(src: string, opts: RenderPngOptions = {}): Promise<Uint8Array> {
  const { scale, theme, fontDirs, onWarning, ...svgOpts } = opts;
  const resvg = await loadRenderer();
  const svg = render(src, svgOpts);
  const chosen = pngFonts(svg, [...extraFontDirs(), ...(fontDirs ?? [])]);
  for (const warning of chosen.warnings) onWarning?.(warning);
  return svgToPng(svg, resvg, { ...(scale === undefined ? {} : { scale }), ...(theme === undefined ? {} : { theme }), fonts: chosen.fonts });
}
