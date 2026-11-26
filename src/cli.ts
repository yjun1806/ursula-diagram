import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runCommand } from './command/run.ts';
import { updateCommand } from './command/update.ts';
import { lineSplitter, messageLine } from './mcp/lines.ts';
import { answerLine } from './mcp/server.ts';
import { extraFontDirs } from './node/font-dirs.ts';
import { globalRoot, installOf } from './node/install.ts';
import { pngFonts } from './node/png-fonts.ts';
import type { ResvgModule } from './render/png.ts';
import { PNG_RENDERER } from './render/png.ts';

const besides = (dir: string): string => pathToFileURL(join(dir, 'package.json')).href;

/**
 * The optional PNG renderer, looked for beside this command, then in the current project, then among the global
 * packages: a command run from a copied skill sits apart from any node_modules.
 */
function loadPng(): ResvgModule | undefined {
  const places = [() => import.meta.url, () => besides(process.cwd()), () => {
    const dir = globalRoot('npm');
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

/** The fonts of a PNG: only the system fonts its text needs. */
const fontsFor = (svg: string) => pngFonts(svg, extraFontDirs());

const args = process.argv.slice(2);
if (args[0] === 'mcp' && args.length === 1) {
  // MCP over standard input and output: everything written to standard output is a protocol message.
  const host = { loadPng, pngFonts: fontsFor };
  const lines = lineSplitter((line) => {
    if (line.trim() === '') return;
    const out = answerLine(line, host);
    if (out !== undefined) process.stdout.write(messageLine(out));
  });
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => lines.push(chunk));
  process.stdin.on('end', () => lines.end());
} else if (args[0] === 'update') {
  // The only network access of the command: the latest version from the npm registry.
  const out = await updateCommand(args.slice(1), { fetch: (url, init) => fetch(url, init), install: () => installOf(fileURLToPath(import.meta.url)) });
  if (out.stdout !== '') process.stdout.write(out.stdout);
  if (out.stderr !== '') process.stderr.write(out.stderr);
  const run = out.run;
  if (run === undefined) process.exitCode = out.code;
  else {
    const windows = process.platform === 'win32';
    const child = spawn(windows ? `${run[0]}.cmd` : (run[0] as string), run.slice(1), { stdio: 'inherit', shell: windows });
    child.on('error', (err) => {
      process.stderr.write(`error: cannot run ${run.join(' ')}: ${err.message}\n`);
      process.exitCode = 2;
    });
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  }
} else {
  const out = runCommand(args, (file) => readFileSync(file ?? 0, 'utf8'), { loadPng, pngFonts: fontsFor, stdoutIsTty: process.stdout.isTTY === true });
  if (out.bytes !== undefined) process.stdout.write(out.bytes);
  else if (out.stdout !== '') process.stdout.write(out.stdout);
  if (out.stderr !== '') process.stderr.write(out.stderr);
  process.exitCode = out.code;
}
