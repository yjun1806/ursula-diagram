// The docs show what the built command prints now. The site draws its outputs at build time from `ursula-output` and
// `ursula-input` fences and scripts/render-home.mjs; the READMEs and the pictures in assets/ and examples/ are files,
// which `npm run docs:sync` rewrites. These tests fail when a file differs from the command, when a fence or a home card
// cannot be drawn as the page expects, when a command a document names fails, and when a reference page misses a
// format, an MCP tool or argument, or names a library export that does not exist.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript shared with the site
import { ROOT, runCli } from '../scripts/docs/cli.mjs';
// @ts-expect-error plain JavaScript shared with the site
import { READMES, readmeOutputs } from '../scripts/docs/readme.mjs';
// @ts-expect-error plain JavaScript shared with the site
import { PICTURES, drawPicture } from '../scripts/docs/sources.mjs';
// @ts-expect-error plain JavaScript shared with the site
import { ALLOWED, checkCommands, documents } from '../scripts/docs/commands.mjs';
// @ts-expect-error plain JavaScript shared with the site
import { drawFence } from '../site/.vitepress/ursula-output.mjs';
// @ts-expect-error plain JavaScript shared with the site
import { homeOutputs } from '../site/scripts/render-home.mjs';
// @ts-expect-error plain JavaScript shared with the site
import { SOURCE } from '../site/.vitepress/theme/home/sample.js';
import * as library from '../src/index.ts';
import * as html from '../src/html.ts';

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const SYNC = 'run `npx -y bun@1 scripts/build.ts` and `npm run docs:sync`';

describe('the outputs kept as files', () => {
  for (const name of READMES as string[]) {
    it(`${name} shows what the command prints`, () => {
      const blocks = readmeOutputs(read(name), name);
      expect(blocks.length, `${name} has no <!-- ursula-output --> fence`).toBeGreaterThan(0);
      for (const b of blocks) expect(b.current, `${name}:${b.line} is out of date; ${SYNC}`).toBe(b.expected);
    });
  }

  it("the READMEs draw the home page's flowchart", () => {
    for (const name of READMES as string[]) expect(read(name)).toContain(`\`\`\`\n${SOURCE}\n\`\`\``);
  });

  it('every picture in assets/ and examples/ is what the command draws', () => {
    const stale = (PICTURES as Array<{ path: string }>).filter((p) => read(p.path) !== drawPicture(p)).map((p) => p.path);
    expect(stale, `out of date; ${SYNC}`).toEqual([]);
  });
});

/** Every `ursula-output` and `ursula-input` fence of the site's pages: [page, info, body]. */
function outputFences(): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const page of (documents() as string[]).filter((d) => d.startsWith('site/'))) {
    for (const m of read(page).matchAll(/^( *)```(ursula-(?:output|input)\b[^\n]*)\n([\s\S]*?)^\1```$/gm)) {
      out.push([page, m[2] ?? '', (m[3] ?? '').replace(new RegExp(`^${m[1] ?? ''}`, 'gm'), '')]);
    }
  }
  return out;
}

describe('the outputs the site draws at build time', () => {
  it('every output fence of the site draws with the exit code it expects', () => {
    const fences = outputFences();
    expect(fences.length).toBeGreaterThan(20);
    for (const [page, info, body] of fences) expect(() => drawFence(info, body, page), `${page}: ${info}`).not.toThrow();
  });

  it("the home page's terminal drawings and every agent card's command", () => {
    const home = homeOutputs();
    expect(home.terminal.wide.text).toContain('Pick items');
    expect(home.cards.errors).toMatch(/^error: line 1:/);
    expect(home.cards.same).toBe('same');
  });
});

describe('the commands the docs name', () => {
  it('every command runs with the exit code its document gives, or is allowed with a reason', async () => {
    const { ran, problems } = await checkCommands();
    expect(problems).toEqual([]);
    expect(ran.length).toBeGreaterThan(40);
  }, 120000);

  it('every allowed command says why it is not run', () => {
    for (const a of ALLOWED as Array<{ why: string }>) expect(a.why.length).toBeGreaterThan(10);
  });
});

describe('the reference pages', () => {
  const help = runCli(['--help']).stdout as string;

  it('Output formats names every --format', () => {
    const formats = (help.match(/--format F\s+(.*)/)?.[1] ?? '').replace(/\(the default\)/, '').split(/,\s*|\s+or\s+/).map((f) => f.trim()).filter(Boolean);
    expect(formats).toContain('fixed');
    for (const page of ['site/guide/output-formats.md', 'site/ko/guide/output-formats.md']) {
      for (const f of formats) expect(read(page), `${page} lacks the format ${f}`).toMatch(new RegExp(`^\\| \`${f}\``, 'm'));
    }
  });

  it('Agent skill names every MCP tool and argument', () => {
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'docs', version: '0' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ];
    const out = runCli(['mcp'], { input: requests.map((r) => JSON.stringify(r)).join('\n') + '\n' }).stdout as string;
    const list = out.split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.id === 2);
    const tools = list.result.tools as Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }>;
    expect(tools.map((t) => t.name)).toEqual(['render', 'check', 'syntax']);
    for (const page of ['site/guide/agent-skill.md', 'site/ko/guide/agent-skill.md']) {
      const text = read(page);
      for (const t of tools) {
        expect(text, `${page} lacks the tool ${t.name}`).toContain(`\`${t.name}\``);
        for (const arg of Object.keys(t.inputSchema.properties).filter((a) => a !== 'source' && a !== 'type')) {
          expect(text, `${page} lacks the argument ${arg} of ${t.name}`).toContain(`\`${arg}\``);
        }
      }
    }
  });

  it('every name the docs import from the package exists', () => {
    const exports: Record<string, Set<string>> = {
      'ursula-diagram': new Set(Object.keys(library)),
      'ursula-diagram/html': new Set(Object.keys(html)),
    };
    let imports = 0;
    for (const doc of documents() as string[]) {
      for (const m of read(doc).matchAll(/import \{([^}]+)\} from '(ursula-diagram(?:\/html)?)'/g)) {
        for (const name of (m[1] ?? '').split(',').map((n) => n.trim()).filter(Boolean)) {
          imports++;
          expect(exports[m[2] ?? '']?.has(name), `${doc} imports ${name} from ${m[2]}, which does not export it`).toBe(true);
        }
      }
    }
    expect(imports).toBeGreaterThan(5);
  });
});
