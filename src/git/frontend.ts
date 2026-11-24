import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import type { FrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { layoutGit } from './layout.ts';
import { parseGit } from './parse.ts';
import { gitTextLines } from './text.ts';

export const gitFrontEnd: FrontEnd = {
  name: 'git',
  headers: ['gitGraph', 'gitGraph:', 'gitgraph', 'gitgraph:', 'GitGraph', 'GitGraph:'],
  svg(src, opts) {
    const layout = layoutGit(parseGit(src, opts.heading, opts.config), pixelRuler());
    return renderThemedScene(layout.scene, opts.title === undefined ? {} : { title: opts.title });
  },
  textLines(src, maxWidth, opts) {
    return gitTextLines(parseGit(src, opts.heading, opts.config), maxWidth);
  },
  json(src, mode, opts) {
    const graph = parseGit(src, opts.heading, opts.config);
    return { graph, ...layoutGit(graph, mode === 'text' ? cellRuler() : pixelRuler()) };
  },
};

registerFrontEnd(gitFrontEnd);
