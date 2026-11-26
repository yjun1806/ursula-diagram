import { readFileSync } from 'node:fs';
import { runCommand } from './command/run.ts';
import { lineSplitter, messageLine } from './mcp/lines.ts';
import { answerLine } from './mcp/server.ts';

const args = process.argv.slice(2);
if (args[0] === 'mcp' && args.length === 1) {
  // MCP over standard input and output: everything written to standard output is a protocol message.
  const lines = lineSplitter((line) => {
    if (line.trim() === '') return;
    const out = answerLine(line);
    if (out !== undefined) process.stdout.write(messageLine(out));
  });
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => lines.push(chunk));
  process.stdin.on('end', () => lines.end());
} else {
  const out = runCommand(args, (file) => readFileSync(file ?? 0, 'utf8'));
  if (out.stdout !== '') process.stdout.write(out.stdout);
  if (out.stderr !== '') process.stderr.write(out.stderr);
  process.exitCode = out.code;
}
