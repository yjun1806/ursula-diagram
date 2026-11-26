// Builds dist/: ES modules, one global file for browsers, and the command, then the type declarations. Run with Bun.
import { mkdirSync, rmSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}dist`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

async function build(options: Parameters<typeof Bun.build>[0]): Promise<void> {
  const result = await Bun.build(options);
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

// The optional PNG renderer is never bundled: it is a native package that whoever wants PNG installs.
const external = ['@resvg/resvg-js'];
// ES modules: the entrance and the HTML entrance share their code.
await build({ entrypoints: [`${root}src/index.ts`, `${root}src/html.ts`], outdir: out, format: 'esm', target: 'browser', splitting: true, naming: { entry: '[name].js', chunk: 'chunk-[hash].js' } });
// The PNG entrance runs in Node only. It imports the entrance above at run time instead of carrying the engine again.
const engineOutside: import('bun').BunPlugin = {
  name: 'engine-outside',
  setup(b) {
    b.onResolve({ filter: /^\.\/index\.ts$/ }, () => ({ path: './index.js', external: true }));
  },
};
await build({ entrypoints: [`${root}src/png.ts`], outdir: out, format: 'esm', target: 'node', external, plugins: [engineOutside], naming: { entry: '[name].js' } });
// One file for a <script> tag; the engine is under the global `ursula`.
await build({ entrypoints: [`${root}scripts/global-entry.ts`], outdir: out, format: 'iife', target: 'browser', minify: true, naming: { entry: 'ursula.global.js' } });
// The command.
await build({ entrypoints: [`${root}src/cli.ts`], outdir: out, format: 'esm', target: 'node', external, banner: '#!/usr/bin/env node', naming: { entry: 'cli.js' } });
// The command once more as one file inside the agent skill, so that the skill runs without installing anything.
// It is left readable, since whoever installs a skill is asked to review what it runs.
const tooOld = `if (Number(process.versions.node.split('.')[0]) < 22) { console.error('ursula needs Node 22 or later; this is ' + process.version); process.exit(1); }`;
await build({ entrypoints: [`${root}src/cli.ts`], outdir: `${root}skills/ursula/scripts`, format: 'esm', target: 'node', external, banner: `#!/usr/bin/env node\n${tooOld}`, naming: { entry: 'ursula.mjs' } });

const types = Bun.spawnSync(['bun', 'x', 'tsc', '-p', `${root}tsconfig.build.json`], { stdout: 'inherit', stderr: 'inherit' });
if (types.exitCode !== 0) process.exit(types.exitCode ?? 1);
console.log('built dist/');
