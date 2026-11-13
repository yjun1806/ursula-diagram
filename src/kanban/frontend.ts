import { configSection } from '../front/options.ts';
import { cellRuler, pixelRuler } from '../metrics.ts';
import { registerFrontEnd } from '../registry.ts';
import { renderThemedScene } from '../render/scene-svg.ts';
import { joinSpans } from '../text/terminal.ts';
import { layoutKanban } from './layout.ts';
import { parseKanban } from './parse.ts';
import { layoutKanbanText } from './text.ts';
import { titledLines, titledSpans } from '../front/title.ts';

/** The `kanban.ticketBaseUrl` setting of the options' `config`; a value that is not a string is ignored. */
function ticketBaseUrlOf(opts: object): string | undefined {
  const value = configSection('config' in opts ? opts.config : undefined, 'kanban')?.['ticketBaseUrl'];
  return typeof value === 'string' ? value : undefined;
}

/** Wraps each ticket tag that carries a `data-href` (its pill and its text) in an SVG link to that address. */
function linkTickets(svg: string): string {
  return svg.replace(/(<rect [^>]*data-href="([^"]*)"[^>]*\/>)(\s*)(<text [^>]*data-href="\2"[^>]*>[^<]*<\/text>)/g, '<a href="$2">$1$3$4</a>');
}

registerFrontEnd({
  name: 'kanban',
  headers: ['kanban'],
  svg(src, opts) {
    const layout = layoutKanban(parseKanban(src, ticketBaseUrlOf(opts)), pixelRuler(), opts.theme);
    return linkTickets(
      renderThemedScene(layout.scene, {
        ...(opts.title === undefined ? {} : { title: opts.title }),
        ...(opts.theme === undefined ? {} : { theme: opts.theme }),
        ...(opts.heading === undefined ? {} : { drawTitle: opts.heading }),
      }),
    );
  },
  textLines(src, maxWidth, opts) {
    return titledLines(layoutKanbanText(parseKanban(src, ticketBaseUrlOf(opts)), maxWidth).map(joinSpans), opts.heading, maxWidth);
  },
  textSpans(src, maxWidth, opts) {
    return titledSpans(layoutKanbanText(parseKanban(src, ticketBaseUrlOf(opts)), maxWidth), opts.heading, maxWidth);
  },
  json(src, mode, opts) {
    const model = parseKanban(src, ticketBaseUrlOf(opts));
    return { model, ...layoutKanban(model, mode === 'text' ? cellRuler() : pixelRuler(), opts.theme) };
  },
});
