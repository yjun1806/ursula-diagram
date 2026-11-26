// The outputs pasted into the READMEs, which GitHub and npm show as they are. A fence right after a line
//   <!-- ursula-output --format text --width 80 -->
// holds what the command prints for those arguments, given the nearest Mermaid fence above it as its input.
// `npm run docs:sync` rewrites those fences; test/docs.test.ts fails when one differs from what the command prints.
import { cliOutput, parseOutputInfo } from './cli.mjs';
import { isMermaid } from '../../site/.vitepress/mermaid-fence.mjs';

export const READMES = ['README.md', 'README.ko.md'];

const MARK = /^<!--\s*ursula-output\b(.*?)-->\s*$/;
const FENCE = /^(`{3,})/;

/** Every fence of a Markdown text: { open, close, info, body } with line indexes. */
function fences(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FENCE);
    if (!m) continue;
    const close = lines.findIndex((l, j) => j > i && l.trim() === m[1]);
    if (close === -1) break;
    out.push({ open: i, close, info: lines[i].slice(m[1].length).trim(), body: lines.slice(i + 1, close).join('\n') });
    i = close;
  }
  return out;
}

/** The output fences of a README: where each is, what it holds and what the command prints for it now. */
export function readmeOutputs(text, name = 'README') {
  const lines = text.split('\n');
  const all = fences(lines);
  const blocks = [];
  for (const [n, f] of all.entries()) {
    const mark = lines[f.open - 1]?.match(MARK);
    if (!mark) continue;
    const input = all.slice(0, n).reverse().find((g) => isMermaid(g.body));
    if (!input) throw new Error(`${name}:${f.open}: no Mermaid fence above the output`);
    const { settings, args } = parseOutputInfo(mark[1].trim());
    const expected = cliOutput(args, `${input.body}\n`, Number(settings.exit ?? 0), `${name}:${f.open}`);
    blocks.push({ line: f.open + 1, args, open: f.open, close: f.close, current: f.body, expected });
  }
  return blocks;
}

/** The README with every output fence holding what the command prints now. */
export function syncReadme(text, name) {
  const lines = text.split('\n');
  for (const b of readmeOutputs(text, name).reverse()) lines.splice(b.open + 1, b.close - b.open - 1, ...b.expected.split('\n'));
  return lines.join('\n');
}
