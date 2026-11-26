# In a terminal

`--format text` draws with box-drawing characters and arranges the drawing for `--width`. The order flowchart on the
[home page](/) runs left to right at `--width 80`; at `--width 40` the same text comes out stacked top to bottom. A drawing is
never cut off. These are the [examples page](/examples/)'s sequence, Gantt and mindmap texts, drawn with
`ursula-diagram <file> --format text --width 80`.

```ursula-output input=gallery:sequence --format text --width 80
```

```ursula-output input=gallery:gantt --format text --width 80
```

```ursula-output input=gallery:mindmap --format text --width 80
```

A few types (pie, quadrant, radar, sankey, XY chart, timeline, user journey, railroad, Venn, Cynefin, Wardley) come
out as a table or a list in a terminal, because that is more exact there than a picture:

```ursula-input gallery:pie
```

```ursula-output input=gallery:pie --format text --width 80
```

## Errors, the check and exit codes

An error names the line and the column and, when it can, the word that was meant and a line written the right way.
Here the first line misspells the header and the second uses a flowchart arrow Mermaid does not read:

```ursula-output exit=1 --format text
flowchrt LR
  A -> B
```

`--fix` makes the fixes that have only one reading, draws, and names each fix on standard error. Make the same change
in your text, or take the whole fixed text from `--format fixed`:

```ursula-output --fix --format text
flowchrt LR
  A -> B
```

When a drawing cannot fit in `--width`, the command prints no drawing, ends with code 3 and names a width that fits.
The home page's flowchart at `--width 20`:

```ursula-output exit=3 input=home --format text --width 20
```

`--check` with any drawing format adds the engine's report on standard error; `--format check` prints the report
alone. It holds the counts, the lines that cross with their source line numbers, and sometimes questions. The report
counts the svg layout; a terminal drawing routes its lines on its own grid, so its crossings can differ. The report on
the home page's flowchart:

```ursula-output input=home --format check
```

`ursula-diagram syntax` lists every type, and `ursula-diagram syntax <type>` prints a small example and the rules.

The exit code is 0 when drawn, 1 for an error in the text, 2 for wrong options, 3 when the drawing is too wide and 4
for a failure inside the engine. Every option is on the [Output formats](/guide/output-formats#options) page.

# When the columns do not line up

A text drawing keeps its columns only where every character is as wide as the engine counts it: one cell for a line
or an arrowhead, two for a Korean, Chinese or Japanese character. A real terminal does that. A chat window, a web
page or a code block in a document often does not, and the boxes come apart. GitHub's code block is one such
place: in Chrome on a Mac it draws a Korean character 1.44 cells wide (measured; it depends on the system and the
font), which is why every text drawing in the README uses Latin letters only.

There are two ways out:

- **`--format text-svg`** draws the same terminal drawing as one SVG. It draws the lines as shapes and sets every
  word on the grid, so no font moves a column. Below, a drawing with Korean labels:

  <img src="/assets/ko-hero-text.svg" alt="A terminal drawing with Korean labels, drawn as SVG" width="608">

- **`--charset ascii`** draws with ASCII characters only, for a terminal that draws box lines two cells wide:

  ```ursula-output input=home --format text --width 80 --charset ascii
  ```

<details>
<summary>Which characters <code>--charset ascii</code> replaces</summary>

| | `unicode` (default) | `ascii` |
| --- | --- | --- |
| Line, heavy line, dashed line | `─ │` `━ ┃` `┄ ┆` | `- \|` `= #` `. :` |
| Corner of a box or a line, tee, crossing | `╭ ┌ ├ ┼` | `+` |
| Rounded bend of a git branch, kanban card or block shape | `╭ ╮ ╰ ╯` | `/ \ \ /` |
| Arrowhead; hollow arrowhead | `▶ ◀ ▼ ▲`; `──▷` | `> < v ^`; `--\|>` |
| Filled and open diamond, dots, bar | `◆ ◇` `● ◉` `█` | `@ o` `* @` `#` |
| Cut-off text | `…` | `~` |

The text of the diagram is kept as written. The characters of the table are replaced wherever they stand, and so
are a few symbols that some terminals draw two cells wide (`·` `×` `—` `∩` `⊕`).

</details>
