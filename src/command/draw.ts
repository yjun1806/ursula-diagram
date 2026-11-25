import { renderHtml } from '../html.ts';
import { checkLines, selectFrontEnd, sequenceCheckLines, spansToAnsi, spansToSvg } from '../index.ts';
import type { SequenceLayout } from '../sequence/model.ts';
import type { Layout } from '../types.ts';
import { UrsulaError } from '../types.ts';
import type { DrawRequest } from './args.ts';
import { errorReport, internalReport } from './report.ts';

/** 0 drawn, 1 the text has an error, 2 wrong options, 3 too narrow, 4 a failure inside the engine. */
export type ExitCode = 0 | 1 | 2 | 3 | 4;

export interface Outcome {
  stdout: string;
  stderr: string;
  code: ExitCode;
}

function layoutOptions(req: DrawRequest) {
  return {
    ...(req.width === undefined ? {} : { maxWidth: req.width }),
    ...(req.legend ? {} : { legend: false as const }),
    ...(req.engine === undefined ? {} : { engine: req.engine }),
    ...(req.composition === undefined ? {} : { composition: req.composition }),
    ...(req.questions ? {} : { questions: false }),
    ...(req.elbows ? {} : { elbows: false }),
    ...(req.detail === undefined ? {} : { detail: req.detail }),
    ...(req.quality === undefined ? {} : { quality: req.quality }),
    ...(req.charset === undefined ? {} : { charset: req.charset }),
  };
}

/** The lines of `--format check`. */
export function checkReport(src: string, req: DrawRequest): string {
  const laid = selectFrontEnd(src).json(src, 'svg', layoutOptions(req)) as Layout | SequenceLayout;
  const lines = 'edges' in laid && 'diagnostics' in laid ? checkLines(laid) : 'messages' in laid ? sequenceCheckLines(laid) : ['no checks for this kind of diagram'];
  return `${lines.join('\n')}\n`;
}

function drawing(src: string, req: DrawRequest): string {
  const frontEnd = selectFrontEnd(src);
  const opts = layoutOptions(req);
  const width = req.width;
  switch (req.format) {
    case 'html':
      return renderHtml(src, { ...(req.title === undefined ? {} : { title: req.title }), ...(width === undefined ? {} : { maxWidth: width }), ...(req.theme === undefined ? {} : { theme: req.theme }) });
    case 'check':
      return checkReport(src, req);
    case 'text': {
      const rows = req.color && frontEnd.textSpans ? frontEnd.textSpans(src, width, opts).map(spansToAnsi) : frontEnd.textLines(src, width, opts);
      return `${rows.join('\n')}\n`;
    }
    case 'text-svg': {
      const spans = frontEnd.textSpans ? frontEnd.textSpans(src, width, opts) : frontEnd.textLines(src, width, opts).map((text) => [{ text, tone: 'normal' as const }]);
      return `${spansToSvg(spans)}\n`;
    }
    case 'json':
      return `${JSON.stringify(frontEnd.json(src, 'svg', opts), null, 2)}\n`;
    default:
      return `${frontEnd.svg(src, opts)}\n`;
  }
}

/** Draws `src` as the request asks; never throws. */
export function drawCommand(src: string, req: DrawRequest): Outcome {
  try {
    const stdout = drawing(src, req);
    return { stdout, stderr: '', code: 0 };
  } catch (err) {
    if (err instanceof UrsulaError) return { stdout: '', stderr: errorReport(err, src), code: 1 };
    return { stdout: '', stderr: internalReport(err), code: 4 };
  }
}
