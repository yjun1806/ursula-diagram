<p align="center"><img src="assets/banner.png" alt="ursula" width="100%"></p>

<p align="center"><b>English</b> · <a href="README.ko.md">한국어</a></p>

# ursula

Draws Mermaid text as inline SVG and as terminal text. The same text always gives the same drawing: placement is
computed, with no browser, no DOM and no dependencies at run time.

```
    ┌──── no ───┐
    ▼           │
┌───────┐   ┌───────┐        ┌───────┐
│ Start │──▶│  Ok?  │─ yes ─▶│ Done  │
└───────┘   └───────┘        └───────┘
```

## What it draws

Every diagram type of the Mermaid documentation, 35 in all:

Architecture, Block, C4, Class, Cynefin, Entity Relationship, Event Modeling, Flowchart, Gantt, Git Graph, Ishikawa,
Kanban, Mindmap, Packet, Pie, Quadrant, Radar, Railroad (IR, ABNF, EBNF, PEG), Requirement, Sankey, Sequence, State,
Swimlanes, Timeline, TreeView, Treemap, Use Case, User Journey, Venn, Wardley Map, XY Chart, ZenUML.

The type is read from the header of the text, as Mermaid does.

## Output

| Format | What you get |
| --- | --- |
| `svg` | One inline SVG. Colours are CSS variables; light and dark follow the viewer. |
| `text` | Box-drawing characters within a width you give. No colour codes. `--charset ascii` draws with ASCII only. |
| `text-svg` | The terminal drawing as one inline SVG, for where text would lose its columns. |
| `html` | One file with the drawing, a light and dark switch, and saving as PNG or SVG. |
| `json` | The placement: boxes, lines and labels with their coordinates. |
| `check` | Questions about the drawing a writer can answer by editing the text. |

A `text` drawing keeps its columns only where every character is as wide as the engine counts it: one cell for a
line or an arrowhead, two for a Korean, Chinese or Japanese character. A real terminal does that. A chat window, a
web page or a code block in a document often does not, and the boxes come apart. Use `svg` or `text-svg` there:
`text-svg` draws the lines as shapes and sets every word on the grid, so no font moves a column. For a terminal
that draws line characters two cells wide, use `--charset ascii`.

```
    +---- no ---+
    v           |
+-------+   +-------+        +-------+
| Start |-->|  Ok?  |- yes ->| Done  |
+-------+   +-------+        +-------+
```

| | `unicode` (default) | `ascii` |
| --- | --- | --- |
| Line, heavy line, dashed line | `─ │` `━ ┃` `┄ ┆` | `- \|` `= #` `. :` |
| Corner, tee, crossing; rounded corner | `┌ ├ ┼`; `╭ ╮ ╰ ╯` | `+`; `/ \ \ /` |
| Arrowhead; hollow arrowhead | `▶ ◀ ▼ ▲`; `──▷` | `> < v ^`; `--\|>` |
| Filled and open diamond, dots, bar | `◆ ◇` `● ◉` `█` | `@ o` `* @` `#` |
| Cut-off text | `…` | `~` |

The text of the diagram is kept as written. The characters of the table are replaced wherever they stand, and so
are a few symbols that some terminals draw two cells wide (`·` `×` `—` `∩` `⊕`).

## Command

```bash
node src/cli.ts flow.mmd --format svg > flow.svg
node src/cli.ts flow.mmd --format text --width 100
node src/cli.ts flow.mmd --format text --width 100 --charset ascii
node src/cli.ts flow.mmd --format text-svg --width 100 > flow-text.svg
node src/cli.ts flow.mmd --format html --theme dark > flow.html
cat flow.mmd | node src/cli.ts --format json
```

`--theme auto|light|dark` sets the light or dark of an exported page; `auto` follows the system setting.
Run `node src/cli.ts --help` for every option.

## Library

```ts
import { render, renderText, renderTextSvg } from './src/index.ts';
import { renderHtml } from './src/html.ts';

const src = `flowchart LR
  A[Start] --> B{Ok?}
  B -->|yes| C[Done]
  B -->|no| A`;

const svg = render(src);                 // string of inline SVG
const text = renderText(src, 80);        // { lines: string[] } or { error: string }
const ascii = renderText(src, 80, { charset: 'ascii' });
const picture = renderTextSvg(src, 80);  // { svg: string } or { error: string }
const page = renderHtml(src, { title: 'Flow' });
```

`render` throws an `UrsulaError` with a message for the writer when the text cannot be drawn. `renderText` returns
the message as `{ error }`, also when the drawing does not fit the width: it never cuts a drawing off.

`renderTextSpans` returns the same lines as spans with a tone (`normal`, `dim`, `bold`, `accent`), for a host that
colours terminal text itself. `spansToSvg` draws such lines as the picture `renderTextSvg` returns, and `toAscii`
replaces the drawing characters of lines already drawn; give it `{ countBars: true }` for the lines of an
entity-relationship drawing, so that the bars of its counts on upright lines become `-`.

## Colours

A drawing reads every colour from a CSS variable and carries the value as a fallback, so it looks right on its own
and follows a page that sets the variables. Each has a light and a dark value; the dark one applies under
`prefers-color-scheme: dark`.

```css
:root {
  --ursula-accent: #0b6e4f;
  --ursula-start-fill: #bfe3d0;
}
```

| Variable | What it colours | Light | Dark |
| --- | --- | --- | --- |
| `--ursula-fg` | Names and body text | `#201f1e` | `#efeeec` |
| `--ursula-muted` | Second lines and labels | `#5b5b59` | `#b2b1af` |
| `--ursula-faint` | Text and marks that stand back | `#878685` | `#757472` |
| `--ursula-line` | A line between boxes | `#565554` | `#a5a4a2` |
| `--ursula-border` | The outline of a box | `#484846` | `#bebdbb` |
| `--ursula-hair` | Zone outlines, rules and grid lines | `#e2e1e0` | `#2c2b2a` |
| `--ursula-surface` | The face of a box and of the page | `#fcfcfa` | `#171614` |
| `--ursula-lane` | Filled bands: lanes, zones, head bands, tags | `#efeeed` | `#252422` |
| `--ursula-chip-fill` | Label chips and notes | `#f1f0ef` | `#252422` |
| `--ursula-accent` | The accent as a stroke or a text | `#82641c` | `#dab975` |
| `--ursula-start-fill` | The face of a start box and of the highest bar | `#e5c37a` | `#dab975` |
| `--ursula-accent-tint` | A pale accent face | `#f6ecd7` | `#372c15` |
| `--ursula-on-accent` | Text on the face of a start box | `#201f1e` | `#171614` |
| `--ursula-bg` | The background of flowchart, class, state, ER, requirement, C4 and use case drawings | `transparent` | `transparent` |
| `--ursula-panel` | The panel behind a chart | `none` | `none` |
| `--ursula-bar` | A neutral bar of a chart | `#c8c7c6` | `#434241` |
| `--ursula-tint-outer` | The outermost boundary of a C4 drawing | `#f4f3f1` | `#1e1d1b` |
| `--ursula-tint-inner` | The innermost boundary of a C4 drawing | `#f6f5f3` | `#1c1b19` |
| `--ursula-tint-chip` | A label chip on a boundary fill | `#ebeae8` | `#262523` |
| `--ursula-s1` … `--ursula-s8` | The eight series of a chart | | |
| `--ursula-s1-tint` … `--ursula-s8-tint` | The pale area fill of each series | | |

## Agent skill

`skills/ursula` is a skill for coding agents: `SKILL.md` tells the agent how to write the text and which output to
give, and `scripts/ursula.mjs` is the command as one file, so the skill runs with Node alone. Copy the folder into
the skills folder of the agent.

## Development

```bash
npm install
npx tsc --noEmit
npm test              # the whole suite but the slow comparisons
npm run test:rewrite  # the slow comparisons of the layered engine, about a quarter of an hour
bun scripts/build.ts  # dist/ and the command inside the skill; run it again when a drawing changes
```

The built files run on Node 22 or later. Node 24 or later also runs the TypeScript sources directly, which is how
the commands above are written.
