import { closest } from '../errors/suggest.ts';
import type { SyntaxEntry } from './entry.ts';
import { SYNTAX } from './index.ts';

/** The names of the diagram types the catalog knows, in list order. */
export function syntaxTypes(): string[] {
  return SYNTAX.map((e) => e.name);
}

/** The entry for a type name or a header, ignoring case; undefined when there is none. */
export function syntaxOf(type: string): SyntaxEntry | undefined {
  const t = type.toLowerCase();
  return SYNTAX.find((e) => e.name.toLowerCase() === t || e.headers.some((h) => h.toLowerCase() === t));
}

/** The entry of the front-end with this name. */
export function syntaxOfFrontEnd(name: string): SyntaxEntry | undefined {
  return SYNTAX.find((e) => e.name === name);
}

/** The type name or header closest to `type`, for 'did you mean'. */
export function closestType(type: string): string | undefined {
  return closest(type, SYNTAX.flatMap((e) => [e.name, ...e.headers]));
}

/** The text of `syntax <type>`: what the type is for, the example, the rules and the headers. */
export function syntaxText(e: SyntaxEntry): string {
  return [`${e.headers[0]}: ${e.summary}.`, '', e.example, '', ...e.rules.map((r) => `- ${r}`), '', `Headers: ${e.headers.join(', ')}`, ''].join('\n');
}

/** The text of `syntax` alone: one line per type. */
export function syntaxList(): string {
  const heads = SYNTAX.map((e) => e.headers.join(', '));
  const nameWidth = Math.max(...SYNTAX.map((e) => e.name.length)) + 2;
  const headWidth = Math.min(40, Math.max(...heads.map((h) => h.length))) + 2;
  const rows = SYNTAX.map((e, i) => {
    const head = heads[i] ?? '';
    return `${e.name.padEnd(nameWidth)}${head.length > headWidth - 2 ? `${head}\n${' '.repeat(nameWidth + headWidth)}` : head.padEnd(headWidth)}${e.summary}`;
  });
  return `${rows.join('\n')}\nRun 'ursula-diagram syntax <type>' for an example and the rules.\n`;
}
