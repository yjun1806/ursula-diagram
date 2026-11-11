import { readFileSync } from 'node:fs';
import { cellRuler, pixelRuler, layout, parse, renderSvg, renderTextLayout, UrsulaError } from './index.ts';

function usage(): never {
  process.stderr.write('usage: node src/cli.ts [file.mmd] [--format svg|text|json] [--width N]\n');
  process.exit(2);
}

const args = process.argv.slice(2);
let file: string | undefined;
let format = 'svg';
let width: number | undefined;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--format') format = args[++i] ?? usage();
  else if (a === '--width') width = Number(args[++i] ?? usage());
  else if (a !== undefined && !a.startsWith('--') && file === undefined) file = a;
  else usage();
}
if (!['svg', 'text', 'json'].includes(format) || (width !== undefined && !Number.isFinite(width))) usage();

try {
  const src = readFileSync(file ?? 0, 'utf8');
  const graph = parse(src);
  const opts = width === undefined ? {} : { maxWidth: width };
  if (format === 'text') {
    const lines = renderTextLayout(layout(graph, cellRuler(), opts));
    process.stdout.write(`${lines.join('\n')}\n`);
  } else {
    const result = layout(graph, pixelRuler(), opts);
    process.stdout.write(format === 'json' ? `${JSON.stringify(result, null, 2)}\n` : `${renderSvg(result)}\n`);
  }
} catch (err) {
  if (err instanceof UrsulaError) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}
