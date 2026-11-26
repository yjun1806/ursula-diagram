// `npm run docs:sync`: redraws every output the repository keeps as a file with the built command (build it first:
// npx -y bun@1 scripts/build.ts): the output fences of the READMEs (scripts/docs/readme.mjs) and the pictures of
// scripts/docs/sources.mjs. test/docs.test.ts fails when any of them differs from what the command draws.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './docs/cli.mjs';
import { READMES, syncReadme } from './docs/readme.mjs';
import { PICTURES, drawPicture } from './docs/sources.mjs';

let changed = 0;
const write = (path, text) => {
  const file = join(ROOT, path);
  if (readFileSync(file, 'utf8') === text) return;
  writeFileSync(file, text);
  changed++;
  console.log(`rewrote ${path}`);
};

for (const name of READMES) write(name, syncReadme(readFileSync(join(ROOT, name), 'utf8'), name));
for (const picture of PICTURES) write(picture.path, drawPicture(picture));
console.log(changed ? `${changed} files rewritten` : 'every output is up to date');
