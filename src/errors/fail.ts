import { UrsulaError } from '../types.ts';

/** Stops a parser with a text error at `line` (1-based); `code` names the kind of error. */
export function fail(message: string, line: number, code = 'syntax'): never {
  throw new UrsulaError(message, code, line);
}
