import type { DrawRequest } from '../command/args.ts';
import type { Host } from '../command/draw.ts';
import { drawCommand } from '../command/draw.ts';
import { fixReport } from '../command/report.ts';
import { syntaxCommand } from '../command/syntax.ts';
import { fixSource } from '../index.ts';

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: 'image/png' };

export interface ToolResult {
  content: Content[];
  isError: boolean;
}

/** A wrong argument: the server answers with a JSON-RPC error, not with a result. */
export class ArgumentError extends Error {}

const plain: DrawRequest = { format: 'text', legend: true, color: false, questions: true, elbows: true, check: false, fix: false };

const FIX = {
  type: 'boolean',
  description:
    'Fix what has one reading (a misspelt header or keyword, a flowchart ->) before drawing. The last text of the result then names each fix and gives the fixed source; keep that source in place of yours.',
} as const;

export const TOOLS = [
  {
    name: 'render',
    title: 'Draw a Mermaid diagram',
    description:
      'Draws Mermaid text. format "text" (the default) is a terminal drawing for a fixed-width font; "text-svg" is that drawing as SVG for a chat or a page; "svg" a picture; "html" one page; "png" an image (in the colours of theme) for a client that shows images, which needs the optional package @resvg/resvg-js. A text error comes back marked isError, with the line, a mark under the column, often "did you mean" and an example line; fix the text and call again. A drawing wider than width comes back as an error naming the width it needs.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'The Mermaid text, header first (for example "flowchart LR").' },
        format: { type: 'string', enum: ['text', 'text-svg', 'svg', 'html', 'png'], description: 'What to draw; text by default.' },
        theme: { type: 'string', enum: ['light', 'dark'], description: 'The colours of png; light by default.' },
        width: { type: 'integer', minimum: 1, description: 'Columns for text and text-svg; 100 by default.' },
        charset: { type: 'string', enum: ['unicode', 'ascii'], description: 'Box-drawing characters (unicode, the default) or ascii only.' },
        check: { type: 'boolean', description: "Also return the engine's check report (counts, crossing lines, questions) as a second text. The report counts the svg layout; a text drawing routes its lines on its own grid, so its crossings can differ." },
        fix: FIX,
      },
      required: ['source'],
    },
  },
  {
    name: 'check',
    title: 'Check a diagram layout',
    description:
      'Lays out Mermaid text and reports what the engine sees: one line of counts (bends, crossings), the pairs of lines that cross and the most bent lines with their source line numbers, and questions that suggest a change to the text.',
    inputSchema: { type: 'object', properties: { source: { type: 'string', description: 'The Mermaid text.' }, fix: FIX }, required: ['source'] },
  },
  {
    name: 'syntax',
    title: 'Show the syntax of a diagram type',
    description: 'Without a type: the list of diagram types and their headers. With a type (a name such as "wardley" or a header such as "sequenceDiagram"): a small example that draws and the main rules.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', description: 'A type name or a header.' } } },
  },
] as const;

const text = (t: string): { type: 'text'; text: string } => ({ type: 'text', text: t });

function source(args: Record<string, unknown>): string {
  const s = args['source'];
  if (typeof s !== 'string') throw new ArgumentError('"source" must be the Mermaid text, a string');
  return s;
}

function oneOf<T extends string>(args: Record<string, unknown>, key: string, choices: readonly T[]): T | undefined {
  const v = args[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !(choices as readonly string[]).includes(v)) throw new ArgumentError(`"${key}" must be one of ${choices.join(', ')}`);
  return v as T;
}

/** The source to draw and, with `fix: true`, the text that names the fixes; no text when nothing was fixed. */
function fixedSource(args: Record<string, unknown>): { src: string; note: Array<{ type: 'text'; text: string }> } {
  const src = source(args);
  const fix = args['fix'];
  if (fix !== undefined && typeof fix !== 'boolean') throw new ArgumentError('"fix" must be true or false');
  if (fix !== true) return { src, note: [] };
  const fixed = fixSource(src);
  if (fixed.fixes.length === 0) return { src, note: [] };
  return { src: fixed.source, note: [text(`${fixReport(fixed.fixes)}\nfixed source:\n${fixed.source}`)] };
}

/** Bytes as base64, without Node's Buffer. */
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function render(args: Record<string, unknown>, host: Host): ToolResult {
  const { src, note } = fixedSource(args);
  const format = oneOf(args, 'format', ['text', 'text-svg', 'svg', 'html', 'png'] as const) ?? 'text';
  const theme = oneOf(args, 'theme', ['light', 'dark'] as const);
  const charset = oneOf(args, 'charset', ['unicode', 'ascii'] as const);
  const width = args['width'];
  if (width !== undefined && (typeof width !== 'number' || !Number.isInteger(width) || width < 1)) throw new ArgumentError('"width" must be a whole number of columns, 1 or more');
  const check = args['check'];
  if (check !== undefined && typeof check !== 'boolean') throw new ArgumentError('"check" must be true or false');
  const terminal = format === 'text' || format === 'text-svg';
  const req: DrawRequest = {
    ...plain,
    format,
    ...(terminal ? { width: width ?? 100 } : {}),
    ...(charset === undefined ? {} : { charset }),
    ...(theme === undefined ? {} : { theme }),
    check: check === true,
  };
  const out = drawCommand(src, req, host);
  if (out.code !== 0) return { content: [text(out.stderr), ...note], isError: true };
  const drawn: Content = out.bytes === undefined ? text(out.stdout) : { type: 'image', data: base64(out.bytes), mimeType: 'image/png' };
  return { content: [drawn, ...(req.check ? [text(out.stderr)] : []), ...note], isError: false };
}

function check(args: Record<string, unknown>): ToolResult {
  const { src, note } = fixedSource(args);
  const out = drawCommand(src, { ...plain, format: 'check' });
  return out.code === 0 ? { content: [text(out.stdout), ...note], isError: false } : { content: [text(out.stderr), ...note], isError: true };
}

function syntax(args: Record<string, unknown>): ToolResult {
  const type = args['type'];
  if (type !== undefined && typeof type !== 'string') throw new ArgumentError('"type" must be a string');
  const out = syntaxCommand(type === undefined || type === '' ? [] : [type]);
  return out.code === 0 ? { content: [text(out.stdout)], isError: false } : { content: [text(out.stderr)], isError: true };
}

const CALLS: Record<string, (args: Record<string, unknown>, host: Host) => ToolResult> = { render, check, syntax };

/** Runs the tool `name`; throws ArgumentError for an unknown tool or a wrong argument. `host` gives the PNG renderer. */
export function callTool(name: unknown, args: unknown, host: Host = {}): ToolResult {
  const run = typeof name === 'string' && Object.hasOwn(CALLS, name) ? CALLS[name] : undefined;
  if (run === undefined) throw new ArgumentError(`no tool named ${JSON.stringify(name)}; the tools are render, check and syntax`);
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) throw new ArgumentError('"arguments" must be an object');
  return run((args ?? {}) as Record<string, unknown>, host);
}
