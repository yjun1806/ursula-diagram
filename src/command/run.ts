import { VERSION } from '../version.ts';
import { parseDrawArgs, USAGE } from './args.ts';
import type { Host, Outcome } from './draw.ts';
import { drawCommand } from './draw.ts';
import { HELP } from './help.ts';
import { syntaxCommand } from './syntax.ts';

const usageError = (): Outcome => ({ stdout: '', stderr: `${USAGE}\nRun 'ursula-diagram --help' for more.\n`, code: 2 });

/** Where the command runs: the PNG renderer, and whether standard output is a terminal. */
export interface CommandHost extends Host {
  stdoutIsTty?: boolean;
}

/**
 * Runs the command for `args` (without `mcp`, which serves on its own). `read` returns the text of a file, or of
 * standard input when given no path.
 */
export function runCommand(args: readonly string[], read: (file?: string) => string, host: CommandHost = {}): Outcome {
  if (args[0] === 'syntax') return syntaxCommand(args.slice(1));
  const parsed = parseDrawArgs(args);
  if (parsed.kind === 'help') return { stdout: HELP, stderr: '', code: 0 };
  if (parsed.kind === 'version') return { stdout: `${VERSION}\n`, stderr: '', code: 0 };
  if (parsed.kind === 'usage') return usageError();
  const req = parsed.request;
  // A PNG is bytes; a terminal would show them as noise.
  if (req.format === 'png' && host.stdoutIsTty === true) return { stdout: '', stderr: 'error: a PNG is not for the terminal; redirect to a file: > out.png\n', code: 2 };
  let src: string;
  try {
    src = read(req.file);
  } catch (err) {
    const why = err instanceof Error && 'code' in err ? ` (${String(err.code)})` : '';
    return { stdout: '', stderr: `error: cannot read ${req.file ?? 'standard input'}${why}\n`, code: 2 };
  }
  return drawCommand(src, req, host);
}
