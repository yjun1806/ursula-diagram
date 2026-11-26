import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../src/command/run.ts';
import { render } from '../src/index.ts';
import { callTool } from '../src/mcp/tools.ts';
import { buildFontIndex, fontconfigDirs, systemFontDirs } from '../src/node/font-index.ts';
import { chooseFonts, familyLists, firstFamily, NO_EAST_ASIAN, NO_FONT, textOf } from '../src/node/png-fonts.ts';
import { fontCoverage, fontFamilies } from '../src/node/sfnt.ts';
import type { ResvgModule } from '../src/render/png.ts';
import { createRequire } from 'node:module';

// Font files small enough to write by hand: a table directory, a name table and a cmap table, nothing to draw with.

interface Face {
  /** Name 1, the family. */
  family: string;
  /** Name 16, the typographic family, when the face has one. */
  typographic?: string;
  /** Another family name in another language, written before the English one. */
  localized?: string;
  /** Ranges of characters the face has, inclusive. */
  chars: ReadonlyArray<readonly [number, number]>;
  /** The cmap subtable: 12 (full Unicode, the default), 13 (ranges to one glyph, under platform 0) or 4 (16-bit). */
  cmap?: 4 | 12 | 13;
}

const u16 = (n: number): Buffer => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n & 0xffff);
  return b;
};
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
};
const utf16be = (s: string): Buffer => Buffer.from(s, 'utf16le').swap16();

function nameTable(face: Face): Buffer {
  const records: Array<{ lang: number; id: number; text: Buffer }> = [];
  if (face.localized !== undefined) records.push({ lang: 0x412, id: face.typographic === undefined ? 1 : 16, text: utf16be(face.localized) });
  records.push({ lang: 0x409, id: 1, text: utf16be(face.family) });
  if (face.typographic !== undefined) records.push({ lang: 0x409, id: 16, text: utf16be(face.typographic) });
  let offset = 0;
  const heads = records.map((r) => {
    const head = Buffer.concat([u16(3), u16(1), u16(r.lang), u16(r.id), u16(r.text.length), u16(offset)]);
    offset += r.text.length;
    return head;
  });
  return Buffer.concat([u16(0), u16(records.length), u16(6 + records.length * 12), ...heads, ...records.map((r) => r.text)]);
}

function cmapTable(face: Face): Buffer {
  if (face.cmap === 4) {
    const segs = [...face.chars, [0xffff, 0xffff] as const];
    const body = Buffer.concat([
      u16(segs.length * 2), u16(0), u16(0), u16(0),
      ...segs.map(([, end]) => u16(end)), u16(0),
      ...segs.map(([start]) => u16(start)),
      ...segs.map(([start], i) => u16(i === segs.length - 1 ? 1 : 1 - start)),
      ...segs.map(() => u16(0)),
    ]);
    const sub = Buffer.concat([u16(4), u16(6 + body.length), u16(0), body]);
    return Buffer.concat([u16(0), u16(1), u16(3), u16(1), u32(12), sub]);
  }
  const format = face.cmap ?? 12;
  const groups = face.chars.map(([start, end]) => Buffer.concat([u32(start), u32(end), u32(1)]));
  const sub = Buffer.concat([u16(format), u16(0), u32(16 + groups.length * 12), u32(0), u32(groups.length), ...groups]);
  return Buffer.concat([u16(0), u16(1), ...(format === 13 ? [u16(0), u16(4)] : [u16(3), u16(10)]), u32(12), sub]);
}

/** One face's table directory and tables, placed at `at` in the file. */
function faceBytes(face: Face, at: number): Buffer {
  const tables = [['cmap', cmapTable(face)], ['name', nameTable(face)]] as const;
  let offset = at + 12 + tables.length * 16;
  const dir = tables.map(([tag, data]) => {
    const rec = Buffer.concat([Buffer.from(tag, 'latin1'), u32(0), u32(offset), u32(data.length)]);
    offset += data.length;
    return rec;
  });
  return Buffer.concat([u32(0x00010000), u16(tables.length), u16(0), u16(0), u16(0), ...dir, ...tables.map(([, data]) => data)]);
}

function fontFile(faces: readonly Face[]): Buffer {
  if (faces.length === 1) return faceBytes(faces[0] as Face, 0);
  let at = 12 + faces.length * 4;
  const offsets: number[] = [];
  const bodies = faces.map((face) => {
    offsets.push(at);
    const body = faceBytes(face, at);
    at += body.length;
    return body;
  });
  return Buffer.concat([Buffer.from('ttcf', 'latin1'), u32(0x00010000), u32(faces.length), ...offsets.map(u32), ...bodies]);
}

const LATIN: ReadonlyArray<readonly [number, number]> = [[0x20, 0x7e]];
const HANGUL: ReadonlyArray<readonly [number, number]> = [[0xac00, 0xd7a3]];

const root = mkdtempSync(join(tmpdir(), 'ursula-fonts-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Writes the fonts into a new folder, in the order given, and returns the folder. */
function fontDir(name: string, files: Record<string, readonly Face[]>): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, faces] of Object.entries(files)) writeFileSync(join(dir, file), fontFile(faces));
  return dir;
}

describe('reading a font file', () => {
  const dir = fontDir('read', {
    'plain.ttf': [{ family: 'Plain Sans', chars: LATIN }],
    'typo.otf': [{ family: 'Typo Sans Light', typographic: 'Typo Sans', chars: LATIN }],
    'local.ttf': [{ family: 'Han Gothic', localized: '한 고딕', chars: HANGUL }],
    'pair.ttc': [{ family: 'Pair One', chars: LATIN }, { family: 'Pair Two', chars: LATIN }],
    'old.ttf': [{ family: 'Old Sans', chars: [[0x41, 0x5a], [0x2190, 0x2193]], cmap: 4 }],
    'last.otf': [{ family: 'Last Resort', chars: [[0x1f300, 0x1faff]], cmap: 13 }],
  });
  writeFileSync(join(dir, 'broken.ttf'), 'not a font');

  it('reads the family of a face', () => {
    expect(fontFamilies(join(dir, 'plain.ttf'))).toEqual(['Plain Sans']);
  });

  it('takes the typographic family over the family, as the renderer does', () => {
    expect(fontFamilies(join(dir, 'typo.otf'))).toEqual(['Typo Sans']);
  });

  it('puts the English name first, then the others', () => {
    expect(fontFamilies(join(dir, 'local.ttf'))).toEqual(['Han Gothic', '한 고딕']);
  });

  it('reads every face of a collection, the first face first', () => {
    expect(fontFamilies(join(dir, 'pair.ttc'))).toEqual(['Pair One', 'Pair Two']);
  });

  it('gives nothing for a file that is not a font, or no file', () => {
    expect(fontFamilies(join(dir, 'broken.ttf'))).toEqual([]);
    expect(fontFamilies(join(dir, 'missing.ttf'))).toEqual([]);
  });

  it('reads which characters a face has from a full Unicode cmap', () => {
    const has = fontCoverage(join(dir, 'local.ttf'));
    expect(has(0xac00)).toBe(true);
    expect(has(0xd7a3)).toBe(true);
    expect(has(0x41)).toBe(false);
    expect(has(0x1f600)).toBe(false);
  });

  it('reads which characters a face has from a 16-bit cmap', () => {
    const has = fontCoverage(join(dir, 'old.ttf'));
    expect(has(0x41)).toBe(true);
    expect(has(0x5a)).toBe(true);
    expect(has(0x2192)).toBe(true);
    expect(has(0x61)).toBe(false);
    expect(has(0xac00)).toBe(false);
  });

  it('reads which characters a last-resort face has, whole ranges to one glyph', () => {
    const has = fontCoverage(join(dir, 'last.otf'));
    expect(has(0x1f913)).toBe(true);
    expect(has(0x41)).toBe(false);
  });

  it('has no characters for a file that is not a font', () => {
    expect(fontCoverage(join(dir, 'broken.ttf'))(0x41)).toBe(false);
  });
});

describe('the font index', () => {
  const first = fontDir('index-a', { 'a.ttf': [{ family: 'Alpha Sans', chars: LATIN }] });
  const second = fontDir('index-b', { 'b.ttf': [{ family: 'Beta Sans', chars: LATIN }] });
  mkdirSync(join(second, 'nested'));
  writeFileSync(join(second, 'nested', 'c.otf'), fontFile([{ family: 'alpha sans', chars: HANGUL }]));
  writeFileSync(join(second, 'readme.txt'), 'not a font');

  it('lists the font files of the folders in their order, with their families', () => {
    // Within a folder the order is the one the file system lists, as the renderer reads it.
    const index = buildFontIndex([first, second]);
    expect(index.files[0]).toEqual({ path: join(first, 'a.ttf'), families: ['Alpha Sans'] });
    expect(index.files.slice(1)).toHaveLength(2);
    expect(index.files.slice(1)).toEqual(
      expect.arrayContaining([
        { path: join(second, 'b.ttf'), families: ['Beta Sans'] },
        { path: join(second, 'nested', 'c.otf'), families: ['alpha sans'] },
      ]),
    );
  });

  it('finds a family by its name in any case, with every file that has it', () => {
    const index = buildFontIndex([first, second]);
    expect(index.families.get('alpha sans')).toEqual({ name: 'Alpha Sans', files: [join(first, 'a.ttf'), join(second, 'nested', 'c.otf')] });
  });

  it('is empty for folders that do not exist', () => {
    expect(buildFontIndex([join(root, 'nowhere')]).files).toEqual([]);
  });
});

describe('the system font folders', () => {
  it('are those of Windows on Windows', () => {
    const dirs = systemFontDirs('win32', '/home', { SYSTEMROOT: 'C:/Windows', USERPROFILE: 'D:/Profiles/p' });
    expect(dirs).toEqual([join('C:/Windows', 'Fonts'), join('D:/Profiles/p', 'AppData/Local/Microsoft/Windows/Fonts')]);
  });

  it('start with the folders of the Mac system', () => {
    const dirs = systemFontDirs('darwin', '/home/u');
    expect(dirs.slice(0, 2)).toEqual(['/Library/Fonts', '/System/Library/Fonts']);
    expect(dirs.at(-1)).toBe('/home/u/Library/Fonts');
  });

  it('follow the <dir> and <include> of fontconfig settings', () => {
    const conf = join(root, 'fontconfig');
    mkdirSync(join(conf, 'conf.d'), { recursive: true });
    writeFileSync(
      join(conf, 'fonts.conf'),
      '<fontconfig><!-- <dir>/commented</dir> --><dir>/usr/share/fonts</dir><dir prefix="xdg">fonts</dir><dir>~/.fonts</dir><include ignore_missing="yes">conf.d</include></fontconfig>',
    );
    writeFileSync(join(conf, 'conf.d', '20-b.conf'), '<fontconfig><dir>/opt/b</dir></fontconfig>');
    writeFileSync(join(conf, 'conf.d', '10-a.conf'), '<fontconfig><dir>/opt/a</dir></fontconfig>');
    expect(fontconfigDirs(join(conf, 'fonts.conf'), '/home/u', {})).toEqual(['/usr/share/fonts', '/home/u/.local/share/fonts', '/home/u/.fonts', '/opt/a', '/opt/b']);
    expect(fontconfigDirs(join(conf, 'fonts.conf'), '/home/u', { XDG_DATA_HOME: '/data' })?.[1]).toBe('/data/fonts');
  });

  it('are unknown to fontconfig without its settings', () => {
    expect(fontconfigDirs(join(root, 'no-such.conf'))).toBeUndefined();
  });
});

describe('reading an SVG', () => {
  it('takes the text between tags, without style, title and entities', () => {
    expect(textOf('<svg><style>.a{font-family:X}</style><title>T</title><text>A &amp; B</text><text>&#xAC00;&#44033;</text></svg>')).toBe('A & B가각');
  });

  it('takes each font-family list without quotes, in lower case', () => {
    expect(familyLists(`<svg><style>.a{font-family:-apple-system, 'Helvetica Neue', sans-serif}</style><text font-family="Menlo, monospace">x</text></svg>`)).toEqual([
      ['-apple-system', 'helvetica neue', 'sans-serif'],
      ['menlo', 'monospace'],
    ]);
  });
});

describe('choosing the fonts of a PNG', () => {
  // The renderer's order: the file in the first folder comes first and is the default family.
  const lead = fontDir('choose-first', { 'a-first.ttf': [{ family: 'First Font', chars: [[0x20, 0x7e], [0xac00, 0xac00]] }] });
  const dir = fontDir('choose', {
    'b-latin.ttf': [{ family: 'Latin Sans', chars: LATIN }],
    'c-hangul.ttc': [{ family: 'Hangul Gothic', chars: [[0x20, 0x7e], ...HANGUL] }, { family: 'Hangul Gothic Bold', chars: HANGUL }],
    'd-mono.ttf': [{ family: 'Mono Code', chars: LATIN }],
    'e-arrows.ttf': [{ family: 'Arrow Symbols', chars: [[0x2190, 0x2193]] }],
  });
  const index = buildFontIndex([lead, dir]);
  const path = (file: string) => join(file === 'a-first.ttf' ? lead : dir, file);
  /** The files in the order of the index, which is the order the file system lists them. */
  const inOrder = (...files: string[]) => files.map(path).sort((a, b) => index.files.findIndex((f) => f.path === a) - index.files.findIndex((f) => f.path === b));
  const svg = (family: string, text: string) => `<svg><style>text{font-family:${family}}</style><text>${text}</text></svg>`;

  it('takes the first family of the list the system has', () => {
    expect(firstFamily(['missing', 'latin sans', 'mono code'], index)).toBe('latin sans');
    expect(chooseFonts(svg("Missing, 'Latin Sans', Mono Code", 'Hello'), index)).toEqual({ fonts: { files: [path('b-latin.ttf')], defaultFamily: 'Latin Sans' }, warnings: [] });
  });

  it('never matches a generic name, which the renderer sends to the default family', () => {
    expect(firstFamily(['sans-serif', 'monospace'], index)).toBeUndefined();
    expect(chooseFonts(svg('Missing, sans-serif', 'Hello'), index).fonts).toEqual({ files: [path('a-first.ttf')], defaultFamily: 'First Font' });
  });

  it('takes a font for each list', () => {
    const two = '<svg><style>.a{font-family:Latin Sans}.b{font-family:Mono Code}</style><text>Hi</text></svg>';
    expect(chooseFonts(two, index).fonts).toEqual({ files: inOrder('b-latin.ttf', 'd-mono.ttf'), defaultFamily: 'Latin Sans' });
  });

  it('adds the first font, in the renderer order, that has a character the chosen family lacks', () => {
    // 가 is in the first file as well as the Hangul one: the renderer falls back to the first.
    expect(chooseFonts(svg('Latin Sans', '가'), index).fonts).toEqual({ files: inOrder('a-first.ttf', 'b-latin.ttf'), defaultFamily: 'Latin Sans' });
    expect(chooseFonts(svg('Latin Sans', '각 →'), index).fonts).toEqual({ files: inOrder('b-latin.ttf', 'c-hangul.ttc', 'e-arrows.ttf'), defaultFamily: 'Latin Sans' });
  });

  it('adds nothing when the chosen family has every character', () => {
    expect(chooseFonts(svg('Hangul Gothic', 'Hi 각'), index).fonts).toEqual({ files: [path('c-hangul.ttc')], defaultFamily: 'Hangul Gothic' });
  });

  it('loads no font for a drawing without text', () => {
    expect(chooseFonts('<svg><style>text{font-family:Latin Sans}</style><rect/></svg>', index)).toEqual({ fonts: { files: [] }, warnings: [] });
  });

  it('warns when no font has a Korean, Chinese or Japanese character, and draws the rest', () => {
    const out = chooseFonts(svg('Latin Sans', 'Hi 一 あ'), index);
    expect(out.warnings).toEqual([NO_EAST_ASIAN]);
    expect(out.fonts).toEqual({ files: [path('b-latin.ttf')], defaultFamily: 'Latin Sans' });
  });

  it('does not warn for another character no font has', () => {
    expect(chooseFonts(svg('Latin Sans', 'Hi ∑'), index).warnings).toEqual([]);
  });

  it('warns once when the system has no font at all, and leaves the fonts to the renderer', () => {
    expect(chooseFonts(svg('Latin Sans', 'Hi'), buildFontIndex([]))).toEqual({ fonts: { system: true }, warnings: [NO_FONT] });
  });

  it('names the install line in each warning', () => {
    expect(NO_FONT).toContain('apt install fonts-noto-core');
    expect(NO_EAST_ASIAN).toContain('apt install fonts-noto-cjk');
  });
});

describe('font warnings in the command, MCP and the library', () => {
  const resvg = createRequire(import.meta.url)('@resvg/resvg-js') as ResvgModule;
  const korean = 'flowchart LR\n  A[주문] --> B[배송]\n';
  const noKorean = () => ({ fonts: { system: true } as const, warnings: [NO_EAST_ASIAN] });

  it('the command writes the PNG and one warning line, and ends with 0', () => {
    const out = runCommand(['--format', 'png'], () => korean, { loadPng: () => resvg, pngFonts: noKorean });
    expect(out.code).toBe(0);
    expect(out.bytes?.length).toBeGreaterThan(0);
    expect(out.stderr).toBe(`warning: ${NO_EAST_ASIAN}\n`);
  });

  it('the command puts the warning before the check report', () => {
    const out = runCommand(['--format', 'png', '--check'], () => korean, { loadPng: () => resvg, pngFonts: noKorean });
    expect(out.stderr.startsWith(`warning: ${NO_EAST_ASIAN}\n`)).toBe(true);
    expect(out.stderr.length).toBeGreaterThan(`warning: ${NO_EAST_ASIAN}\n`.length);
  });

  it('the command warns about nothing when the fonts are there', () => {
    const out = runCommand(['--format', 'png'], () => korean, { loadPng: () => resvg, pngFonts: () => ({ fonts: { system: true }, warnings: [] }) });
    expect(out.stderr).toBe('');
  });

  it('MCP returns the image and the warning as one text line', () => {
    const out = callTool('render', { source: korean, format: 'png' }, { loadPng: () => resvg, pngFonts: noKorean });
    expect(out.isError).toBe(false);
    expect(out.content.map((c) => c.type)).toEqual(['image', 'text']);
    expect(out.content[1]).toEqual({ type: 'text', text: `warning: ${NO_EAST_ASIAN}\n` });
  });

  it('MCP returns the image alone without a warning', () => {
    const out = callTool('render', { source: korean, format: 'png' }, { loadPng: () => resvg, pngFonts: () => ({ fonts: { system: true }, warnings: [] }) });
    expect(out.content.map((c) => c.type)).toEqual(['image']);
  });

  it('the library calls onWarning and still draws', async () => {
    vi.resetModules();
    vi.doMock('../src/node/font-index.ts', async (load) => ({ ...(await load<typeof import('../src/node/font-index.ts')>()), systemFontIndex: () => ({ files: [], families: new Map() }) }));
    const { renderPng } = await import('../src/png.ts');
    const warnings: string[] = [];
    const png = await renderPng(korean, { scale: 1, onWarning: (w) => warnings.push(w) });
    expect(png.length).toBeGreaterThan(0);
    expect(warnings).toEqual([NO_FONT]);
    vi.doUnmock('../src/node/font-index.ts');
    vi.resetModules();
  });

  it('the library draws with the system fonts it chose', async () => {
    const { renderPng } = await import('../src/png.ts');
    const warnings: string[] = [];
    const png = await renderPng(korean, { scale: 1, onWarning: (w) => warnings.push(w) });
    expect(png.length).toBeGreaterThan(0);
    expect(render(korean)).toContain('주문');
  });
});
