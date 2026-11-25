import { closestType, syntaxList, syntaxOf, syntaxText } from '../syntax/lookup.ts';
import type { Outcome } from './draw.ts';

/** `syntax` lists the types; `syntax <type>` prints the example and the rules of one. */
export function syntaxCommand(args: readonly string[]): Outcome {
  if (args.length > 1) return { stdout: '', stderr: "usage: ursula-diagram syntax [type]\nRun 'ursula-diagram --help' for more.\n", code: 2 };
  const type = args[0];
  if (type === undefined) return { stdout: syntaxList(), stderr: '', code: 0 };
  const entry = syntaxOf(type);
  if (entry) return { stdout: syntaxText(entry), stderr: '', code: 0 };
  const near = closestType(type);
  return { stdout: '', stderr: `error: no diagram type '${type}'\n${near === undefined ? '' : `did you mean: ${near}\n`}Run 'ursula-diagram syntax' for the list.\n`, code: 2 };
}
