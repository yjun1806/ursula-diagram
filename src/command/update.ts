// `ursula-diagram update`: the one part of the command that uses the network. It asks the npm registry for the latest
// version, says how this copy was installed, and prints (or, with --yes, runs) the command that updates it.
import { VERSION } from '../version.ts';

export const LATEST_URL = 'https://registry.npmjs.org/ursula-diagram/latest';
export const TIMEOUT_MS = 5000;

/** How this copy of the command was installed. `root` is the project folder of a `project` install. */
export type Install =
  | { kind: 'global'; manager: 'npm' | 'pnpm' | 'bun' }
  | { kind: 'npx' }
  | { kind: 'project'; manager: 'npm' | 'pnpm' | 'bun' | 'yarn'; root: string }
  | { kind: 'skill' }
  | { kind: 'unknown' };

/** 0 up to date or updated, 1 an update is available, 2 wrong options, 5 the registry could not be reached. */
export type UpdateCode = 0 | 1 | 2 | 5;

export interface UpdateOutcome {
  stdout: string;
  stderr: string;
  code: UpdateCode;
  /** With --yes: the command to run, with inherited standard streams; the command then exits with its code. */
  run?: readonly string[];
}

/** What `update` takes from where it runs. */
export interface UpdateHost {
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  install: () => Install;
  /** The installed version; VERSION when not given. */
  version?: string;
}

export const UPDATE_USAGE = 'usage: ursula-diagram update [--yes]';

export const UPDATE_HELP = `ursula-diagram update: check npm for a newer version and print the command that installs it.

  -y, --yes   run that command too, when the package is installed globally with npm, pnpm or bun

Without --yes it changes nothing. It is the only command that uses the network; drawing never does.
Exit codes: 0 up to date or updated, 1 an update is available, 2 wrong options, 5 npm could not be reached.
`;

/** -1, 0 or 1 as `a` is older than, equal to or newer than `b`; compares the numbers of x.y.z only. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split(/[.+-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

const SPEC = 'ursula-diagram@latest';

/** The command that updates `install`, as words; undefined when there is no one command. */
export function updateCommandOf(install: Install): readonly string[] | undefined {
  switch (install.kind) {
    case 'global':
      return install.manager === 'npm' ? ['npm', 'install', '-g', SPEC] : [install.manager, 'add', '-g', SPEC];
    case 'project':
      return install.manager === 'npm' ? ['npm', 'install', SPEC] : [install.manager, 'add', SPEC];
    case 'skill':
      return ['npx', 'skills', 'update'];
    case 'npx':
      return ['npx', SPEC];
    case 'unknown':
      return undefined;
  }
}

/** What to tell the reader about updating `install`, ending with a newline. */
function howTo(install: Install, command: readonly string[] | undefined): string {
  const line = command?.join(' ');
  switch (install.kind) {
    case 'global':
      return `Installed globally with ${install.manager}. Update with:\n  ${line}\nor run 'ursula-diagram update --yes' to do it now.\n`;
    case 'project':
      return `Installed in the project ${install.root}. Update it there with:\n  ${line}\n`;
    case 'skill':
      return `Running from the agent skill. Update the skill with:\n  ${line}\nor add it again: npx skills add yjun1806/ursula-diagram\n`;
    case 'npx':
      return `Running from the npx cache. Run the latest with:\n  ${line}\n`;
    case 'unknown':
      return `Could not tell how it was installed. Install the latest with:\n  npm install -g ${SPEC}\n`;
  }
}

/** Asks the registry for the latest version; a string is the version, an Error why there is none. */
async function latestVersion(host: UpdateHost): Promise<string | Error> {
  try {
    const res = await host.fetch(LATEST_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const version = typeof body === 'object' && body !== null ? (body as { version?: unknown }).version : undefined;
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) return new Error('no version in the answer');
    return version;
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return new Error(`no answer in ${TIMEOUT_MS / 1000} s`);
    return err instanceof Error ? err : new Error(String(err));
  }
}

/** Runs `update` with `args` (the words after `update`). */
export async function updateCommand(args: readonly string[], host: UpdateHost): Promise<UpdateOutcome> {
  let yes = false;
  for (const a of args) {
    if (a === '--help' || a === '-h') return { stdout: UPDATE_HELP, stderr: '', code: 0 };
    if (a === '--yes' || a === '-y') yes = true;
    else return { stdout: '', stderr: `error: update takes no '${a}'\n${UPDATE_USAGE}\n`, code: 2 };
  }
  const have = host.version ?? VERSION;
  const latest = await latestVersion(host);
  if (latest instanceof Error) return { stdout: '', stderr: `error: cannot reach the npm registry (${latest.message})\n`, code: 5 };
  if (compareVersions(have, latest) >= 0) return { stdout: `ursula-diagram ${have} is up to date\n`, stderr: '', code: 0 };
  const install = host.install();
  const command = updateCommandOf(install);
  const status = `ursula-diagram ${latest} is available (you have ${have})\n`;
  if (yes && install.kind === 'global' && command !== undefined) return { stdout: `${status}running: ${command.join(' ')}\n`, stderr: '', code: 0, run: command };
  return { stdout: `${status}${howTo(install, command)}`, stderr: '', code: 1 };
}
