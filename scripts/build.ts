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

// ES modules: the entrance and the HTML entrance share their code.
await build({ entrypoints: [`${root}src/index.ts`, `${root}src/html.ts`], outdir: out, format: 'esm', target: 'browser', splitting: true, naming: { entry: '[name].js', chunk: 'chunk-[hash].js' } });
// One file for a <script> tag; the engine is under the global `ursula`.
await build({ entrypoints: [`${root}scripts/global-entry.ts`], outdir: out, format: 'iife', target: 'browser', minify: true, naming: { entry: 'ursula.global.js' } });
// The command.
await build({ entrypoints: [`${root}src/cli.ts`], outdir: out, format: 'esm', target: 'node', banner: '#!/usr/bin/env node', naming: { entry: 'cli.js' } });

const types = Bun.spawnSync(['bun', 'x', 'tsc', '-p', `${root}tsconfig.build.json`], { stdout: 'inherit', stderr: 'inherit' });
if (types.exitCode !== 0) process.exit(types.exitCode ?? 1);
console.log('built dist/');
