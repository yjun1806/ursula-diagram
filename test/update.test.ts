import { describe, expect, it } from 'vitest';
import type { Install, UpdateHost } from '../src/command/update.ts';
import { compareVersions, LATEST_URL, updateCommand, updateCommandOf } from '../src/command/update.ts';
import { detectInstall } from '../src/node/install.ts';

const answer = (body: unknown, status = 200): UpdateHost['fetch'] => async () => ({ ok: status === 200, status, json: async () => body });
const host = (fetch: UpdateHost['fetch'], install: Install = { kind: 'global', manager: 'npm' }, version = '0.2.2'): UpdateHost => ({ fetch, install: () => install, version });

describe('update', () => {
  it('asks the latest version of the registry with a time limit', async () => {
    const asked: { url: string; signal: AbortSignal }[] = [];
    const fetch: UpdateHost['fetch'] = async (url, init) => {
      asked.push({ url, signal: init.signal });
      return { ok: true, status: 200, json: async () => ({ version: '0.2.2' }) };
    };
    await updateCommand([], host(fetch));
    expect(asked.map((a) => a.url)).toEqual([LATEST_URL]);
    expect(asked[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('0 and says so when the installed version is the latest', async () => {
    const out = await updateCommand([], host(answer({ version: '0.2.2' })));
    expect(out).toEqual({ stdout: 'ursula-diagram 0.2.2 is up to date\n', stderr: '', code: 0 });
  });

  it('0 when the installed version is newer than the registry', async () => {
    expect((await updateCommand([], host(answer({ version: '0.2.1' })))).code).toBe(0);
  });

  it('1 with the command for each way of installing, and runs nothing without --yes', async () => {
    const cases: [Install, string][] = [
      [{ kind: 'global', manager: 'npm' }, 'npm install -g ursula-diagram@latest'],
      [{ kind: 'global', manager: 'pnpm' }, 'pnpm add -g ursula-diagram@latest'],
      [{ kind: 'global', manager: 'bun' }, 'bun add -g ursula-diagram@latest'],
      [{ kind: 'project', manager: 'npm', root: '/work/app' }, 'npm install ursula-diagram@latest'],
      [{ kind: 'project', manager: 'pnpm', root: '/work/app' }, 'pnpm add ursula-diagram@latest'],
      [{ kind: 'skill' }, 'npx skills update'],
      [{ kind: 'npx' }, 'npx ursula-diagram@latest'],
      [{ kind: 'unknown' }, 'npm install -g ursula-diagram@latest'],
    ];
    for (const [install, command] of cases) {
      const out = await updateCommand([], host(answer({ version: '0.2.3' }), install));
      expect(out.code).toBe(1);
      expect(out.run).toBeUndefined();
      expect(out.stdout).toMatch(/^ursula-diagram 0\.2\.3 is available \(you have 0\.2\.2\)\n/);
      expect(out.stdout).toContain(`  ${command}\n`);
    }
    const skill = await updateCommand([], host(answer({ version: '0.2.3' }), { kind: 'skill' }));
    expect(skill.stdout).toContain('npx skills add yjun1806/ursula-diagram');
    const project = await updateCommand([], host(answer({ version: '0.2.3' }), { kind: 'project', manager: 'npm', root: '/work/app' }));
    expect(project.stdout).toContain('/work/app');
  });

  it('with --yes or -y hands back the command of a global install to run', async () => {
    for (const flag of ['--yes', '-y']) {
      const out = await updateCommand([flag], host(answer({ version: '0.2.3' }), { kind: 'global', manager: 'pnpm' }));
      expect(out.code).toBe(0);
      expect(out.run).toEqual(['pnpm', 'add', '-g', 'ursula-diagram@latest']);
      expect(out.stdout).toContain('running: pnpm add -g ursula-diagram@latest');
    }
  });

  it('with --yes only prints the command of a project, skill or npx copy', async () => {
    for (const install of [{ kind: 'project', manager: 'npm', root: '/a' }, { kind: 'skill' }, { kind: 'npx' }, { kind: 'unknown' }] as Install[]) {
      const out = await updateCommand(['--yes'], host(answer({ version: '0.2.3' }), install));
      expect(out.code).toBe(1);
      expect(out.run).toBeUndefined();
    }
  });

  it('with --yes runs nothing when up to date', async () => {
    const out = await updateCommand(['--yes'], host(answer({ version: '0.2.2' })));
    expect(out.code).toBe(0);
    expect(out.run).toBeUndefined();
  });

  it('5 when the registry fails, times out or answers without a version', async () => {
    const fails: UpdateHost['fetch'][] = [
      async () => {
        throw new TypeError('fetch failed');
      },
      async () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
      answer({}, 503),
      answer({ name: 'ursula-diagram' }),
      answer('not json'),
    ];
    for (const fetch of fails) {
      const out = await updateCommand([], host(fetch));
      expect(out.code).toBe(5);
      expect(out.stdout).toBe('');
      expect(out.stderr).toMatch(/^error: cannot reach the npm registry \(.+\)\n$/);
    }
    const timeout = await updateCommand([], host(fails[1] as UpdateHost['fetch']));
    expect(timeout.stderr).toContain('no answer in 5 s');
  });

  it('2 for anything but --yes, without asking the registry', async () => {
    let asked = false;
    const out = await updateCommand(['--force'], host(async () => {
      asked = true;
      return { ok: true, status: 200, json: async () => ({ version: '9.9.9' }) };
    }));
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('usage: ursula-diagram update [--yes]');
    expect(asked).toBe(false);
  });

  it('--help says that only update uses the network', async () => {
    const out = await updateCommand(['--help'], host(answer({ version: '0.2.2' })));
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('only command that uses the network');
  });
});

describe('compareVersions', () => {
  it('compares x.y.z by number', () => {
    expect(compareVersions('0.2.2', '0.2.10')).toBe(-1);
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });
});

describe('updateCommandOf', () => {
  it('has one command for every install but an unknown one', () => {
    expect(updateCommandOf({ kind: 'unknown' })).toBeUndefined();
  });
});

describe('detectInstall', () => {
  const roots = { npm: '/usr/local/lib/node_modules', pnpm: '/home/u/.local/share/pnpm/global/5/node_modules', bun: '/home/u/.bun/install/global/node_modules' };
  const cmd = 'ursula-diagram/skills/ursula/scripts/ursula.mjs';
  const none = () => false;

  it('a global npm, pnpm or bun install by its global folder', () => {
    expect(detectInstall(`${roots.npm}/${cmd}`, () => roots, none)).toEqual({ kind: 'global', manager: 'npm' });
    expect(detectInstall(`${roots.pnpm}/.pnpm/ursula-diagram@0.2.2/node_modules/${cmd}`, () => roots, none)).toEqual({ kind: 'global', manager: 'pnpm' });
    expect(detectInstall(`${roots.bun}/${cmd}`, () => roots, none)).toEqual({ kind: 'global', manager: 'bun' });
  });

  it('the npx cache before any global folder', () => {
    let asked = false;
    const out = detectInstall(`/home/u/.npm/_npx/1a2b3c/node_modules/${cmd}`, () => {
      asked = true;
      return roots;
    }, none);
    expect(out).toEqual({ kind: 'npx' });
    expect(asked).toBe(false);
  });

  it('a project install, with the package manager of its lockfile', () => {
    expect(detectInstall(`/work/app/node_modules/${cmd}`, () => roots, none)).toEqual({ kind: 'project', manager: 'npm', root: '/work/app' });
    expect(detectInstall(`/work/app/node_modules/.pnpm/ursula-diagram@0.2.2/node_modules/${cmd}`, () => roots, (p) => p === '/work/app/pnpm-lock.yaml')).toEqual({
      kind: 'project',
      manager: 'pnpm',
      root: '/work/app',
    });
    expect(detectInstall(`/work/app/node_modules/${cmd}`, () => roots, (p) => p === '/work/app/bun.lock')).toMatchObject({ manager: 'bun' });
    expect(detectInstall(`/work/app/node_modules/${cmd}`, () => roots, (p) => p === '/work/app/yarn.lock')).toMatchObject({ manager: 'yarn' });
  });

  it('a project install when no global folder is known', () => {
    expect(detectInstall(`/work/app/node_modules/${cmd}`, () => ({}), none)).toMatchObject({ kind: 'project' });
  });

  it('the agent skill outside any node_modules', () => {
    expect(detectInstall('/home/u/.claude/skills/ursula/scripts/ursula.mjs', () => roots, none)).toEqual({ kind: 'skill' });
    expect(detectInstall('/home/u/.agents/skills/ursula/scripts/ursula.mjs', () => roots, none)).toEqual({ kind: 'skill' });
  });

  it('unknown for anything else, such as the sources', () => {
    expect(detectInstall('/work/ursula-diagram/src/cli.ts', () => roots, none)).toEqual({ kind: 'unknown' });
  });
});
