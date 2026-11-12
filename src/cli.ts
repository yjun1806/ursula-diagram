import { readFileSync } from 'node:fs';
import { renderHtml } from './html.ts';
import { checkLines, selectFrontEnd, spansToAnsi, UrsulaError } from './index.ts';
import type { Layout } from './types.ts';

function usage(): never {
  process.stderr.write('usage: node src/cli.ts [file.mmd] [--format svg|text|json|check|html] [--width N] [--no-legend] [--color] [--engine layered|grid] [--composition auto|lanes|stages] [--no-questions] [--no-elbows] [--detail auto|full|narrow|title] [--quality fast|best] [--title TEXT] [--theme auto|light|dark]\n');
  process.exit(2);
}

const args = process.argv.slice(2);
let file: string | undefined;
let format = 'svg';
let width: number | undefined;
let legend = true;
let color = false;
let questions = true;
let elbows = true;
let engine: 'grid' | 'layered' | undefined;
let composition: 'auto' | 'lanes' | 'stages' | undefined;
let detail: 'auto' | 'full' | 'narrow' | 'title' | undefined;
let title: string | undefined;
let quality: 'fast' | 'best' | undefined;
let theme: 'auto' | 'light' | 'dark' | undefined;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--format') format = args[++i] ?? usage();
  else if (a === '--width') width = Number(args[++i] ?? usage());
  else if (a === '--no-legend') legend = false;
  else if (a === '--color') color = true;
  else if (a === '--no-questions') questions = false;
  else if (a === '--no-elbows') elbows = false;
  else if (a === '--composition') {
    const v = args[++i];
    if (v !== 'auto' && v !== 'lanes' && v !== 'stages') usage();
    composition = v;
  } else if (a === '--quality') {
    const v = args[++i];
    if (v !== 'fast' && v !== 'best') usage();
    quality = v;
  } else if (a === '--title') {
    title = args[++i] ?? usage();
  } else if (a === '--theme') {
    const v = args[++i];
    if (v !== 'auto' && v !== 'light' && v !== 'dark') usage();
    theme = v;
  } else if (a === '--detail') {
    const v = args[++i];
    if (v !== 'auto' && v !== 'full' && v !== 'narrow' && v !== 'title') usage();
    detail = v;
  } else if (a === '--engine') {
    const v = args[++i];
    if (v !== 'grid' && v !== 'layered') usage();
    engine = v;
  }
  else if (a !== undefined && !a.startsWith('--') && file === undefined) file = a;
  else usage();
}
if (!['svg', 'text', 'json', 'check', 'html'].includes(format) || (width !== undefined && !Number.isFinite(width))) usage();

try {
  const src = readFileSync(file ?? 0, 'utf8');
  const frontEnd = selectFrontEnd(src);
  const opts = { ...(width === undefined ? {} : { maxWidth: width }), ...(legend ? {} : { legend: false as const }), ...(engine === undefined ? {} : { engine }), ...(composition === undefined ? {} : { composition }), ...(questions ? {} : { questions: false }), ...(elbows ? {} : { elbows: false }), ...(detail === undefined ? {} : { detail }), ...(quality === undefined ? {} : { quality }) };
  if (format === 'html') {
    process.stdout.write(renderHtml(src, { ...(title === undefined ? {} : { title }), ...(width === undefined ? {} : { maxWidth: width }), ...(theme === undefined ? {} : { theme }) }));
  } else if (format === 'check') {
    const laid = frontEnd.json(src, 'svg', opts) as Layout;
    process.stdout.write(`${('edges' in laid && 'diagnostics' in laid ? checkLines(laid) : ['no checks for this kind of diagram']).join('\n')}\n`);
  } else if (format === 'text') {
    const rows =
      color && frontEnd.textSpans ? frontEnd.textSpans(src, width, opts).map(spansToAnsi) : frontEnd.textLines(src, width, opts);
    process.stdout.write(`${rows.join('\n')}\n`);
  } else if (format === 'json') {
    process.stdout.write(`${JSON.stringify(frontEnd.json(src, 'svg', opts), null, 2)}\n`);
  } else {
    process.stdout.write(`${frontEnd.svg(src, opts)}\n`);
  }
} catch (err) {
  if (err instanceof UrsulaError) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}
