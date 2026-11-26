# Output formats

| `--format` | What you get |
| --- | --- |
| `svg` (default) | One inline SVG. Colours are CSS variables; light and dark follow the viewer. |
| `text` | Box-drawing characters, laid out for `--width`. No colour codes unless you add `--color`. |
| `text-svg` | The terminal drawing as one SVG, for where text would lose its columns. |
| `html` | One file with the drawing, a light and dark switch, and saving as PNG or SVG. |
| `json` | The placement: boxes, lines and labels with their coordinates. |
| `check` | The engine's report without the drawing: one line of counts (bends, crossings), the lines that cross and the most bent lines with their source line numbers, and sometimes questions a writer can answer by editing the text. |
| `fixed` | The text with the fixes of `--fix` made, to save in place of it. Nothing is drawn. |

One command per format, each in its own tab. The `json` tab reads the text from standard input:

::: code-group

```bash [svg]
ursula-diagram flow.mmd --format svg > flow.svg
```

```bash [text]
ursula-diagram flow.mmd --format text --width 100
```

```bash [text, ASCII]
ursula-diagram flow.mmd --format text --width 100 --charset ascii
```

```bash [text-svg]
ursula-diagram flow.mmd --format text-svg --width 100 > flow-text.svg
```

```bash [html]
ursula-diagram flow.mmd --format html --theme dark --title "Flow" > flow.html
```

```bash [check]
ursula-diagram flow.mmd --format check
```

```bash [json]
cat flow.mmd | ursula --format json
```

```bash [fixed]
ursula-diagram flow.mmd --format fixed > flow-fixed.mmd
```

:::

The command reads standard input when no file is given. `--theme auto|light|dark` sets the light or dark of an
`html` page; `auto` follows the system setting.

## Options {#options}

`ursula-diagram --help` prints every option, the formats and the exit codes:

```ursula-output --help
```
