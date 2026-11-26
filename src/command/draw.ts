import { renderHtml } from '../html.ts';
import { checkLines, fixSource, selectFrontEnd, sequenceCheckLines, spansToAnsi, spansToSvg } from '../index.ts';
import { checkDetails } from '../layered/details.ts';
import type { SequenceLayout } from '../sequence/model.ts';
import type { Layout } from '../types.ts';
import { UrsulaError } from '../types.ts';
import type { DrawRequest } from './args.ts';
import { errorReport, fixReport, internalReport } from './report.ts';
import { attemptWith, isTooNarrow, neededWidth, widestOf, widthHint } from './width.ts';

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

/** The last line of `--check` beside a terminal drawing of a graph: the check reads the svg layout, not the drawing. */
export const TERMINAL_NOTE = 'note: this check reads the svg layout; the terminal drawing routes its lines on a grid of its own, so its crossings and bends can differ';

/** The report on a graph; `terminal` adds TERMINAL_NOTE when the report names lines that cross or bend. */
function graphReport(laid: Layout, src: string, terminal: boolean): string[] {
  const details = checkDetails(laid, src);
  return [...checkLines(laid), ...details, ...(terminal && details.length > 0 ? [TERMINAL_NOTE] : [])];
}

/** The lines of `--format check`; see `graphReport` for `terminal`. */
export function checkReport(src: string, req: DrawRequest, terminal = false): string {
  const laid = selectFrontEnd(src).json(src, 'svg', layoutOptions(req)) as Layout | SequenceLayout;
  const lines =
    'edges' in laid && 'diagnostics' in laid
      ? graphReport(laid, src, terminal)
      : 'messages' in laid
        ? sequenceCheckLines(laid)
        : ['no checks for this kind of diagram'];
  // A front end may add notes about the text itself, such as a Gantt chart with no tasks.
  const notes = 'notes' in laid && Array.isArray(laid.notes) ? laid.notes.map((n: unknown) => `note: ${String(n)}`) : [];
  return `${[...lines, ...notes].join('\n')}\n`;
}

/** The terminal drawing as rows of plain text, and as what the command prints. */
function terminal(src: string, req: DrawRequest, width: number | undefined): { rows: string[]; out: string } {
  const frontEnd = selectFrontEnd(src);
  const opts = layoutOptions(req);
  if (req.format === 'text-svg' || (req.color && frontEnd.textSpans)) {
    const spans = frontEnd.textSpans ? frontEnd.textSpans(src, width, opts) : frontEnd.textLines(src, width, opts).map((text) => [{ text, tone: 'normal' as const }]);
    const rows = spans.map((line) => line.map((s) => s.text).join(''));
    return { rows, out: req.format === 'text-svg' ? `${spansToSvg(spans)}\n` : `${spans.map(spansToAnsi).join('\n')}\n` };
  }
  const rows = frontEnd.textLines(src, width, opts);
  return { rows, out: `${rows.join('\n')}\n` };
}

/** A terminal drawing held to `--width`: printed when it fits, else the width it needs and code 3. */
function fitted(src: string, req: DrawRequest, limit: number): Outcome {
  let drawn: { rows: string[]; out: string } | undefined;
  let refused: UrsulaError | undefined;
  try {
    drawn = terminal(src, req, limit);
    if (widestOf(drawn.rows) <= limit) return { stdout: drawn.out, stderr: '', code: 0 };
  } catch (err) {
    if (!(err instanceof UrsulaError) || !isTooNarrow(err)) throw err;
    refused = err;
  }
  const attempt = attemptWith((w) => terminal(src, req, w).rows);
  const first = drawn === undefined ? { fits: false, ...(refused?.minWidth === undefined ? {} : { minWidth: refused.minWidth }) } : { fits: false, widest: widestOf(drawn.rows) };
  const need = neededWidth(limit, first, attempt);
  const head = refused === undefined ? `error: the drawing needs ${need.sure ? '' : 'more than '}${need.sure ? need.width : need.width - 1} columns; the limit is ${limit}` : `error: ${refused.message}`;
  return { stdout: '', stderr: `${head}\n${need.sure ? widthHint(need.width) : 'hint: shorten the names, or split the diagram'}\n`, code: 3 };
}

/**
 * The report of `--check`: the same as `--format check` of the same text, whatever width the drawing was held to.
 * Beside a terminal drawing it ends with a note that it counts the svg layout.
 */
function sideReport(src: string, req: DrawRequest): string {
  const { width: _width, ...rest } = req;
  return checkReport(src, rest, req.format === 'text' || req.format === 'text-svg');
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

/** Draws `src` as the request asks; never throws. With `fix`, or format `fixed`, it first fixes what has one reading. */
export function drawCommand(src: string, req: DrawRequest): Outcome {
  if (!req.fix && req.format !== 'fixed') return drawn(src, req);
  let fixed: ReturnType<typeof fixSource>;
  try {
    fixed = fixSource(src);
  } catch (err) {
    return { stdout: '', stderr: internalReport(err), code: 4 };
  }
  const named = fixReport(fixed.fixes);
  // `fixed` prints the text, fixed as far as it goes, and says whether it draws the way `check` would.
  const out = drawn(fixed.source, req.format === 'fixed' ? { ...req, format: 'check', check: false } : req);
  return req.format === 'fixed' ? { stdout: fixed.source, stderr: `${named}${out.stderr}`, code: out.code } : { ...out, stderr: `${named}${out.stderr}` };
}

function drawn(src: string, req: DrawRequest): Outcome {
  try {
    if ((req.format === 'text' || req.format === 'text-svg') && req.width !== undefined) {
      const out = fitted(src, req, req.width);
      return out.code === 0 && req.check ? { ...out, stderr: sideReport(src, req) } : out;
    }
    const stdout = drawing(src, req);
    return { stdout, stderr: req.check && req.format !== 'check' ? sideReport(src, req) : '', code: 0 };
  } catch (err) {
    if (err instanceof UrsulaError && isTooNarrow(err)) return { stdout: '', stderr: `error: ${err.message}\n`, code: 3 };
    if (err instanceof UrsulaError) return { stdout: '', stderr: errorReport(err, src), code: 1 };
    return { stdout: '', stderr: internalReport(err), code: 4 };
  }
}
