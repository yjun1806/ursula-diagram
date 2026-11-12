import type { FrontValue } from '../front-matter.ts';
import { configSection } from '../front/options.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd, RenderOptions } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { layoutTreeView } from './layout.ts';
import { parseTreeView } from './parse.ts';
import type { TreeView } from './parse.ts';
import { layoutTreeViewText } from './text.ts';

type Config = Record<string, FrontValue>;
/** Options as the registry hands them over: the render options plus the front-matter `config`. */
type Opts = RenderOptions & { config?: Config };

/** The parsed tree with the indent the configuration asks for (`config.treeView.rowIndent`), when it is a number. */
function read(src: string, config: Config | undefined): TreeView {
  const tree = parseTreeView(src);
  const indent = configSection(config, 'treeView')?.['rowIndent'];
  return typeof indent === 'number' ? { ...tree, rowIndent: indent } : tree;
}

export const treeViewFrontEnd: FrontEnd = {
  name: 'treeview',
  headers: ['treeView-beta', 'treeView'],
  svg(src, opts: Opts) {
    const theme = opts.theme ?? 'solid';
    const { scene } = layoutTreeView(read(src, opts.config), pixelRuler(), theme);
    const title = opts.title ?? opts.heading;
    return renderThemedScene(scene, { theme, ...(title === undefined ? {} : { title }) });
  },
  textLines(src, maxWidth) {
    return layoutTreeViewText(parseTreeView(src), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth) {
    return layoutTreeViewText(parseTreeView(src), maxWidth);
  },
  json(src, mode, opts: Opts) {
    const tree = read(src, opts.config);
    return { tree, ...layoutTreeView(tree, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme ?? 'solid') };
  },
};

registerFrontEnd(treeViewFrontEnd);
