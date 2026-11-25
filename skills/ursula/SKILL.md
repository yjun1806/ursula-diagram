---
name: ursula
description: Draw a diagram from Mermaid text as a terminal drawing, an SVG, or a one-file HTML page. Use when asked to draw, sketch, visualize or diagram a flow, process, architecture, sequence, state machine, class or data model, timeline, chart or any other Mermaid diagram type, or to show a picture of how something works while explaining it. Placement is computed by the bundled engine, so write Mermaid only and never coordinates.
compatibility: Requires Node.js 22 or later. Needs no network and installs nothing.
---

# ursula

Write the diagram as Mermaid text and let the bundled command draw it. The command is the file
`scripts/ursula.mjs` in the folder of this file; it needs Node 22 or later and nothing else. In the commands below,
`URSULA` stands for `node <the folder of this file>/scripts/ursula.mjs`.

## Steps

1. **Write the Mermaid text** to a file. Pick the type by what the content is, not by habit (table below). When
   unsure how a type is written, run `URSULA syntax <type>` for a small example and the rules; `URSULA syntax` lists
   the types.
2. **Draw it and ask the engine in one call**: add `--check` to the command of the next section, for example
   `URSULA d.mmd --format text --width 100 --check`. The drawing goes to standard output; the report goes to
   standard error: one line of counts (bends, crossings), the lines that cross with their source line numbers, and
   sometimes lines that begin with `question 1:`. A question names what the engine found, what a change would gain,
   and what to do in the text.
3. **Answer the questions once.** When there are any, apply a suggestion only when it keeps the meaning of the
   diagram, then draw again. Do not loop: one round of edits.

If the command prints `error: …`, the text could not be drawn. The error names the line and marks the column; follow
its `did you mean:` and `example:` lines, fix the text and run it again. Do not fall back to drawing by hand. Exit
codes: 1 an error in the text, 2 wrong options, 3 too narrow (below), 4 a failure inside the engine.

## Which output

| The reader is | Command | Then |
| --- | --- | --- |
| In a real terminal: a fixed-width font where a Korean, Chinese or Japanese character takes two cells | `URSULA d.mmd --format text --width 100` | Print the lines as they are. Use `--width 80` when the terminal is narrow. |
| In a terminal that draws box lines and arrowheads two cells wide | `URSULA d.mmd --format text --width 100 --charset ascii` | The same drawing with `+ - \| > < ^ v` and other ASCII characters only. |
| In a chat window, a web page or a document, and wants the terminal drawing | `URSULA d.mmd --format text-svg --width 100 > d.svg` | Reference or inline the SVG. The columns hold in any font. |
| Reading a document, a pull request or a page | `URSULA d.mmd --format svg > d.svg` | Reference or inline the SVG. It follows light and dark by itself. |
| Opening one file to look, switch light and dark, and save a PNG | `URSULA d.mmd --format html --title "Name" > d.html` | Give them the file. |
| A program | `URSULA d.mmd --format json` | Boxes, lines and labels with coordinates. |

The text reads from standard input when no file is given: `cat d.mmd | URSULA --format text --width 100`.

Paste a `text` drawing only where the font is fixed-width and wide characters take exactly two cells. A chat
window, a web page and a code block in a document often draw Korean, Chinese or Japanese characters at some other
width, and then the sides of the boxes no longer line up. When the drawing holds such characters and the reader is
not in a terminal, give `svg` or `text-svg` instead. With `--charset ascii` a line is `-` and `|`, a heavy line `=`
and `#`, a dashed line `.` and `:`, a corner `+`, and a hollow arrowhead `--|>`; the legend uses the same
characters.

A terminal drawing never runs past `--width`. When the drawing cannot fit, the command prints no drawing, ends with
code 3 and names a width that fits: give that width, shorten the names, or split the diagram in two. A few types (pie, quadrant, radar, sankey, xychart, timeline, user
journey, railroad, venn, cynefin, wardley) come out as a table or a list in a terminal, because that is more exact
there than a picture.

## Which type

| The content is | Header |
| --- | --- |
| Steps and decisions | `flowchart LR` or `flowchart TD` |
| Steps owned by teams, systems or roles | `swimlane-beta LR`, one `subgraph` per owner |
| Messages between participants over time | `sequenceDiagram` |
| States and what moves between them | `stateDiagram-v2` |
| Types with fields and how they relate | `classDiagram` |
| Tables and their relations | `erDiagram` |
| Systems, containers and who uses them | `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment` |
| Services in groups and what connects them | `architecture-beta` |
| Actors and what they can do | `usecase-beta` |
| Requirements and what satisfies them | `requirementDiagram` |
| Commands, events and views along time | `eventmodeling` |
| A tree of ideas, a file tree | `mindmap`, `treeView-beta` |
| Tasks on a calendar, events in order | `gantt`, `timeline` |
| Branches and merges | `gitGraph` |
| Work by column | `kanban` |
| Causes of one effect | `ishikawa-beta` |
| Numbers | `pie`, `xychart-beta`, `quadrantChart`, `radar-beta`, `sankey-beta`, `treemap-beta` |
| Blocks on a grid, bits of a packet | `block-beta`, `packet-beta` |

Every other header of the Mermaid documentation is read as well (`journey`, `zenuml`, `venn-beta`, `wardley-beta`,
`cynefin-beta`, the railroad grammars). `URSULA syntax <type>` shows how any of them is written.

## Writing text that draws well

The engine places everything; the text decides what it has to work with.

- **Order is meaning.** The node the first line leaves from is the start. Write the main path first, from start to
  end, then the branches and the ways back.
- **Short names.** Two or three words in a box; put the detail in a second line with `<br>`. Long names widen
  every box of that kind.
- **Label the lines that need it**: the answers of a decision (`-->|yes|`), the reason for a way back. Leave the
  obvious ones bare.
- **Decisions are diamonds** (`B{Valid?}`), starts and ends are rounded (`A([Start])`). The shape is how a reader
  tells them apart.
- **One diagram, one question.** Past about twenty boxes, split it: an overview, then one diagram per part.
- **Group only what is owned.** A `subgraph` is for an owner or a boundary, not for decoration.
- Never write coordinates, sizes or colours into the text. Colours come from the page (`--ursula-*` CSS
  variables).

## Example

```
swimlane-beta LR
  subgraph shop[Storefront]
    order([Order placed]) --> pay{Paid?}
    pay -->|no| remind[Send reminder]
  end
  subgraph wh[Warehouse]
    pick[Pick items] --> pack[Pack] --> ship([Ship])
  end
  pay -->|yes| pick
  remind --> pay
```

```bash
URSULA order.mmd --format text --width 100 --check
```
