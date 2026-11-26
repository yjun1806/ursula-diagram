// The snippets of the Ways to use pages work as written: the Node build script draws its files, the markdown-it fence
// rule draws a Mermaid fence and leaves other fences alone, the Claude Code mod example draws a reply's Mermaid block
// and keeps it when the command is missing, and the HTML page loads a file the published package carries. The
// shell commands of the pages are run by test/docs.test.ts like those of every other page.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript shared with the site
import { ROOT, runCli } from '../scripts/docs/cli.mjs';
// @ts-expect-error plain JavaScript shared with the site
import { ARTIFACT_SAMPLE } from '../site/.vitepress/theme/use-cases/artifact-sample.js';
import { render } from '../src/index.ts';

const PAGES = ['site/guide/use-cases.md', 'site/ko/guide/use-cases.md'];
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

/** The body of the fence titled `[title]` on a page. */
function snippet(page: string, title: string): string {
  const m = read(page).match(new RegExp(`^\`\`\`\\w+ \\[${title.replace(/[.]/g, '\\.')}\\]\\n([\\s\\S]*?)^\`\`\`$`, 'm'));
  if (!m?.[1]) throw new Error(`${page} has no fence titled [${title}]`);
  return m[1];
}

const LIBRARY = pathToFileURL(join(ROOT, 'src', 'index.ts')).href;
const work = mkdtempSync(join(tmpdir(), 'ursula-use-cases-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Writes a snippet into the work folder with the package import pointing at this checkout, and imports it. */
async function load<T>(name: string, code: string): Promise<T> {
  const path = join(work, name);
  writeFileSync(path, code.replace(/from 'ursula-diagram'/g, `from '${LIBRARY}'`));
  return (await import(pathToFileURL(path).href)) as T;
}

const TITLES = ['hooks/register.ts', 'index.html', 'build.mjs', 'mermaid-fence.mjs', 'Diagram.jsx'];

describe('the Ways to use pages', () => {
  it('the English and Korean pages hold the same code', () => {
    for (const title of TITLES) expect(snippet(PAGES[1]!, title), title).toBe(snippet(PAGES[0]!, title));
  });

  it('the Node script draws every .mmd file as SVG and terminal text', async () => {
    const dir = join(work, 'build');
    mkdirSync(join(dir, 'diagrams'), { recursive: true });
    writeFileSync(join(dir, 'diagrams', 'flow.mmd'), 'flowchart LR\n  A --> B\n');
    writeFileSync(join(dir, 'diagrams', 'notes.txt'), 'not a diagram');
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      await load('build.mjs', snippet(PAGES[0]!, 'build.mjs'));
    } finally {
      process.chdir(cwd);
    }
    expect(readdirSync(join(dir, 'out')).sort()).toEqual(['flow.svg', 'flow.txt']);
    expect(readFileSync(join(dir, 'out', 'flow.svg'), 'utf8')).toMatch(/^<svg/);
    expect(readFileSync(join(dir, 'out', 'flow.txt'), 'utf8')).toContain('A');
  });

  it('the markdown-it fence rule draws Mermaid fences and passes the rest on', async () => {
    const { ursulaMermaid } = await load<{ ursulaMermaid: (md: unknown) => void }>('mermaid-fence.mjs', snippet(PAGES[0]!, 'mermaid-fence.mjs'));
    type Rule = (tokens: Array<{ info: string; content: string }>, idx: number, options: unknown, env: unknown, self: unknown) => string;
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const md = { renderer: { rules: { fence: (() => 'the default fence') as Rule } }, utils: { escapeHtml } };
    ursulaMermaid(md);
    const fence = (info: string, content: string) => md.renderer.rules.fence([{ info, content }], 0, {}, {}, null);
    expect(fence('mermaid', 'flowchart LR\n  A --> B\n')).toMatch(/^<div class="diagram"><svg/);
    expect(fence('js', 'const a = 1;')).toBe('the default fence');
    expect(fence('mermaid', 'flowchrt LR\n  A --> B\n')).toMatch(/^<pre>.*line 1/s);
  });

  it('the Claude Code mod example draws a Mermaid block, keeps each drawing, and keeps the block without the command', async () => {
    type Hook = ($: unknown, e: unknown, next: (e: unknown) => unknown) => Promise<unknown>;
    let hook: Hook | undefined;
    const { register } = await load<{ register: (on: (event: string, match: unknown, h: Hook) => void) => void }>(
      'register.ts',
      snippet(PAGES[0]!, 'hooks/register.ts'),
    );
    register((event, match, h) => {
      expect(event).toBe('ui.render');
      expect(match).toEqual({ component: 'AssistantMessage' });
      hook = h;
    });
    const source = 'flowchart LR\n  A --> B\n';
    const reply = `Here:\n\n\`\`\`mermaid\n${source}\`\`\`\n\nDone.`;
    const event = { props: { text: reply, isFirstOfReply: true }, viewport: { columns: 84, rows: 40 } };
    const next = (e: unknown) => (e as { props: { text: string } }).props.text;

    const calls: Array<{ argv: readonly string[]; stdin?: string }> = [];
    const withCommand = {
      process: {
        run: async (argv: readonly string[], init?: { stdin?: string }) => {
          calls.push({ argv, stdin: init?.stdin });
          const out = runCli(argv.slice(1), { input: init?.stdin ?? '' });
          return { exitCode: out.code, stdout: out.stdout, stderr: out.stderr };
        },
      },
    };
    const drawn = (await hook!(withCommand, event, next)) as string;
    const expected = runCli(['--format', 'text', '--width', '80'], { input: source }).stdout as string;
    expect(drawn).toBe(`Here:\n\n\`\`\`text\n${expected}\`\`\`\n\nDone.`);
    expect(calls).toEqual([{ argv: ['ursula-diagram', '--format', 'text', '--width', '80'], stdin: source }]);
    await hook!(withCommand, event, next);
    expect(calls.length, 'the same text at the same width is drawn once').toBe(1);

    const missing = { process: { run: async () => Promise.reject(new Error('ENOENT')) } };
    const other = { ...event, viewport: { columns: 120, rows: 40 } };
    expect(await hook!(missing, other, next)).toBe(reply);
    const broken = { ...event, props: { ...event.props, text: '```mermaid\nflowchrt LR\n```' } };
    expect(await hook!(withCommand, broken, next)).toBe('```mermaid\nflowchrt LR\n```');
  });

  it('the HTML page draws the text of the live demo and loads a file the published package carries', () => {
    const html = snippet(PAGES[0]!, 'index.html');
    expect(html.match(/const text = `([^`]*)`/)?.[1], 'the live demo draws another text').toBe(ARTIFACT_SAMPLE);
    expect(render(ARTIFACT_SAMPLE)).toMatch(/^<svg/);

    const url = html.match(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/ursula-diagram@(\d+)\.(\d+)\/([^"]+)"/);
    expect(url, 'no jsDelivr script of ursula-diagram@<major>.<minor>').not.toBeNull();
    const pkg = JSON.parse(read('package.json')) as { version: string; files: string[]; exports: Record<string, unknown> };
    const [major, minor] = pkg.version.split('.');
    expect(`${url![1]}.${url![2]}`, 'the script URL names another minor version than package.json; change it on both pages').toBe(`${major}.${minor}`);
    expect(`./${url![3]}`).toBe(pkg.exports['./global']);
    const path = url![3]!;
    expect(pkg.files.some((f) => !f.startsWith('!') && (path === f || path.startsWith(`${f}/`))), `${path} is not in files of package.json`).toBe(true);
    expect(pkg.files).not.toContain(`!${path}`);
    expect(read('scripts/build.ts'), 'the build no longer writes the browser file').toContain(path.replace(/^dist\//, ''));
  });
});
