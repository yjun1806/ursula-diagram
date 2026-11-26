// Node only. The font files of the system, in the order the PNG renderer loads them, with the family names of each.
// The renderer reads every file it is given on every call and cannot keep them between calls, so reading all system
// fonts costs most of the time of a PNG. This index is built once per process from the name tables alone; each PNG
// then hands the renderer only the few files its text needs.
import { existsSync, opendirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { Coverage } from './sfnt.ts';
import { fontCoverage, fontFamilies } from './sfnt.ts';

const FONT_FILE = /\.(ttf|otf|ttc|otc)$/i;

/** The folders the files of fontconfig's settings name with <dir>, following <include>; undefined without settings. */
export function fontconfigDirs(conf = '/etc/fonts/fonts.conf', home = homedir(), env: NodeJS.ProcessEnv = process.env): string[] | undefined {
  if (!existsSync(conf)) return undefined;
  const dirs: string[] = [];
  const seen = new Set<string>();
  const expand = (path: string, prefix: string | undefined, base: string): string => {
    if (path.startsWith('~')) return join(home, path.slice(1));
    if (prefix === 'xdg') return join(env['XDG_DATA_HOME'] ?? join(home, '.local/share'), path);
    if (prefix === 'relative' || !isAbsolute(path)) return resolve(base, path);
    return path;
  };
  const read = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    let stat;
    try {
      stat = statSync(file);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      const names: string[] = [];
      const dir = opendirSync(file);
      for (let entry = dir.readSync(); entry !== null; entry = dir.readSync()) if (entry.name.endsWith('.conf')) names.push(entry.name);
      dir.closeSync();
      for (const name of names.sort()) read(join(file, name));
      return;
    }
    const text = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of text.matchAll(/<(dir|include)\b([^>]*)>([^<]*)<\/\1>/g)) {
      const prefix = /prefix="([^"]*)"/.exec(m[2] ?? '')?.[1];
      const path = expand((m[3] ?? '').trim(), prefix, dirname(file));
      if (m[1] === 'dir') dirs.push(path);
      else read(path);
    }
  };
  read(conf);
  return dirs;
}

/** The folders the renderer reads the system fonts from, in its order. */
export function systemFontDirs(platform: NodeJS.Platform = process.platform, home = homedir(), env: NodeJS.ProcessEnv = process.env): string[] {
  if (platform === 'darwin') {
    let assets: string[] = [];
    try {
      const dir = opendirSync('/System/Library/AssetsV2');
      for (let entry = dir.readSync(); entry !== null; entry = dir.readSync()) if (entry.name.startsWith('com_apple_MobileAsset_Font')) assets.push(join('/System/Library/AssetsV2', entry.name));
      dir.closeSync();
    } catch {
      assets = [];
    }
    return ['/Library/Fonts', '/System/Library/Fonts', ...assets, '/Network/Library/Fonts', join(home, 'Library/Fonts')];
  }
  if (platform === 'win32') {
    const root = env['SYSTEMROOT'] ?? env['WINDIR'] ?? 'C:\\Windows';
    return [join(root, 'Fonts'), ...(env['USERPROFILE'] === undefined ? [] : [join(env['USERPROFILE'], 'AppData/Local/Microsoft/Windows/Fonts')])];
  }
  return fontconfigDirs(undefined, home, env) ?? ['/usr/share/fonts', '/usr/local/share/fonts', join(home, '.local/share/fonts')];
}

/** Every font file under `dir`, in the order the directory lists them, depth first. */
function filesUnder(dir: string, out: string[], depth = 0): void {
  if (depth > 8) return;
  let handle;
  try {
    handle = opendirSync(dir);
  } catch {
    return;
  }
  const names: string[] = [];
  for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) names.push(entry.name);
  handle.closeSync();
  for (const name of names) {
    const path = join(dir, name);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) filesUnder(path, out, depth + 1);
    else if (stat.isFile() && FONT_FILE.test(name)) out.push(path);
  }
}

export interface FontFile {
  path: string;
  /** The family names of its faces. */
  families: readonly string[];
}

export interface FontIndex {
  /** Every font file, in the order the renderer loads them. */
  files: readonly FontFile[];
  /** Lower-case family name → the name as the font writes it, and its files. */
  families: ReadonlyMap<string, { name: string; files: readonly string[] }>;
}

/** The font files under `dirs`, each read once, and their families. */
export function buildFontIndex(dirs: readonly string[]): FontIndex {
  const paths: string[] = [];
  for (const dir of dirs) filesUnder(dir, paths);
  const files: FontFile[] = [];
  const families = new Map<string, { name: string; files: string[] }>();
  for (const path of new Set(paths)) {
    const names = fontFamilies(path);
    if (names.length === 0) continue;
    files.push({ path, families: names });
    for (const name of names) {
      const lower = name.toLowerCase();
      const had = families.get(lower);
      families.set(lower, { name: had?.name ?? name, files: [...(had?.files ?? []), path] });
    }
  }
  return { files, families };
}

const indexes = new Map<string, FontIndex>();

/** The index of the system fonts and `extraDirs`, built on the first call and kept for the life of the process. */
export function systemFontIndex(extraDirs: readonly string[] = []): FontIndex {
  const dirs = [...new Set([...systemFontDirs(), ...extraDirs])];
  const key = dirs.join('\n');
  const known = indexes.get(key);
  if (known !== undefined) return known;
  const index = buildFontIndex(dirs);
  indexes.set(key, index);
  return index;
}

const coverages = new Map<string, Coverage>();

/** The characters a font file has, read on first use and kept. */
export function coverageOf(path: string): Coverage {
  const known = coverages.get(path);
  if (known !== undefined) return known;
  const coverage = fontCoverage(path);
  coverages.set(path, coverage);
  return coverage;
}
