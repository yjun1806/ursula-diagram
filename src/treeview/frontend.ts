import type { FrontValue } from '../front-matter.ts';
import { configSection } from '../front/options.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd, RenderOptions } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { layoutTreeView } from './layout.ts';
import { parseTreeView } from './parse.ts';
import type { IconSettings, TreeView } from './parse.ts';
import { layoutTreeViewText } from './text.ts';
import { titledLines, titledSpans } from '../front/title.ts';
import { DEFAULT_THEME } from '../render/theme.ts';

type Config = Record<string, FrontValue>;
/** Options as the registry hands them over: the render options plus the front-matter `config`. */
type Opts = RenderOptions & { config?: Config };

/** The parsed tree with the indent (`config.treeView.rowIndent`, when a number) and the icon settings of the configuration. */
function read(src: string, config: Config | undefined): TreeView {
  const tree = parseTreeView(src);
  const section = configSection(config, 'treeView');
  const indent = section?.['rowIndent'];
  const icons: IconSettings = { show: section?.['showIcons'] === true, filenames: names(section?.['filenameIcons']), extensions: names(section?.['extensionIcons']) };
  return { ...tree, ...(typeof indent === 'number' ? { rowIndent: indent } : {}), icons };
}

/** The string values of a map setting; anything else reads as an empty map. */
function names(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

export const treeViewFrontEnd: FrontEnd = {
  name: 'treeview',
  headers: ['treeView-beta', 'treeView'],
  svg(src, opts: Opts) {
    const theme = opts.theme ?? DEFAULT_THEME;
    const { scene } = layoutTreeView(read(src, opts.config), pixelRuler(), theme);
    const title = opts.title ?? opts.heading;
    return renderThemedScene(scene, { theme, ...(title === undefined ? {} : { title }), ...(opts.heading === undefined ? {} : { drawTitle: opts.heading }) });
  },
  textLines(src, maxWidth, opts) {
    return titledLines(layoutTreeViewText(parseTreeView(src), maxWidth).map(joinSpans), opts.heading, maxWidth);
  },
  textSpans(src, maxWidth, opts) {
    return titledSpans(layoutTreeViewText(parseTreeView(src), maxWidth), opts.heading, maxWidth);
  },
  json(src, mode, opts: Opts) {
    const tree = read(src, opts.config);
    return { tree, ...layoutTreeView(tree, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme ?? DEFAULT_THEME) };
  },
};

registerFrontEnd(treeViewFrontEnd);
