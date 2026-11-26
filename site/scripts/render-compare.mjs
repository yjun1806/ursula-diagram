// The pictures next to the speed numbers (home page and Compared page):
// - draws the terminal text of the other tools (compare-text/*.txt, saved from their commands) and ursula's own
//   terminal drawing of the same example as text-svg, one cell per character so the columns hold in any font, into
//   public/compare-term/;
// - writes .vitepress/theme/compare/sizes.json with the width and height of every picture the grids show, so each
//   <img> has its size before it loads.
// All outputs are generated and ignored by git. Run by scripts/prepare.mjs after render-examples.mjs.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { PICTURE_PATHS, TOOLS_EXAMPLE, TOOLS_WIDTH } from '../.vitepress/theme/compare/pictures.js';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_DIR = join(site, 'compare-text');
const TERM_DIR = join(site, 'public', 'compare-term');
export const SIZES = join(site, '.vitepress', 'theme', 'compare', 'sizes.json');

/** Width and height of an SVG (its width/height attributes, else its viewBox) or of a PNG (its IHDR chunk). */
function sizeOf(file) {
  const buf = readFileSync(file);
  if (file.endsWith('.png')) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  const text = buf.toString('utf8');
  const head = text.slice(0, text.indexOf('>') + 1);
  const attr = (name) => Number(head.match(new RegExp(`\\s${name}="([\\d.]+)"`))?.[1]);
  let width = attr('width');
  let height = attr('height');
  if (!(width > 0 && height > 0)) {
    const box = head.match(/viewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/);
    if (box) [width, height] = [Number(box[1]), Number(box[2])];
  }
  if (!(width > 0 && height > 0)) throw new Error(`${file}: no width and height`);
  return { width: Math.round(width), height: Math.round(height) };
}

/** Plain text as text-svg: every line one span in the normal tone. */
const textSvg = (engine, text) =>
  engine.spansToSvg(
    text
      .replace(/\n+$/, '')
      .split('\n')
      .map((line) => [{ text: line.trimEnd(), tone: 'normal' }]),
  );

export function renderCompare() {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(join(site, 'public', 'ursula.global.js'), 'utf8'), context);
  const engine = context.ursula;

  rmSync(TERM_DIR, { recursive: true, force: true });
  mkdirSync(TERM_DIR, { recursive: true });
  for (const file of readdirSync(TEXT_DIR).filter((f) => f.endsWith('.txt'))) {
    writeFileSync(join(TERM_DIR, file.replace(/\.txt$/, '.svg')), textSvg(engine, readFileSync(join(TEXT_DIR, file), 'utf8')));
  }
  // ursula's terminal drawing of the same example at the same width, drawn by this engine and shown the same way.
  const src = readFileSync(join(site, 'examples', 'official', 'flowchart', `${TOOLS_EXAMPLE}.mmd`), 'utf8');
  const out = engine.renderTextSpans(src, TOOLS_WIDTH);
  if ('error' in out) throw new Error(`ursula could not draw ${TOOLS_EXAMPLE} as text: ${out.error}`);
  const plain = out.lines.map((line) => line.map((s) => s.text).join('')).join('\n');
  writeFileSync(join(TERM_DIR, `${TOOLS_EXAMPLE}-ursula.svg`), textSvg(engine, plain));

  const sizes = {};
  for (const path of PICTURE_PATHS) {
    const file = join(site, 'public', path);
    if (!existsSync(file)) throw new Error(`public${path} is missing; the picture grids show it`);
    sizes[path] = sizeOf(file);
  }
  writeFileSync(SIZES, `${JSON.stringify(sizes, null, 1)}\n`);
  console.log(`drew ${readdirSync(TERM_DIR).length} terminal texts into site/public/compare-term/ and sized ${PICTURE_PATHS.length} pictures`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) renderCompare();
