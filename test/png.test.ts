import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../src/command/run.ts';
import { callTool } from '../src/mcp/tools.ts';
import { COLORS } from '../src/render/colors.ts';
import { PAPER } from '../src/render/html.ts';
import type { ResvgModule } from '../src/render/png.ts';
import { bakeSvg, PNG_HINT, svgToPng, validScale } from '../src/render/png.ts';
import { render } from '../src/index.ts';

const root = new URL('..', import.meta.url).pathname;
const resvg = createRequire(import.meta.url)('@resvg/resvg-js') as ResvgModule;
const flow = 'flowchart LR\n  A[주문 접수] --> B{재고 확인}\n  B -->|있음| C[배송 준비]\n';
const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from the IHDR chunk of a PNG. */
const size = (png: Uint8Array): { width: number; height: number } => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};
const isPng = (bytes: Uint8Array | undefined): boolean => bytes !== undefined && signature.every((b, i) => bytes[i] === b);
const viewBox = (svg: string): { width: number; height: number } => {
  const [, , w, h] = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
  return { width: w ?? 0, height: h ?? 0 };
};
const read = (src: string) => () => src;

describe('bakeSvg', () => {
  const svg = render(flow);

  it('leaves no colour variable and no dark-scheme rules', () => {
    for (const theme of ['light', 'dark'] as const) {
      const baked = bakeSvg(svg, theme);
      expect(baked).not.toContain('var(');
      expect(baked).not.toContain('@media');
    }
  });

  it('writes the value of the chosen scheme', () => {
    expect(bakeSvg(svg, 'light')).toContain(`fill:${COLORS['fg']?.[0]}`);
    expect(bakeSvg(svg, 'dark')).toContain(`fill:${COLORS['fg']?.[1]}`);
    expect(bakeSvg(svg, 'dark')).not.toContain(`fill:${COLORS['fg']?.[0]}`);
  });

  it('takes the quotes off font names, which the renderer would misread', () => {
    const baked = bakeSvg(svg, 'light');
    expect(svg).toMatch(/font-family:[^;}]*'/);
    expect(baked).not.toMatch(/font-family:[^;}]*'/);
    expect(baked).toContain('Apple SD Gothic Neo');
  });

  it('turns marks at the start of lines, which the renderer leaves unturned', () => {
    const marker = '<marker id="m" viewBox="0 0 9 9" refX="1" refY="4.5" orient="auto-start-reverse"><path d="M0 0L9 4.5L0 9z"/></marker>';
    const baked = bakeSvg(`<svg><defs>${marker}</defs><path marker-start="url(#m)" marker-end="url(#m)"/></svg>`, 'light');
    expect(baked).not.toContain('auto-start-reverse');
    expect(baked).toContain('marker-start="url(#m-start-turned)" marker-end="url(#m)"');
    expect(baked).toContain('<marker id="m-start-turned" viewBox="0 0 9 9" refX="1" refY="4.5" overflow="visible" orient="auto"><g transform="rotate(180 1 4.5)">');
  });

  it('keeps the fallback of a name it does not know', () => {
    expect(bakeSvg('<rect style="fill:var(--ursula-unknown, #123456)"/>', 'light')).toBe('<rect style="fill:#123456"/>');
  });
});

describe('svgToPng', () => {
  const svg = render(flow);

  it('draws the viewBox at the scale', () => {
    const box = viewBox(svg);
    for (const scale of [1, 2, 3]) {
      const png = svgToPng(svg, resvg, { scale });
      expect(isPng(png)).toBe(true);
      expect(size(png)).toEqual({ width: Math.ceil(box.width * scale), height: Math.ceil(box.height * scale) });
    }
  });

  it('paints the page colour of the theme behind the drawing', () => {
    const corner = (theme: 'light' | 'dark'): string => {
      const pixels = new resvg.Resvg(bakeSvg(svg, theme), { fitTo: { mode: 'zoom', value: 1 }, background: PAPER[theme === 'dark' ? 1 : 0], font: { loadSystemFonts: false } }).render() as unknown as { pixels: Uint8Array };
      return `#${[...pixels.pixels.subarray(0, 3)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    };
    expect(corner('light')).toBe(PAPER[0]);
    expect(corner('dark')).toBe(PAPER[1]);
  });

  it('refuses a scale of 0, a negative one and one above the largest', () => {
    for (const scale of [0, -1, 9, Number.NaN]) expect(validScale(scale)).toBe(false);
    expect(() => svgToPng(svg, resvg, { scale: 0 })).toThrow(RangeError);
  });
});

describe('--format png', () => {
  const loadPng = () => resvg;

  it('writes PNG bytes, at 2 pixels per unit by default', () => {
    const out = runCommand(['--format', 'png'], read(flow), { loadPng });
    expect(out.code).toBe(0);
    expect(out.stdout).toBe('');
    expect(isPng(out.bytes)).toBe(true);
    expect(size(out.bytes as Uint8Array).width).toBe(Math.ceil(viewBox(render(flow)).width * 2));
  });

  it('takes --scale and --theme', () => {
    const light = runCommand(['--format', 'png', '--scale', '1'], read(flow), { loadPng });
    const dark = runCommand(['--format', 'png', '--scale', '1', '--theme', 'dark'], read(flow), { loadPng });
    expect(size(light.bytes as Uint8Array).width).toBe(Math.ceil(viewBox(render(flow)).width));
    expect(dark.bytes).not.toEqual(light.bytes);
  });

  it('exits 2 with the line to install the renderer when it is missing', () => {
    const out = runCommand(['--format', 'png'], read(flow), { loadPng: () => undefined });
    expect(out).toEqual({ stdout: '', stderr: `error: ${PNG_HINT}\n`, code: 2 });
    expect(PNG_HINT).toBe('install @resvg/resvg-js to write PNG: npm i -g @resvg/resvg-js');
  });

  it('exits 2 and asks for a redirect when standard output is a terminal', () => {
    const out = runCommand(['--format', 'png'], read(flow), { loadPng, stdoutIsTty: true });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain('redirect to a file: > out.png');
  });

  it('exits 2 for a scale that is not above 0 and at most 8', () => {
    for (const scale of ['0', '-1', '9', 'big', '']) expect(runCommand(['--format', 'png', '--scale', scale], read(flow), { loadPng }).code).toBe(2);
  });

  it('exits 1 for an error in the text, as the other formats do', () => {
    expect(runCommand(['--format', 'png'], read('flowchart LR\nA-->\n'), { loadPng }).code).toBe(1);
  });

  it('writes the PNG from the command in the repository', () => {
    const r = spawnSync(process.execPath, [`${root}src/cli.ts`, '--format', 'png'], { input: flow });
    expect(r.status).toBe(0);
    expect(isPng(new Uint8Array(r.stdout))).toBe(true);
  });
});

describe('without the renderer', () => {
  // The skill's one-file command, alone in a folder, with npm's global folder pointed at an empty one.
  const lone = mkdtempSync(join(tmpdir(), 'ursula-png-'));
  copyFileSync(`${root}skills/ursula/scripts/ursula.mjs`, join(lone, 'ursula.mjs'));
  const env = { ...process.env, npm_config_prefix: join(lone, 'global') };
  const run = (args: string[]) => spawnSync(process.execPath, [join(lone, 'ursula.mjs'), ...args], { input: flow, cwd: lone, env, encoding: 'utf8' });
  afterAll(() => rmSync(lone, { recursive: true, force: true }));

  it('the skill command still draws SVG and text', () => {
    expect(run(['--format', 'svg']).stdout).toBe(`${render(flow)}\n`);
    expect(run(['--format', 'text']).status).toBe(0);
  });

  it('the skill command exits 2 with the install line for png', () => {
    const r = run(['--format', 'png']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(`error: ${PNG_HINT}\n`);
  });

  it('the skill command does not carry the renderer', () => {
    const text = readFileSync(`${root}skills/ursula/scripts/ursula.mjs`, 'utf8');
    expect(text).not.toMatch(/require\(["']@resvg|from ["']@resvg|\.node["']/);
  });

  it('MCP render returns isError with the install line', () => {
    const out = callTool('render', { source: flow, format: 'png' }, { loadPng: () => undefined });
    expect(out.isError).toBe(true);
    expect(out.content[0]).toEqual({ type: 'text', text: `error: ${PNG_HINT}\n` });
  });

  it('the library rejects with PngRendererMissing', async () => {
    vi.resetModules();
    vi.doMock('@resvg/resvg-js', () => {
      throw new Error('Cannot find module');
    });
    const { renderPng, PngRendererMissing } = await import('../src/png.ts');
    await expect(renderPng(flow)).rejects.toBeInstanceOf(PngRendererMissing);
    await expect(renderPng(flow)).rejects.toThrow('install @resvg/resvg-js to write PNG: npm i @resvg/resvg-js');
    vi.doUnmock('@resvg/resvg-js');
    vi.resetModules();
  });
});

describe('MCP render with format png', () => {
  it('returns the PNG as image content', () => {
    const out = callTool('render', { source: flow, format: 'png', theme: 'dark' }, { loadPng: () => resvg });
    expect(out.isError).toBe(false);
    const image = out.content[0];
    expect(image?.type).toBe('image');
    if (image?.type !== 'image') return;
    expect(image.mimeType).toBe('image/png');
    expect(isPng(new Uint8Array(Buffer.from(image.data, 'base64')))).toBe(true);
  });

  it('serves the image over standard input and output', () => {
    const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'render', arguments: { source: flow, format: 'png' } } };
    const r = spawnSync(process.execPath, [`${root}src/cli.ts`, 'mcp'], { input: `${JSON.stringify(call)}\n`, encoding: 'utf8' });
    const answer = JSON.parse(r.stdout.trim()) as { result: { content: Array<{ type: string; data: string; mimeType: string }>; isError: boolean } };
    expect(answer.result.isError).toBe(false);
    expect(answer.result.content[0]?.mimeType).toBe('image/png');
    expect(isPng(new Uint8Array(Buffer.from(answer.result.content[0]?.data ?? '', 'base64')))).toBe(true);
  });

  it('refuses a theme it does not know', () => {
    expect(() => callTool('render', { source: flow, format: 'png', theme: 'blue' }, { loadPng: () => resvg })).toThrow('"theme" must be one of light, dark');
  });
});

describe('the library', () => {
  it('renderPng draws PNG bytes', async () => {
    const { renderPng } = await import('../src/png.ts');
    const png = await renderPng(flow, { scale: 1, theme: 'dark' });
    expect(isPng(png)).toBe(true);
    expect(size(png).width).toBe(Math.ceil(viewBox(render(flow)).width));
  });

  it('the main entrance and the HTML entrance never reach the renderer', () => {
    const seen = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/(?:import|export)[^'";]*?from '(\.[^']+)'|import '(\.[^']+)'/g)) visit(join(dirname(file), (m[1] ?? m[2]) as string));
    };
    visit(`${root}src/index.ts`);
    visit(`${root}src/html.ts`);
    expect(seen.size).toBeGreaterThan(50);
    expect([...seen].filter((f) => f.endsWith('render/png.ts') || readFileSync(f, 'utf8').includes('@resvg'))).toEqual([]);
  });
});
