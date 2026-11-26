// Draws every official example (site/examples/official/**/*.mmd) with the engine of the working tree and with the
// engine of a base ref, and prints a Markdown block for the "Output impact" and "Performance" sections of a pull
// request: how many SVG and terminal outputs changed byte for byte, the terminal breakage counts (`breaksOf`) of the
// flowchart examples, and how long a drawing takes.
//
//   npm run compare                          base origin/main
//   npm run compare -- --base <ref>          another base
//   npm run compare -- --base <ref> --list   also name every changed output
//
// The base is checked out in a temporary git worktree under the system temp folder and removed afterwards. Runs with
// Node 22.18 or later (type stripping) or Bun. Exits 1 when a breakage count of the working tree is above the base's.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const WIDTHS = [80, 100] as const;
const FLOWCHART = /^(flowchart|graph|swimlane-beta)\b/;

interface Engine {
  render(src: string): string;
  renderText(src: string, width: number): { lines: string[] } | { error: string };
  /** The terminal drawing of a flowchart with its layout, for `breaksOf`; absent when the tree has none. */
  drawText?: (src: string, width: number, opts: object) => { lines: string[]; layout: unknown };
  breaksOf?: (layout: unknown, lines: readonly string[]) => Record<string, number>;
  blankFrontMatter?: (src: string) => string;
}

interface Drawn {
  outputs: Map<string, string>;
  errors: Map<string, number>;
  breaks: Record<string, number> | undefined;
  flowcharts: number;
  svgMs: number[];
  textMs: number[];
}

function args(): { base: string; list: boolean } {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--base');
  return { base: at >= 0 ? (argv[at + 1] ?? 'origin/main') : 'origin/main', list: argv.includes('--list') };
}

const git = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function examples(root: string): Array<{ name: string; src: string }> {
  const dir = join(root, 'site', 'examples', 'official');
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : f.endsWith('.mmd') ? [p] : [];
    });
  return walk(dir)
    .sort()
    .map((p) => ({ name: relative(dir, p).slice(0, -'.mmd'.length), src: readFileSync(p, 'utf8') }));
}

async function load(root: string): Promise<Engine> {
  const at = (p: string): string => pathToFileURL(join(root, 'src', p)).href;
  const main = (await import(at('index.ts'))) as Engine;
  const optional = async <T>(p: string, name: string): Promise<T | undefined> => {
    try {
      return ((await import(at(p))) as Record<string, T>)[name];
    } catch {
      return undefined;
    }
  };
  return {
    render: main.render,
    renderText: main.renderText,
    drawText: await optional('flowchart-frontend.ts', 'drawText'),
    breaksOf: await optional('layout/text-intact.ts', 'breaksOf'),
    blankFrontMatter: await optional('registry.ts', 'blankFrontMatter'),
  };
}

const timed = <T>(times: number[], call: () => T): T => {
  const start = performance.now();
  try {
    return call();
  } finally {
    times.push(performance.now() - start);
  }
};

function drawAll(engine: Engine, list: Array<{ name: string; src: string }>): Drawn {
  const outputs = new Map<string, string>();
  const errors = new Map<string, number>([['svg', 0], ...WIDTHS.map((w) => [`text${w}`, 0] as [string, number])]);
  const svgMs: number[] = [];
  const textMs: number[] = [];
  const countable = engine.drawText !== undefined && engine.breaksOf !== undefined;
  const breaks: Record<string, number> = {};
  let flowcharts = 0;
  const fail = (key: string, err: unknown): string => {
    errors.set(key, (errors.get(key) ?? 0) + 1);
    return `error: ${err instanceof Error ? err.message : String(err)}`;
  };
  for (const { name, src } of list) {
    let svg: string;
    try {
      svg = timed(svgMs, () => engine.render(src));
    } catch (err) {
      svg = fail('svg', err);
    }
    outputs.set(`${name} svg`, svg);
    for (const width of WIDTHS) {
      let text: string;
      try {
        const r = width === 80 ? timed(textMs, () => engine.renderText(src, width)) : engine.renderText(src, width);
        text = 'lines' in r ? r.lines.join('\n') : fail(`text${width}`, r.error);
      } catch (err) {
        text = fail(`text${width}`, err);
      }
      outputs.set(`${name} text${width}`, text);
    }
    const body = engine.blankFrontMatter ? engine.blankFrontMatter(src) : src;
    const header = body.split('\n').map((l) => l.trim()).find((l) => l !== '' && !l.startsWith('%%')) ?? '';
    if (!countable || !FLOWCHART.test(header)) continue;
    flowcharts++;
    for (const width of WIDTHS) {
      try {
        const drawn = engine.drawText!(body, width, {});
        for (const [k, v] of Object.entries(engine.breaksOf!(drawn.layout, drawn.lines))) breaks[k] = (breaks[k] ?? 0) + v;
      } catch {
        // A flowchart the engine refuses is counted among the errors above.
      }
    }
  }
  return { outputs, errors, breaks: countable ? breaks : undefined, flowcharts, svgMs, textMs };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const ms = (x: number): string => `${x < 10 ? x.toFixed(1) : Math.round(x)} ms`;
const timing = (xs: number[]): string => `${ms(median(xs))} / ${ms(Math.max(0, ...xs))}`;

async function main(): Promise<void> {
  const started = performance.now();
  const { base, list } = args();
  const root = git(process.cwd(), 'rev-parse', '--show-toplevel');
  const sha = git(root, 'rev-parse', '--short', `${base}^{commit}`);
  const head = git(root, 'rev-parse', '--short', 'HEAD');
  const dirty = git(root, 'status', '--porcelain', '--', 'src').length > 0;
  const tmp = mkdtempSync(join(tmpdir(), 'ursula-compare-'));
  const baseRoot = join(tmp, 'base');
  git(root, 'worktree', 'add', '--detach', '--quiet', baseRoot, sha);
  let before: Drawn;
  let after: Drawn;
  const shown = examples(root);
  try {
    // Both trees draw the examples of the working tree, so that added or changed examples are compared too.
    before = drawAll(await load(baseRoot), shown);
  } finally {
    git(root, 'worktree', 'remove', '--force', baseRoot);
    rmSync(tmp, { recursive: true, force: true });
  }
  after = drawAll(await load(root), shown);

  const changed = (suffix: string): string[] =>
    [...after.outputs.keys()].filter((k) => k.endsWith(` ${suffix}`) && before.outputs.get(k) !== after.outputs.get(k)).map((k) => k.slice(0, -suffix.length - 1));
  const rows = [['SVG', 'svg'], ...WIDTHS.map((w) => [`Terminal, ${w} columns`, `text${w}`])] as const;
  const out: string[] = [];
  out.push(`Compared with \`npm run compare -- --base ${base}\`: ${shown.length} official examples, base \`${sha}\` → \`${head}\`${dirty ? ' + uncommitted changes' : ''}.`);
  out.push('');
  out.push('| Output | Changed | Errors (base → this) |');
  out.push('| --- | ---: | ---: |');
  for (const [label, key] of rows) out.push(`| ${label} | ${changed(key).length} | ${before.errors.get(key)} → ${after.errors.get(key)} |`);
  out.push('');

  const raised: string[] = [];
  if (before.breaks && after.breaks) {
    const kinds = [...new Set([...Object.keys(before.breaks), ...Object.keys(after.breaks)])];
    const total = (b: Record<string, number>): number => Object.values(b).reduce((s, v) => s + v, 0);
    out.push(`Terminal breakage (\`breaksOf\`) summed over the ${after.flowcharts} flowchart examples at ${WIDTHS.join(' and ')} columns:`);
    out.push('');
    out.push('| Kind | Base | This |');
    out.push('| --- | ---: | ---: |');
    for (const k of kinds) {
      const [b, a] = [before.breaks[k] ?? 0, after.breaks[k] ?? 0];
      if (a > b) raised.push(k);
      if (a !== 0 || b !== 0) out.push(`| ${k} | ${b} | ${a}${a > b ? ' (raised)' : ''} |`);
    }
    out.push(`| total | ${total(before.breaks)} | ${total(after.breaks)} |`);
  } else {
    out.push('Terminal breakage: not counted, since one of the trees has no `drawText` or `breaksOf`.');
  }
  out.push('');
  out.push('| Time per example, median / max | Base | This |');
  out.push('| --- | ---: | ---: |');
  out.push(`| SVG | ${timing(before.svgMs)} | ${timing(after.svgMs)} |`);
  out.push(`| Terminal, 80 columns | ${timing(before.textMs)} | ${timing(after.textMs)} |`);

  if (list) {
    for (const [label, key] of rows) {
      const names = changed(key);
      if (names.length) out.push('', `${label} changed:`, ...names.map((n) => `- ${n}`));
    }
  }
  console.log(out.join('\n'));
  console.error(`\n(compared in ${((performance.now() - started) / 1000).toFixed(1)} s)`);
  if (raised.length) {
    console.error(`A breakage count rose: ${raised.join(', ')}. A terminal change may widen a drawing or add bends, but must not break more.`);
    process.exit(1);
  }
}

await main();
