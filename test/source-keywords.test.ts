import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../src', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

describe('source statements', () => {
  // Bun reads a statement that starts with `declare` as an ambient declaration and drops it, while the
  // test transformer keeps it as a call; a function named `declare` therefore works in tests and not in the build.
  it('never starts a statement with a call named declare', () => {
    const found = sources(root).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (/^\s*declare\s*\(/.test(line) ? [`${file}:${i + 1}`] : [])),
    );
    expect(found).toEqual([]);
  });
});
