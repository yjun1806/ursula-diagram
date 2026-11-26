// A PNG of a drawing. The engine has no rasterizer of its own: the optional package @resvg/resvg-js draws the SVG, and
// whoever asks for a PNG hands its module in. A PNG cannot follow CSS variables or the viewer's colour scheme, so
// every colour is fixed to one scheme before it is drawn.
import { COLORS } from './colors.ts';
import { PAPER } from './html.ts';

export type PngTheme = 'light' | 'dark';

/** The package that draws a PNG, and the line that says how to install it. */
export const PNG_RENDERER = '@resvg/resvg-js';
export const PNG_HINT = `install ${PNG_RENDERER} to write PNG: npm i -g ${PNG_RENDERER}`;

/** Pixels per SVG unit when no scale is given. */
export const DEFAULT_SCALE = 2;
/** The largest scale; a larger one makes images too large to be of use. */
export const MAX_SCALE = 8;

/** The part of @resvg/resvg-js this module uses. */
export interface ResvgModule {
  Resvg: new (
    svg: string,
    options: {
      fitTo: { mode: 'zoom'; value: number };
      background: string;
      font: { loadSystemFonts: boolean; fontDirs?: string[]; fontFiles?: string[]; defaultFontFamily?: string };
    },
  ) => { render(): { asPng(): Uint8Array } };
}

export interface PngOptions {
  /** Pixels per SVG unit; 2 by default. */
  scale?: number;
  /** The colours the picture is drawn in; light by default. */
  theme?: PngTheme;
  /** Folders of fonts to load besides the system fonts the renderer finds by itself. */
  fontDirs?: readonly string[];
}

/**
 * The fonts the renderer loads: every system font (and `dirs`), which it reads again on every call, or only `files`,
 * with `defaultFamily` for text whose families match none of them.
 */
export type PngFonts = { system: true; dirs?: readonly string[] } | { files: readonly string[]; defaultFamily?: string };

/** The font options of the renderer for `fonts`. */
function fontOptions(fonts: PngFonts): { loadSystemFonts: boolean; fontDirs?: string[]; fontFiles?: string[]; defaultFontFamily?: string } {
  if ('system' in fonts) return { loadSystemFonts: true, ...(fonts.dirs === undefined || fonts.dirs.length === 0 ? {} : { fontDirs: [...fonts.dirs] }) };
  return { loadSystemFonts: false, fontFiles: [...fonts.files], ...(fonts.defaultFamily === undefined ? {} : { defaultFontFamily: fonts.defaultFamily }) };
}

const DARK_RULES = /\n@media \(prefers-color-scheme: dark\)\{\n[\s\S]*?\n\}(?=<\/style>)/g;
const VARIABLE = /var\(--ursula-([a-z0-9-]+)\s*(?:,([^)]*))?\)/g;
const FONT_FAMILY = /font-family:([^;}"]*)/g;

const REVERSED_MARKER = /<marker id="([^"]+)"([^>]*?) orient="auto-start-reverse"([^>]*)>([\s\S]*?)<\/marker>/g;

/**
 * Markers with `orient="auto-start-reverse"` as the renderer can draw them: it does not know that value and leaves
 * such a mark unturned. At the end of a line the value is `auto`; at the start a twin turned half round its
 * reference point takes the place of the mark.
 */
function turnStartMarkers(svg: string): string {
  const ids: string[] = [];
  const fixed = svg.replace(REVERSED_MARKER, (_, id: string, before: string, after: string, body: string) => {
    const attrs = `${before}${after}`;
    const refX = /refX="([^"]+)"/.exec(attrs)?.[1] ?? '0';
    const refY = /refY="([^"]+)"/.exec(attrs)?.[1] ?? '0';
    // Turned, the mark leaves its viewBox, which a marker clips unless told not to.
    const twinAttrs = attrs.includes('overflow=') ? attrs : `${attrs} overflow="visible"`;
    ids.push(id);
    return (
      `<marker id="${id}"${before} orient="auto"${after}>${body}</marker>` +
      `<marker id="${id}-start-turned"${twinAttrs} orient="auto"><g transform="rotate(180 ${refX} ${refY})">${body}</g></marker>`
    );
  });
  return ids.reduce((text, id) => text.split(`marker-start="url(#${id})"`).join(`marker-start="url(#${id}-start-turned)"`), fixed);
}

/**
 * The SVG with every colour variable replaced by its value in `theme` and the rules for the other scheme removed:
 * what the HTML page's saving does in a browser, without one. Marks at the start of lines are turned as a browser
 * turns them. The quotes around font names go too: the renderer's style reader drops the closing quote of a quoted
 * name, and then no font of the list matches.
 */
export function bakeSvg(svg: string, theme: PngTheme): string {
  const mode = theme === 'dark' ? 1 : 0;
  return turnStartMarkers(svg)
    .replace(DARK_RULES, '')
    .replace(VARIABLE, (whole, name: string, fallback: string | undefined) => COLORS[name]?.[mode] ?? fallback?.trim() ?? whole)
    .replace(FONT_FAMILY, (_, list: string) => `font-family:${list.replace(/'/g, '')}`);

}

/** A scale is a number above 0 and at most MAX_SCALE. */
export function validScale(scale: number): boolean {
  return Number.isFinite(scale) && scale > 0 && scale <= MAX_SCALE;
}

/**
 * Draws an SVG of the engine as PNG bytes on the page colour of the theme, with `fonts` (every system font when not
 * given).
 */
export function svgToPng(svg: string, resvg: ResvgModule, opts: PngOptions & { fonts?: PngFonts } = {}): Uint8Array {
  const theme = opts.theme ?? 'light';
  const scale = opts.scale ?? DEFAULT_SCALE;
  if (!validScale(scale)) throw new RangeError(`scale must be above 0 and at most ${MAX_SCALE}; got ${scale}`);
  const drawn = new resvg.Resvg(bakeSvg(svg, theme), {
    fitTo: { mode: 'zoom', value: scale },
    background: PAPER[theme === 'dark' ? 1 : 0],
    font: fontOptions(opts.fonts ?? { system: true, ...(opts.fontDirs === undefined ? {} : { dirs: opts.fontDirs }) }),
  });
  return drawn.render().asPng();
}
