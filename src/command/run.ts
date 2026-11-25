import { parseDrawArgs, USAGE } from './args.ts';
import type { Outcome } from './draw.ts';
import { drawCommand } from './draw.ts';
import { HELP } from './help.ts';

const usageError = (): Outcome => ({ stdout: '', stderr: `${USAGE}\nRun 'ursula-diagram --help' for more.\n`, code: 2 });

/**
 * Runs the command for `args` (without `mcp`, which serves on its own). `read` returns the text of a file, or of
 * standard input when given no path.
 */
export function runCommand(args: readonly string[], read: (file?: string) => string): Outcome {
  const parsed = parseDrawArgs(args);
  if (parsed.kind === 'help') return { stdout: HELP, stderr: '', code: 0 };
  if (parsed.kind === 'usage') return usageError();
  const req = parsed.request;
  let src: string;
  try {
    src = read(req.file);
  } catch (err) {
    const why = err instanceof Error && 'code' in err ? ` (${String(err.code)})` : '';
    return { stdout: '', stderr: `error: cannot read ${req.file ?? 'standard input'}${why}\n`, code: 2 };
  }
  return drawCommand(src, req);
}
