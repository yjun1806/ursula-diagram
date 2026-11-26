import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCommand } from './command/run.ts';
import { lineSplitter, messageLine } from './mcp/lines.ts';
import { answerLine } from './mcp/server.ts';
import { extraFontDirs } from './node/font-dirs.ts';
import type { ResvgModule } from './render/png.ts';
import { PNG_RENDERER } from './render/png.ts';

/** The folder of global packages, from npm itself; undefined when npm cannot say. */
function globalPackages(): string | undefined {
  const windows = process.platform === 'win32';
  const npm = spawnSync(windows ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: windows });
  const dir = npm.status === 0 ? npm.stdout.trim() : '';
  return dir === '' ? undefined : dir;
}

const besides = (dir: string): string => pathToFileURL(join(dir, 'package.json')).href;

/**
 * The optional PNG renderer, looked for beside this command, then in the current project, then among the global
 * packages: a command run from a copied skill sits apart from any node_modules.
 */
function loadPng(): ResvgModule | undefined {
  const places = [() => import.meta.url, () => besides(process.cwd()), () => {
    const dir = globalPackages();
    return dir === undefined ? undefined : besides(dir);
  }];
  for (const place of places) {
    const from = place();
    if (from === undefined) continue;
    try {
      return createRequire(from)(PNG_RENDERER) as ResvgModule;
    } catch {
      // Not there; try the next place.
    }
  }
  return undefined;
}

const args = process.argv.slice(2);
if (args[0] === 'mcp' && args.length === 1) {
  // MCP over standard input and output: everything written to standard output is a protocol message.
  const host = { loadPng, fontDirs: extraFontDirs() };
  const lines = lineSplitter((line) => {
    if (line.trim() === '') return;
    const out = answerLine(line, host);
    if (out !== undefined) process.stdout.write(messageLine(out));
  });
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => lines.push(chunk));
  process.stdin.on('end', () => lines.end());
} else {
  const out = runCommand(args, (file) => readFileSync(file ?? 0, 'utf8'), { loadPng, fontDirs: extraFontDirs(), stdoutIsTty: process.stdout.isTTY === true });
  if (out.bytes !== undefined) process.stdout.write(out.bytes);
  else if (out.stdout !== '') process.stdout.write(out.stdout);
  if (out.stderr !== '') process.stderr.write(out.stderr);
  process.exitCode = out.code;
}
