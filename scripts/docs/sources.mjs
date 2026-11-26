// The Mermaid texts the docs draw, by name, and the pictures drawn from them. An input name is one of
//   home, home-ko               the home page's flowchart (site/.vitepress/theme/home/sample.js), Latin or Korean labels
//   gallery:<id>, gallery-ko:<id>  a text of the Examples page's "At a glance" (site/.vitepress/theme/playground/gallery-texts.js)
//   file:<path>                 a file of the repository
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, runCli } from './cli.mjs';
import { GALLERY_EN, GALLERY_KO } from '../../site/.vitepress/theme/playground/gallery-texts.js';
import { SOURCE, SOURCE_KO } from '../../site/.vitepress/theme/home/sample.js';

/** The Mermaid text named `name`; throws for an unknown name. */
export function inputText(name) {
  if (name === 'home') return SOURCE;
  if (name === 'home-ko') return SOURCE_KO;
  const [kind, ref] = name.split(/:(.*)/s);
  const gallery = kind === 'gallery' ? GALLERY_EN : kind === 'gallery-ko' ? GALLERY_KO : undefined;
  if (gallery) {
    if (!Object.hasOwn(gallery, ref)) throw new Error(`no gallery text named ${ref}; the texts are ${Object.keys(gallery).join(', ')}`);
    return gallery[ref];
  }
  if (kind === 'file') return readFileSync(join(ROOT, ref), 'utf8');
  throw new Error(`unknown input ${name}: use home, home-ko, gallery:<id>, gallery-ko:<id> or file:<path>`);
}

const SHOWN = ['flowchart', 'sequence', 'class', 'state', 'er', 'c4', 'mindmap', 'gantt'];
const svg = ['--format', 'svg'];

/**
 * Every picture of the docs drawn by the command: `path` is its file in the repository (the READMEs and older
 * releases link to assets/ on GitHub), `site` its name under the site's public/assets/, when the site shows it.
 */
export const PICTURES = [
  { path: 'assets/hero.svg', site: 'hero.svg', input: 'home', args: svg },
  { path: 'assets/ko-hero-text.svg', site: 'ko-hero-text.svg', input: 'home-ko', args: ['--format', 'text-svg', '--width', '80'] },
  ...SHOWN.flatMap((id) => [
    { path: `assets/${id}.svg`, site: `${id}.svg`, input: `gallery:${id}`, args: svg },
    { path: `assets/ko-${id}.svg`, site: `ko-${id}.svg`, input: `gallery-ko:${id}`, args: svg },
  ]),
  ...['c4-container', 'c4-deployment'].map((id) => ({ path: `assets/${id}.svg`, site: `${id}.svg`, input: `file:examples/${id}.mmd`, args: svg })),
  ...['order-flow', 'login-sequence', 'checkout-sequence'].flatMap((id) => [
    { path: `examples/${id}.svg`, input: `file:examples/${id}.mmd`, args: svg },
    { path: `examples/${id}.txt`, input: `file:examples/${id}.mmd`, args: ['--format', 'text', '--width', '100'] },
  ]),
];

/** The bytes of a picture as the command draws it now. */
export function drawPicture(picture) {
  const out = runCli(picture.args, { input: inputText(picture.input) });
  if (out.code !== 0) throw new Error(`${picture.path}: the command ended with ${out.code}\n${out.stderr}`);
  return out.stdout;
}
