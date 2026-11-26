// How this copy of the command was installed, from where its file lies. Used by `update` only.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import type { Install } from '../command/update.ts';

/** The folders of global packages, each undefined when that package manager cannot say or is missing. */
export interface GlobalRoots {
  npm?: string;
  pnpm?: string;
  bun?: string;
}

/** The global package folder that `tool root -g` prints; undefined when the tool is missing or fails. */
export function globalRoot(tool: 'npm' | 'pnpm'): string | undefined {
  const windows = process.platform === 'win32';
  const out = spawnSync(windows ? `${tool}.cmd` : tool, ['root', '-g'], { encoding: 'utf8', shell: windows, timeout: 5000 });
  const dir = out.status === 0 ? out.stdout.trim() : '';
  return dir === '' ? undefined : dir;
}

/** Bun keeps global packages in $BUN_INSTALL/install/global/node_modules, ~/.bun by default. */
export function bunRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.BUN_INSTALL ?? join(homedir(), '.bun'), 'install', 'global', 'node_modules');
}

const within = (file: string, dir: string | undefined): boolean => {
  if (dir === undefined || dir === '') return false;
  const d = dir.endsWith(sep) ? dir : `${dir}${sep}`;
  return file.startsWith(d);
};

/**
 * How the command at `file` (a real path, links resolved) was installed. `roots` gives the global package folders,
 * asked for only when needed; `exists` tells whether a lockfile is in a project folder.
 */
export function detectInstall(file: string, roots: () => GlobalRoots, exists: (path: string) => boolean = existsSync): Install {
  const parts = file.split(/[\\/]/);
  if (parts.includes('_npx')) return { kind: 'npx' };
  const nm = parts.lastIndexOf('node_modules');
  if (nm !== -1) {
    const r = roots();
    for (const manager of ['npm', 'pnpm', 'bun'] as const) if (within(file, r[manager])) return { kind: 'global', manager };
    // pnpm puts packages in node_modules/.pnpm/<name>@<version>/node_modules; the project is above the first node_modules.
    const first = parts.indexOf('node_modules');
    const root = parts.slice(0, first).join(sep) || sep;
    const manager = exists(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : exists(join(root, 'bun.lock')) || exists(join(root, 'bun.lockb')) ? 'bun' : exists(join(root, 'yarn.lock')) ? 'yarn' : 'npm';
    return { kind: 'project', manager, root };
  }
  if (/[\\/]skills[\\/]ursula[\\/]scripts[\\/][^\\/]+$/.test(file)) return { kind: 'skill' };
  return { kind: 'unknown' };
}

/** How the command whose file is `path` was installed, asking npm and pnpm for their global folders. */
export function installOf(path: string): Install {
  let file = path;
  try {
    file = realpathSync(path);
  } catch {
    // Keep the path as given.
  }
  const real = (dir: string | undefined): string | undefined => {
    if (dir === undefined) return undefined;
    try {
      return realpathSync(dir);
    } catch {
      return dir;
    }
  };
  return detectInstall(file, () => ({ npm: real(globalRoot('npm')), pnpm: real(globalRoot('pnpm')), bun: real(bunRoot()) }));
}
