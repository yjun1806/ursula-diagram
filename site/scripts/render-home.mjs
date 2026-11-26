// Draws what the home page shows with this checkout's command, so the page never shows a pasted output:
// - .vitepress/theme/home/outputs.json: the hero's terminal drawings at both widths and what each agent card's command
//   prints, run on the hero's text as order.mmd (scripts/docs/commands.mjs runs them as a reader would);
// - public/assets/: every picture of scripts/docs/sources.mjs that the site shows.
// Run by scripts/prepare.mjs. A command that ends with another code than its card expects stops the build.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliOutput } from '../../scripts/docs/cli.mjs';
import { runShell, shimFolder } from '../../scripts/docs/commands.mjs';
import { PICTURES, drawPicture } from '../../scripts/docs/sources.mjs';
import { CARDS } from '../.vitepress/theme/home/agents.js';
import { SOURCE, WIDTHS } from '../.vitepress/theme/home/sample.js';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUTS = join(site, '.vitepress', 'theme', 'home', 'outputs.json');

/** The first `head` lines of `text`, '  ...', and the first line holding `rule`, cut after its first clause. */
function shorten(text, head, rule) {
  const lines = text.split('\n');
  const found = lines.find((l) => l.includes(rule));
  if (!found) throw new Error(`no line of the output holds ${rule}`);
  const clause = found.indexOf(';');
  return [...lines.slice(0, head), '  ...', clause === -1 ? found : `${found.slice(0, clause)}; ...`].join('\n');
}

/** What the home page shows: { terminal: { wide, narrow }, cards: { <id>: output } }. */
export function homeOutputs() {
  const terminal = Object.fromEntries(
    Object.entries(WIDTHS).map(([name, width]) => [name, { width, text: cliOutput(['--format', 'text', '--width', String(width)], `${SOURCE}\n`, 0, `home ${name}`) }]),
  );
  const cards = {};
  const bin = shimFolder();
  const cwd = mkdtempSync(join(tmpdir(), 'ursula-home-'));
  try {
    for (const card of CARDS) {
      if (card.run === false) continue;
      const out = runShell(card.commands.join('\n'), { cwd, bin });
      const exit = card.exit ?? 0;
      if (out.code !== exit) throw new Error(`home card ${card.id}: ended with ${out.code}, not ${exit}\n${out.stderr}`);
      const text = [out.stdout, out.stderr].map((s) => s.replace(/[ \t]+$/gm, '').trimEnd()).filter(Boolean).join('\n');
      cards[card.id] = card.head ? shorten(text, card.head, card.rule) : text;
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  }
  return { terminal, cards };
}

export function renderHome() {
  writeFileSync(OUTPUTS, `${JSON.stringify(homeOutputs(), null, 2)}\n`);
  const shown = PICTURES.filter((p) => p.site);
  for (const p of shown) writeFileSync(join(site, 'public', 'assets', p.site), drawPicture(p));
  console.log(`drew the home page's outputs and ${shown.length} pictures`);
}
