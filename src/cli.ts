import { readFileSync } from 'node:fs';
import { selectFrontEnd, UrsulaError } from './index.ts';

function usage(): never {
  process.stderr.write('usage: node src/cli.ts [file.mmd] [--format svg|text|json] [--width N] [--no-legend]\n');
  process.exit(2);
}

const args = process.argv.slice(2);
let file: string | undefined;
let format = 'svg';
let width: number | undefined;
let legend = true;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--format') format = args[++i] ?? usage();
  else if (a === '--width') width = Number(args[++i] ?? usage());
  else if (a === '--no-legend') legend = false;
  else if (a !== undefined && !a.startsWith('--') && file === undefined) file = a;
  else usage();
}
if (!['svg', 'text', 'json'].includes(format) || (width !== undefined && !Number.isFinite(width))) usage();

try {
  const src = readFileSync(file ?? 0, 'utf8');
  const frontEnd = selectFrontEnd(src);
  const opts = { ...(width === undefined ? {} : { maxWidth: width }), ...(legend ? {} : { legend: false as const }) };
  if (format === 'text') {
    process.stdout.write(`${frontEnd.textLines(src, width, opts).join('\n')}\n`);
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
