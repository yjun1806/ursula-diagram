// The site's Vue components as Markdown, for the .md twins of the English pages and llms-full.txt. Each reads the same
// data its component reads, so the text cannot drift from the page. Pictures become Markdown images with their alt
// text; anything that only works in a browser (the playground, the live demo) becomes one sentence that says so.
import { readFileSync } from 'node:fs';
import { GRIDS } from '../theme/compare/pictures.js';
import { colourRows } from '../theme/colours/colours.mjs';
import { readRendered } from '../examples/pages.mjs';
import { TYPES } from '../examples/types.mjs';
import { HOME_STRINGS } from '../theme/home/strings.js';
import { CARDS } from '../theme/home/agents.js';
import { WHY } from '../theme/home/why.js';
import { SOURCE } from '../theme/home/sample.js';
import { INSTALL } from '../theme/home/install.js';
import { LOOP } from '../theme/home/loop.js';
import { TYPE_NAMES } from '../theme/home/type-names.js';
import { forAgents } from '../theme/web-only/text.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const FEATURES = json('../theme/compare/features.json');
const BENCHMARK = json('../theme/compare/benchmark.json');
const OUTPUTS = json('../theme/home/outputs.json');
const en = (v) => (v && typeof v === 'object' ? v.en : v);
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
const number = (v, places) => v.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });
const fence = (lang, text) => `\`\`\`${lang}\n${text.replace(/\n+$/, '')}\n\`\`\``;

function table(head, rows) {
  return [`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}

function featureTable({ name }) {
  const data = FEATURES.tables[name];
  if (data.placeholder) return '';
  const value = (v) =>
    v === true ? 'Yes' : v === false ? 'No' : v == null ? 'Not checked' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : en(v);
  const rows = data.rows.map((r) => [en(r.name), ...r.values.map(value)]);
  return [table(data.columns.map(en), rows), ...(data.note ? ['', en(data.note)] : [])].join('\n');
}

function benchmarkBars({ name }) {
  const d = BENCHMARK.charts[name];
  if (d.placeholder) return '';
  const unit = en(d.unit) ?? '';
  const withUnit = (text) => `${text}${/^[a-z]/i.test(unit) ? ' ' : ''}${unit}`;
  const places = d.decimals ?? 0;
  const out = [`**${en(d.title)}**${d.lowerIsBetter ? ' (lower is faster)' : ''}`, ''];
  if (d.headline) {
    const by = (id) => d.bars.find((b) => b.id === id).value;
    out.push(fill(en(d.headline.text), { n: Math.round(by(d.headline.slower) / by(d.headline.faster)) }), '');
  }
  for (const b of d.bars) {
    const value = b.value == null ? '—' : withUnit(en(b.text) ?? number(b.value, places));
    const extra = [b.range ? `range ${withUnit(`${number(b.range[0], places)}–${number(b.range[1], places)}`)}` : '', en(b.sub), en(b.detail)].filter(Boolean);
    out.push(`- ${en(b.name)}: ${value}${extra.length ? ` (${extra.join('; ')})` : ''}`);
  }
  if (d.runs) {
    const ranges = d.bars.filter((b) => b.range).map((b) => withUnit(`${number(b.range[0], places)}–${number(b.range[1], places)}`));
    out.push('', fill(en(d.runs), ranges));
  }
  if (d.conditions) out.push('', en(d.conditions));
  return out.join('\n');
}

function picGrid({ name, named }, url) {
  const grid = GRIDS[name];
  const columns = (named !== undefined && grid.named ? grid.named : grid.columns).map(en);
  const out = [];
  for (const r of grid.rows) {
    const label = en(r.label);
    out.push(`**${r.href ? `[${label}](${url(r.href)})` : label}**`, '');
    r.cells.forEach((c, j) => {
      const what = c.src ? `![${label} (${columns[j]})](${url(c.src)})` : en(c.none) ?? '—';
      const facts = (c.facts ?? []).map(en);
      out.push(`- ${columns[j]}: ${what}${facts.length ? ` ${facts.join('; ')}` : ''}`);
    });
    if (r.note) out.push('', en(r.note));
    out.push('');
  }
  return out.join('\n').trimEnd();
}

function colourTable() {
  const rows = colourRows();
  return table(['Variable', 'What it colours', 'Light', 'Dark'], rows.map((r) => [`\`${r.variable}\``, r.en, `\`${r.light}\``, `\`${r.dark}\``]));
}

function exampleTypes(_, url) {
  const rendered = readRendered();
  const rows = TYPES.map((type) => {
    const { items } = rendered.find((r) => r.id === type.id);
    const failed = items.filter((i) => i.error).length;
    return [`[${type.name}](${url(`/examples/${type.id}.md`)})`, `${items.length}${failed ? ` (${failed} not drawn)` : ''}`];
  });
  const total = rendered.reduce((n, r) => n + r.items.length, 0);
  return table(['Type', 'Examples'], [...rows, ['Total', String(total)]]);
}

function agentCards(_, url) {
  const t = HOME_STRINGS.en;
  const out = [`## ${t.agentsTitle}`, '', t.agentsLead, '', fence('mermaid', LOOP.en), ''];
  CARDS.forEach((c, i) => {
    const [title, body] = t.cards[c.id];
    out.push(`### ${i + 1}. ${title}`, '', body, '');
    const output = OUTPUTS.cards[c.id];
    const shell = c.commands.map((cmd) => `$ ${cmd}`).join('\n');
    out.push(fence('text', output ? `${shell}\n${output}` : shell), '');
    if (c.exit) out.push(`${t.exitCode} ${c.exit}`, '');
  });
  out.push(`[${t.agentsMore}](${url('/guide/agent-skill')})`);
  return out.join('\n');
}

function typeGrid(_, url) {
  const t = HOME_STRINGS.en;
  return [`## ${t.types}`, '', `${t.typesLead} ${TYPE_NAMES.join(', ')}.`, '', `[${t.examples}](${url('/examples/')})`].join('\n');
}

const playground = (_, url) =>
  'The playground is an editor that runs the engine in the browser; it has no text form. Without a browser, run ' +
  '`npx ursula-diagram file.mmd --format svg` or `--format text`, or call `render` from the [library](' + url('/guide/library') + ').';

const artifactDemo = () => 'On the web page, the flowchart of the HTML page above is drawn here live by `ursula.global.js`.';

/** The Markdown of a component used as `<Name ... />` on a page, or undefined for a component this file does not know. */
export function componentMarkdown(name, props, url) {
  const make = {
    FeatureTable: featureTable,
    BenchmarkBars: benchmarkBars,
    PicGrid: picGrid,
    ColourTable: colourTable,
    ExampleTypes: exampleTypes,
    AgentCards: agentCards,
    TypeGrid: typeGrid,
    Playground: playground,
    ArtifactDemo: artifactDemo,
  }[name];
  return make ? make(props, url) : undefined;
}

/** The home page's hero and the sections the theme's layout puts under it (theme/index.js), as Markdown. */
export function homeTop(hero, url) {
  const t = HOME_STRINGS.en;
  const why = WHY.en;
  const noteOf = (id) => (id === 'skill' ? t.skillNote : id === 'mcp' ? t.mcpNote : t.needsNode);
  const install = INSTALL.map((m) => `- ${m.id}: \`${m.command}\` (${noteOf(m.id)})`);
  const links = (hero.actions ?? []).map((a) => `[${a.text}](${url(a.link)})`).join(' · ');
  return [
    `# ${hero.name}: ${hero.text}`,
    '',
    hero.tagline,
    '',
    links,
    '',
    `## ${t.install}`,
    '',
    ...install,
    '',
    `## ${t.measureTitle}`,
    '',
    t.measureHeadline,
    '',
    benchmarkBars({ name: 'skillMean' }),
    '',
    forAgents(t.measureShown),
    '',
    picGrid({ name: 'skill' }, url),
    '',
    `[${t.measureMore}](${url('/guide/compared')})`,
    '',
    `## ${why.title}`,
    '',
    why.lead,
    '',
    table([why.what, 'ursula-diagram', 'Mermaid.js 12.3.0'], why.rows),
    '',
    why.caption,
    '',
    `### ${why.strip}`,
    '',
    forAgents(why.stripNote),
    '',
    picGrid({ name: 'mermaid' }, url),
    '',
    `## ${t.input}, ${t.svg}, ${t.terminal}`,
    '',
    `${t.input} (\`order.mmd\`):`,
    '',
    fence('mermaid', SOURCE),
    '',
    `${t.svg} (\`--format svg\`): ![The same flowchart drawn by ursula as SVG](${url('/assets/hero.svg')})`,
    '',
    `${t.terminal} (\`--format text --width ${OUTPUTS.terminal.wide.width}\`):`,
    '',
    fence('text', OUTPUTS.terminal.wide.text),
    '',
    `${t.sameText} [${t.tryIt}](${url('/playground')})`,
  ].join('\n');
}
