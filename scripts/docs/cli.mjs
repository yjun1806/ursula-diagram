// Runs the built command (the `ursula-diagram` bin of package.json, which `bun scripts/build.ts` writes) for the docs:
// the outputs the site and the READMEs show, and the commands they name. Plain JavaScript, so the site's build, its
// check and the tests can all import it.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The path of the built command. */
export function cliPath() {
  const { bin } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const path = join(ROOT, bin['ursula-diagram']);
  if (!existsSync(path)) throw new Error(`${path} is missing. Build it first: npx -y bun@1 scripts/build.ts`);
  return path;
}

/**
 * Runs the command with `args`, `input` on standard input, in `cwd`. Returns { stdout, stderr, code }. The terminal
 * width and colours of the machine never reach it: the output depends on the arguments alone.
 */
export function runCli(args, { input = '', cwd = ROOT } = {}) {
  const out = spawnSync(process.execPath, [cliPath(), ...args], {
    input,
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (out.error) throw out.error;
  return { stdout: out.stdout, stderr: out.stderr, code: out.status ?? 1 };
}

/** Splits `a "b c" d` into ['a', 'b c', 'd']: double and single quotes group, nothing else is special. */
export function splitArgs(text) {
  const args = [];
  for (const m of text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) args.push(m[1] ?? m[2] ?? m[3]);
  return args;
}

/**
 * Splits the info of an output block, `exit=1 input=gallery:pie --format text --width 80`, into its settings (the
 * leading `key=value` words) and the command's arguments (the rest).
 */
export function parseOutputInfo(info) {
  const words = splitArgs(info);
  const settings = {};
  while (words.length && /^[a-z]+=/.test(words[0])) {
    const [key, ...value] = words.shift().split('=');
    settings[key] = value.join('=');
  }
  return { settings, args: words };
}

/**
 * What the command prints for `args` and `input`, as a docs page shows it: standard output, then standard error, with
 * trailing spaces and blank lines removed. Throws when the exit code is not `exit` (0 unless given).
 */
export function cliOutput(args, input = '', exit = 0, where = 'a docs output') {
  const out = runCli(args, { input });
  if (out.code !== exit) {
    throw new Error(`${where}: ursula-diagram ${args.join(' ')} ended with ${out.code}, not ${exit}\n${out.stderr}`);
  }
  return [out.stdout, out.stderr]
    .map((s) => s.replace(/[ \t]+$/gm, '').trimEnd())
    .filter((s) => s !== '')
    .join('\n');
}
