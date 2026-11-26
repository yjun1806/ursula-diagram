// Reads the options of the drawing command. Every option is in OPTIONS, so the help text and its test see them all.

export const FORMATS = ['svg', 'text', 'text-svg', 'json', 'check', 'html', 'fixed'] as const;
export type Format = (typeof FORMATS)[number];

export interface DrawRequest {
  file?: string;
  format: Format;
  width?: number;
  legend: boolean;
  color: boolean;
  charset?: 'unicode' | 'ascii';
  questions: boolean;
  elbows: boolean;
  engine?: 'grid' | 'layered';
  composition?: 'auto' | 'lanes' | 'stages';
  detail?: 'auto' | 'full' | 'narrow' | 'title';
  quality?: 'fast' | 'best';
  title?: string;
  theme?: 'auto' | 'light' | 'dark';
  /** With a drawing format: the check report as well, on standard error. */
  check: boolean;
  /** Fix what has one reading (see `fixSource`) and draw the fixed text; each fix is named on standard error. */
  fix?: boolean;
}

export interface OptionSpec {
  name: string;
  /** The word shown for the value; absent for a flag. */
  value?: string;
  choices?: readonly string[];
  help: string;
  apply(req: DrawRequest, value: string): DrawRequest | undefined;
}

const choice = <K extends keyof DrawRequest>(key: K, choices: readonly string[]) => (req: DrawRequest, v: string): DrawRequest | undefined =>
  choices.includes(v) ? { ...req, [key]: v } : undefined;

export const OPTIONS: readonly OptionSpec[] = [
  { name: '--format', value: 'F', choices: FORMATS, help: 'svg (the default), text, text-svg, html, json, check or fixed', apply: choice('format', FORMATS) },
  {
    name: '--width',
    value: 'N',
    help: 'columns for text and text-svg; fails with code 3 when the drawing cannot fit',
    apply: (req, v) => (v.trim() !== '' && Number.isFinite(Number(v)) ? { ...req, width: Number(v) } : undefined),
  },
  { name: '--fix', help: 'fix a misspelt header or keyword and a flowchart ->, draw, and name each fix on stderr', apply: (req) => ({ ...req, fix: true }) },
  { name: '--check', help: 'with a drawing format: the drawing to stdout, the check report to stderr (the report counts the svg layout)', apply: (req) => ({ ...req, check: true }) },
  { name: '--charset', value: 'C', choices: ['unicode', 'ascii'], help: 'text in box-drawing characters (unicode, the default) or ascii only', apply: choice('charset', ['unicode', 'ascii']) },
  { name: '--color', help: 'text with ANSI colours', apply: (req) => ({ ...req, color: true }) },
  { name: '--title', value: 'TEXT', help: 'the page title of html', apply: (req, v) => ({ ...req, title: v }) },
  { name: '--theme', value: 'T', choices: ['auto', 'light', 'dark'], help: 'the starting theme of html: auto (the default), light or dark', apply: choice('theme', ['auto', 'light', 'dark']) },
  { name: '--detail', value: 'D', choices: ['auto', 'full', 'narrow', 'title'], help: 'how much of each box text keeps: auto (the fullest that fits), full, narrow, title', apply: choice('detail', ['auto', 'full', 'narrow', 'title']) },
  { name: '--quality', value: 'Q', choices: ['fast', 'best'], help: 'layout effort, fast or best; pictures draw best and text fast unless told', apply: choice('quality', ['fast', 'best']) },
  { name: '--engine', value: 'E', choices: ['layered', 'grid'], help: 'the flowchart layout engine: layered (the default) or grid', apply: choice('engine', ['grid', 'layered']) },
  { name: '--composition', value: 'C', choices: ['auto', 'lanes', 'stages'], help: 'swimlanes along the flow (lanes), across it (stages), or auto', apply: choice('composition', ['auto', 'lanes', 'stages']) },
  { name: '--no-legend', help: 'no legend of line styles', apply: (req) => ({ ...req, legend: false }) },
  { name: '--no-questions', help: 'no questions in the check report', apply: (req) => ({ ...req, questions: false }) },
  { name: '--no-elbows', help: 'no one-bend lines out of the side of a box', apply: (req) => ({ ...req, elbows: false }) },
];

export const USAGE = `usage: ursula-diagram [file.mmd] ${OPTIONS.map((o) => `[${o.name}${o.value === undefined ? '' : ` ${o.choices ? o.choices.join('|') : o.value}`}]`).join(' ')}`;

export type Parsed = { kind: 'draw'; request: DrawRequest } | { kind: 'help' } | { kind: 'usage' };

export function parseDrawArgs(args: readonly string[]): Parsed {
  let req: DrawRequest = { format: 'svg', legend: true, color: false, questions: true, elbows: true, check: false, fix: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--help' || a === '-h') return { kind: 'help' };
    const spec = OPTIONS.find((o) => o.name === a);
    if (spec) {
      let value = '';
      if (spec.value !== undefined) {
        const next = args[++i];
        if (next === undefined) return { kind: 'usage' };
        value = next;
      }
      const applied = spec.apply(req, value);
      if (!applied) return { kind: 'usage' };
      req = applied;
    } else if (!a.startsWith('-') && req.file === undefined) req = { ...req, file: a };
    else return { kind: 'usage' };
  }
  return { kind: 'draw', request: req };
}
