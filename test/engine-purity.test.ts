import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('the engine', () => {
  it('uses no Node module, no Bun API and no process object, so it runs in a browser', () => {
    const root = join(import.meta.dirname, '..', 'src');
    // Node only: the command, the PNG entrance and what they share in node/.
    const nodeOnly = (file: string): boolean => file === join(root, 'cli.ts') || file === join(root, 'png.ts') || file.startsWith(join(root, 'node'));
    const found: string[] = [];
    for (const file of sources(root)) {
      if (nodeOnly(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const pattern of ["from 'node:", 'from "node:', 'Bun.', 'process.']) if (text.includes(pattern)) found.push(`${file}: ${pattern}`);
    }
    expect(found).toEqual([]);
  });
});
