// Every command the docs tell a reader to run, collected and run against this checkout's built command.
//
// A command is collected from a shell fence (bash, sh, shell, zsh, console) of a docs page, a README or a skill, from
// an inline code span that starts with `ursula-diagram`, `ursula` or `URSULA` (the skill's name for its command) and
// gives it arguments, and
// from the home page's install tabs and agent cards. A command that runs ursula is run in a fresh folder per document,
// in the order of the document, with `ursula-diagram`, `ursula` and `URSULA` (and `npx ursula-diagram`) running this
// checkout's command. A `.mmd` file it names that the document has not written yet holds the nearest Mermaid fence
// above the command, or the home page's flowchart when there is none. It must end with 0, or with the code an
// `<!-- exit N -->` line right above its fence names. Any other command must match ALLOWED, which says why it is not
// run; a command that is neither fails the check, so a new kind of command is either run or listed with a reason.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { ROOT, cliPath } from './cli.mjs';
import { SOURCE } from '../../site/.vitepress/theme/home/sample.js';
import { isMermaid } from '../../site/.vitepress/mermaid-fence.mjs';

/** The commands that are not run, and why. */
export const ALLOWED = [
  { pattern: /^(npm install|pnpm add|bun add) -g ursula-diagram$/, why: 'installs the published package from the npm registry' },
  { pattern: /^npx skills add /, why: 'installs the skill from GitHub into an agent' },
  { pattern: /^claude mcp add /, why: "changes Claude Code's configuration" },
  { pattern: /^cp -R "\$\(npm root -g\)\/ursula-diagram\/skills\/ursula" /, why: 'needs the package installed globally and writes into ~/.claude' },
  { pattern: /^npm view ursula-diagram /, why: 'asks the npm registry' },
  { pattern: /^(npm install|npm ci)$/, why: 'installs the dependencies of a checkout' },
  { pattern: /^(npx tsc --noEmit|npm test|npm run test:rewrite|npm run compare|npm run docs:sync)$/, why: 'checks or rewrites the checkout itself; CI runs the checks' },
  { pattern: /^(bun|npx -y bun@1) scripts\/build\.ts$/, why: 'builds the checkout; CI runs it' },
  { pattern: /^URSULA_UPDATE_GOLDEN=1 npx vitest /, why: 'rewrites the golden hashes of the checkout' },
  { pattern: /^cd site && /, why: 'installs, builds or serves the docs site; CI builds and checks it' },
  { pattern: /^npm run bench:(tools|browser)\b|^bash bench\//, why: 'benchmarks: downloads other tools and runs for minutes' },
  { pattern: /^python3 -I bench\//, why: 'benchmarks: reads the output of a benchmark run' },
  { pattern: /^git /, why: 'changes the branches of a checkout' },
];

/** The documents whose commands are collected, relative to the repository. */
export function documents() {
  const skip = new Set(['node_modules', '.vitepress', 'public', 'official']);
  const pages = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return skip.has(e.name) ? [] : pages(join(dir, e.name));
      return e.name.endsWith('.md') ? [relative(ROOT, join(dir, e.name))] : [];
    });
  return [...pages(join(ROOT, 'site')), 'README.md', 'README.ko.md', 'skills/ursula/SKILL.md', '.claude/skills/ursula-dev/SKILL.md', 'RELEASING.md', 'bench/README.md'];
}

const SHELL = /^(bash|sh|shell|zsh|console)\b/;
const URSULA_WORD = /(^|[|;&]\s*)(npx (-y )?)?(ursula-diagram|ursula|URSULA)(\s|$)/;
const INLINE = /^(ursula-diagram|ursula|URSULA|npx ursula-diagram)\s+\S|^cat \S+ \| (ursula-diagram|ursula|URSULA)\s/;

/** The commands of one shell fence: lines joined across `\`, `&&`, `||` and `|`, here-documents kept whole. */
export function shellCommands(text, console = false) {
  const commands = [];
  let heredoc = null;
  let joining = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (heredoc) {
      commands[commands.length - 1] += `\n${raw}`;
      if (line === heredoc) heredoc = null;
      continue;
    }
    if (!line || (line.startsWith('#') && !joining)) continue;
    if (console && !joining && !line.startsWith('$')) continue;
    const cmd = console && !joining ? line.replace(/^\$\s*/, '') : line;
    if (joining) commands[commands.length - 1] += ` ${cmd}`;
    else commands.push(cmd);
    heredoc = line.match(/<<-?\s*['"]?(\w+)['"]?/)?.[1] ?? null;
    joining = /(\\|&&|\|\||\|)$/.test(line);
  }
  return commands;
}

/** The commands of a Markdown document, in order: { command, exit, line, sample }. */
export function markdownCommands(text) {
  const lines = text.split('\n');
  const out = [];
  let sample = null;
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^\s*(`{3,})(.*)$/);
    if (open) {
      const close = lines.findIndex((l, j) => j > i && l.trim() === open[1]);
      const end = close === -1 ? lines.length : close;
      const body = lines.slice(i + 1, end).map((l) => l.replace(new RegExp(`^${lines[i].match(/^\s*/)[0]}`), '')).join('\n');
      const lang = open[2].trim();
      if (SHELL.test(lang)) {
        const above = lines.slice(0, i).reverse().find((l) => l.trim() !== '' && !/^:::|^<div|^<\/div/.test(l.trim()));
        const exit = Number(above?.match(/^<!--\s*exit\s+(\d+)\s*-->$/)?.[1] ?? 0);
        for (const command of shellCommands(body, lang.startsWith('console'))) out.push({ command, exit, line: i + 1, sample });
      } else if (isMermaid(body)) sample = body;
      i = end;
      continue;
    }
    for (const m of lines[i].matchAll(/`([^`]+)`/g)) {
      const span = m[1].trim();
      if (INLINE.test(span) && !/[<>…]|\.\.\./.test(span.replace(/ > \S+$/, ''))) out.push({ command: span, exit: 0, line: i + 1, sample });
    }
  }
  return out;
}

/** Whether `command` runs ursula, is allowed without running, or is neither. */
export function classify(command) {
  const allowed = ALLOWED.find((a) => a.pattern.test(command));
  if (allowed) return { kind: 'allowed', why: allowed.why };
  if (/^cat > \S+\.mmd <</.test(command) || URSULA_WORD.test(command)) return { kind: 'run' };
  return { kind: 'unknown' };
}

/** A new folder with `ursula-diagram`, `ursula` and `URSULA` running this checkout's command; remove it after use. */
export function shimFolder() {
  const dir = mkdtempSync(join(tmpdir(), 'ursula-docs-bin-'));
  for (const name of ['ursula-diagram', 'ursula', 'URSULA']) {
    const path = join(dir, name);
    writeFileSync(path, `#!/bin/sh\nexec "${process.execPath}" "${cliPath()}" "$@"\n`);
    chmodSync(path, 0o755);
  }
  return dir;
}

/**
 * Runs `command` with sh in `cwd`, with this checkout's command first on the path. Writes every `.mmd` file it names
 * that is not in `cwd` yet, holding `sample`. Returns { code, stdout, stderr }.
 */
export function runShell(command, { cwd, bin, sample = SOURCE }) {
  for (const [file] of command.matchAll(/[\w./-]+\.mmd\b/g)) {
    const path = join(cwd, file);
    if (!existsSync(path) && !new RegExp(`cat > ${file.replace(/\./g, '\\.')} <<`).test(command)) {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, `${sample.trimEnd()}\n`);
    }
  }
  const run = command.replace(/(^|[|;&]\s*)npx (-y )?ursula-diagram\b/g, '$1ursula-diagram');
  const out = spawnSync('sh', ['-c', run], {
    cwd,
    encoding: 'utf8',
    input: '',
    timeout: 30000,
    env: { PATH: `${bin}:${process.env.PATH ?? ''}`, HOME: cwd, NO_COLOR: '1' },
  });
  return { code: out.status ?? 1, stdout: out.stdout ?? '', stderr: out.stderr ?? (out.error ? String(out.error) : '') };
}

/**
 * Collects and runs the commands of every document and of the home page. Returns { ran, allowed, problems }: the
 * commands run, the commands not run with the reason, and one message per command that failed or is unknown.
 */
export async function checkCommands() {
  const { INSTALL } = await import('../../site/.vitepress/theme/home/install.js');
  const { CARDS } = await import('../../site/.vitepress/theme/home/agents.js');
  const groups = documents().map((doc) => ({ doc, commands: markdownCommands(readFileSync(join(ROOT, doc), 'utf8')) }));
  groups.push({ doc: 'home install tabs', commands: INSTALL.map((t) => ({ command: t.command, exit: 0, line: t.id, sample: null })) });
  groups.push({
    doc: 'home agent cards',
    commands: CARDS.flatMap((c) => c.commands.map((command) => ({ command, exit: c.exit ?? 0, line: c.id, sample: null }))),
  });
  const bin = shimFolder();
  const ran = [];
  const allowed = [];
  const problems = [];
  try {
    for (const { doc, commands } of groups) {
      const cwd = mkdtempSync(join(tmpdir(), 'ursula-docs-'));
      try {
        for (const c of commands) {
          const where = `${doc}:${c.line}`;
          const kind = classify(c.command);
          if (kind.kind === 'allowed') {
            allowed.push({ where, command: c.command, why: kind.why });
            continue;
          }
          if (kind.kind === 'unknown') {
            problems.push(`${where}: \`${c.command}\` neither runs ursula nor is in ALLOWED of scripts/docs/commands.mjs`);
            continue;
          }
          const out = runShell(c.command.replace(/\bURSULA\b/g, 'ursula'), { cwd, bin, sample: c.sample ?? SOURCE });
          ran.push({ where, command: c.command, code: out.code, ok: out.code === c.exit });
          if (out.code !== c.exit) problems.push(`${where}: \`${c.command}\` ended with ${out.code}, not ${c.exit}\n${out.stderr.trim()}`);
        }
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
  return { ran, allowed, problems };
}
