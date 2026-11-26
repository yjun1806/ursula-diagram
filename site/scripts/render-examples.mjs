// Draws every file of examples/official/ with the engine the site serves (public/ursula.global.js) and writes
// public/example-svg/<type>/<name>.svg, the terminal drawing at TERM_WIDTH columns as text-svg and as plain text in
// public/example-term/<type>/<name>.svg and .txt, and .vitepress/examples/rendered.json, which the Examples pages read.
// An example the engine refuses is kept with its error message, so one failure never stops the build.
// All outputs are generated and ignored by git. Run by scripts/prepare.mjs, or alone after it.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { TYPES } from '../.vitepress/examples/types.mjs';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OFFICIAL = join(site, 'examples', 'official');
export const RENDERED = join(site, '.vitepress', 'examples', 'rendered.json');
const SVG_DIR = join(site, 'public', 'example-svg');
const TERM_DIR = join(site, 'public', 'example-term');
/** The terminal width the Examples pages draw at: the width of a common terminal window. */
export const TERM_WIDTH = 80;

const messageOf = (err) => (err && typeof err.message === 'string' ? err.message : String(err));

/**
 * The terminal drawing of `src` (unicode box characters) as text-svg, whose every character sits on its own cell, so
 * the columns hold in any browser font; and as plain text for copying. Returns { term, termWidth, termHeight,
 * termCols, termRows } or { termError }.
 */
function drawTerminal(engine, src, type, name) {
  try {
    const out = engine.renderTextSpans(src, TERM_WIDTH);
    if ('error' in out) return { termError: out.error };
    const svg = engine.spansToSvg(out.lines);
    const rows = out.lines.map((line) => line.map((s) => s.text).join('').trimEnd());
    const text = `${rows.join('\n').trimEnd()}\n`;
    writeFileSync(join(TERM_DIR, type, `${name}.svg`), svg);
    writeFileSync(join(TERM_DIR, type, `${name}.txt`), text);
    const { width, height } = sizeOf(svg);
    const termCols = Math.max(0, ...rows.map((r) => engine.cellWidth(r)));
    return { term: `/example-term/${type}/${name}`, termWidth: width, termHeight: height, termCols, termRows: rows.length };
  } catch (err) {
    return { termError: messageOf(err) };
  }
}

/** Reads width and height from the root <svg>, or from its viewBox. */
function sizeOf(svg) {
  const head = svg.slice(0, svg.indexOf('>') + 1);
  const attr = (name) => Number(head.match(new RegExp(`\\s${name}="([\\d.]+)`))?.[1]);
  let width = attr('width');
  let height = attr('height');
  if (!(width > 0 && height > 0)) {
    const box = head.match(/viewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/);
    if (box) [width, height] = [Number(box[1]), Number(box[2])];
  }
  return width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : {};
}

export function renderExamples() {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(join(site, 'public', 'ursula.global.js'), 'utf8'), context);
  const engine = context.ursula;
  if (!engine || typeof engine.render !== 'function') throw new Error('public/ursula.global.js did not define ursula.render');

  rmSync(SVG_DIR, { recursive: true, force: true });
  rmSync(TERM_DIR, { recursive: true, force: true });
  const folders = new Set(readdirSync(OFFICIAL));
  const unknown = [...folders].filter((f) => !TYPES.some((t) => t.id === f));
  if (unknown.length) throw new Error(`examples/official/ has folders not in .vitepress/examples/types.mjs: ${unknown.join(', ')}`);

  const types = TYPES.map(({ id }) => {
    if (!folders.has(id)) throw new Error(`examples/official/${id}/ is missing`);
    const names = readdirSync(join(OFFICIAL, id))
      .filter((f) => f.endsWith('.mmd'))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    mkdirSync(join(SVG_DIR, id), { recursive: true });
    mkdirSync(join(TERM_DIR, id), { recursive: true });
    const items = names.map((file) => {
      const name = file.slice(0, -'.mmd'.length);
      const src = readFileSync(join(OFFICIAL, id, file), 'utf8');
      const term = drawTerminal(engine, src, id, name);
      try {
        const svg = engine.render(src);
        if (typeof svg !== 'string' || !svg.startsWith('<svg')) throw new Error('The engine did not return an SVG.');
        writeFileSync(join(SVG_DIR, id, `${name}.svg`), svg);
        return { name, src, svg: `/example-svg/${id}/${name}.svg`, ...sizeOf(svg), ...term };
      } catch (err) {
        return { name, src, error: messageOf(err), ...term };
      }
    });
    return { id, items };
  });

  mkdirSync(dirname(RENDERED), { recursive: true });
  writeFileSync(RENDERED, JSON.stringify({ types }));
  const all = types.flatMap((t) => t.items);
  const errors = all.filter((i) => i.error).length;
  const termErrors = all.filter((i) => i.termError).length;
  console.log(`drew ${all.length - errors} of ${all.length} official examples (${errors} errors) into site/public/example-svg/`);
  console.log(`drew ${all.length - termErrors} of ${all.length} at ${TERM_WIDTH} columns (${termErrors} errors) into site/public/example-term/`);
  return types;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) renderExamples();
