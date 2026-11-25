import { readFileSync } from 'node:fs';
import { runCommand } from './command/run.ts';

const out = runCommand(process.argv.slice(2), (file) => readFileSync(file ?? 0, 'utf8'));
if (out.stdout !== '') process.stdout.write(out.stdout);
if (out.stderr !== '') process.stderr.write(out.stderr);
process.exitCode = out.code;
