// Draws the agent's loop of the home page (.vitepress/theme/home/loop.js) with the engine the site serves
// (public/ursula.global.js) into public/assets/loop.svg and ko-loop.svg. Run by scripts/prepare.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { LOOP } from '../.vitepress/theme/home/loop.js';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');

export function renderLoop() {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(join(site, 'public', 'ursula.global.js'), 'utf8'), context);
  const engine = context.ursula;
  writeFileSync(join(site, 'public', 'assets', 'loop.svg'), engine.render(LOOP.en));
  writeFileSync(join(site, 'public', 'assets', 'ko-loop.svg'), engine.render(LOOP.ko));
}
