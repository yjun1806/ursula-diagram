import { cellWidth } from '../metrics.ts';
import type { SourceFix } from '../errors/fix.ts';
import { UrsulaError } from '../types.ts';

/** The lines the command writes for a text error: the message, then the line with a mark under the column, then the advice. */
export function errorReport(err: UrsulaError, src: string): string {
  const out = [`error: ${err.message}`];
  const row = err.line === undefined ? undefined : src.split(/\r?\n/)[err.line - 1];
  if (err.line !== undefined && row !== undefined && row.trim() !== '') {
    const gutter = String(err.line);
    out.push(`  ${gutter} | ${row}`);
    if (err.column !== undefined) {
      const before = row.slice(0, err.column - 1);
      const run = /^\S+/.exec(row.slice(err.column - 1))?.[0] ?? '';
      const marks = Math.max(1, cellWidth(run));
      out.push(`  ${' '.repeat(gutter.length)} | ${' '.repeat(cellWidth(before))}${'^'.repeat(marks)}`);
    }
  }
  if (err.suggestion !== undefined) out.push(`did you mean: ${err.suggestion}`);
  if (err.hint !== undefined) out.push(`hint: ${err.hint}`);
  if (err.example !== undefined) out.push(`example: ${err.example}`);
  return `${out.join('\n')}\n`;
}

export const ISSUES = 'https://github.com/yjun1806/ursula-diagram/issues';

/** The lines for a failure inside the engine: not something a change of text is sure to fix. */
export function internalReport(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `error: internal: ${message}\nThis is a fault in ursula-diagram, not in the text. Please report it with the diagram text: ${ISSUES}\n`;
}

/** One line for each fix `fixSource` made: `fixed: line 1: flowchrt → flowchart`. */
export function fixReport(fixes: readonly SourceFix[]): string {
  return fixes.map((f) => `fixed: line ${f.line}: ${f.from} → ${f.to}\n`).join('');
}
