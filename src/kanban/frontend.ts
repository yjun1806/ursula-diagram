import { configSection } from '../front/options.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { layoutKanban } from './layout.ts';
import { parseKanban } from './parse.ts';
import { layoutKanbanText } from './text.ts';

/** The `kanban.ticketBaseUrl` setting of the options' `config`; a value that is not a string is ignored. */
function ticketBaseUrlOf(opts: object): string | undefined {
  const value = configSection('config' in opts ? opts.config : undefined, 'kanban')?.['ticketBaseUrl'];
  return typeof value === 'string' ? value : undefined;
}

registerFrontEnd({
  name: 'kanban',
  headers: ['kanban'],
  svg(src, opts) {
    const layout = layoutKanban(parseKanban(src, ticketBaseUrlOf(opts)), pixelRuler(), opts.theme);
    return renderThemedScene(layout.scene, {
      ...(opts.title === undefined ? {} : { title: opts.title }),
      ...(opts.theme === undefined ? {} : { theme: opts.theme }),
    });
  },
  textLines(src, maxWidth, opts) {
    return layoutKanbanText(parseKanban(src, ticketBaseUrlOf(opts)), maxWidth).map(joinSpans);
  },
  textSpans(src, maxWidth, opts) {
    return layoutKanbanText(parseKanban(src, ticketBaseUrlOf(opts)), maxWidth);
  },
  json(src, mode, opts) {
    const model = parseKanban(src, ticketBaseUrlOf(opts));
    return { model, ...layoutKanban(model, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme) };
  },
});
