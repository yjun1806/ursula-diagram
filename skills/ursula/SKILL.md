---
name: ursula
description: Draw a diagram from Mermaid text as a terminal drawing, an SVG, or a one-file HTML page. Use when asked to draw, sketch, visualize or diagram a flow, process, architecture, sequence, state machine, class or data model, timeline, chart or any other Mermaid diagram type, or to show a picture of how something works while explaining it. Placement is computed by the bundled engine, so write Mermaid only and never coordinates.
compatibility: Requires Node.js 22 or later. Needs no network and installs nothing.
---

# ursula

Write the diagram as Mermaid text and let the bundled command draw it. `URSULA` below stands for
`node <the folder of this file>/scripts/ursula.mjs`; it needs Node 22 or later and nothing else. Write that full
command in each call and never put it in a shell variable or alias: zsh does not split a variable into words.

## Steps

1. **Write the Mermaid text** to a file, picking the type by the content (table below). Only when unsure how a type
   is written, run `URSULA syntax <type>`.
2. **Draw it with one command**, with `--check --fix` and the output the reader needs (next section):
   `URSULA d.mmd --format svg --check --fix > d.svg`. The drawing goes to standard output. Standard error starts
   with a line of counts (bends, crossings) that needs nothing from you. Act only on these lines:
   - `fixed: line N: old → new`: the engine corrected the text and drew the corrected version; make the same change
     in your file.
   - `question N: …`: a change that would draw better. Apply it only when it keeps the meaning, then draw once more.
     One round, no loop. A terminal drawing routes on its own grid; ignore a crossing it does not show.
3. **Stop when the command exits with 0.** The output then holds every node, line and label of the text (a label too
   long for a terminal drawing or a small chart tile ends in `…`). Do not open, grep or re-read the output to check
   it; give the file or print the drawing and report.

If the command prints `error: …` (exit 1), the text could not be drawn. Follow its `did you mean:`, `hint:` and
`example:` lines, fix the text and run it again; never draw by hand. Exit code 2 is a wrong option, 3 too narrow
(below), 4 a failure inside the engine.

## Which output

| The reader is | Options | Then |
| --- | --- | --- |
| In a real terminal, where a Korean, Chinese or Japanese character takes two cells | `--format text --width 100` | Print the lines as they are. `--width 80` for a narrow terminal. |
| In a terminal that draws box lines two cells wide | `--format text --width 100 --charset ascii` | The same drawing in ASCII characters only. |
| In a chat window, a web page or a document, and wants the terminal drawing | `--format text-svg --width 100 > d.svg` | Reference or inline the SVG; the columns hold in any font. |
| Reading a document, a pull request or a page | `--format svg > d.svg` | Reference or inline the SVG; it follows light and dark by itself. |
| Opening one file to look, switch light and dark, and save a PNG | `--format html --title "Name" > d.html` | Give them the file. |
| Needs an image file, or the client shows images but not SVG | `--format png > d.png` | Give them the file. Needs `@resvg/resvg-js` in the project or global (`npm i -g @resvg/resvg-js`); this command does not carry it and without it exits 2: give `svg` instead. |
| A program | `--format json` | Boxes, lines and labels with coordinates. |

With no file named, the command reads standard input. Paste a `text` drawing only where wide characters take exactly
two cells; elsewhere give `svg` or `text-svg`, or the sides of boxes holding such characters no longer line up.

A terminal drawing never runs past `--width`. When it cannot fit, the command prints no drawing, exits with 3 and
names a width that fits: use it, shorten the names, or split the diagram. Charts (pie, quadrant, radar, sankey,
xychart, timeline, journey, railroad, venn, cynefin, wardley) come out as a table or a list in a terminal.

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

- **Order is meaning.** The first line leaves from the start. Write the main path first, then the branches and the
  ways back.
- **Short names.** Two or three words in a box; put detail on a second line with `<br>`.
- **Label the lines that need it**: the answers of a decision (`-->|yes|`), the reason for a way back.
- **Decisions are diamonds** (`B{Valid?}`), starts and ends are rounded (`A([Start])`).
- **One diagram, one question.** Past about twenty boxes, split it: an overview, then one diagram per part.
- **Group only what is owned.** A `subgraph` is for an owner or a boundary, not for decoration.
- Never write coordinates, sizes or colours; colours come from the page (`--ursula-*` CSS variables).

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
URSULA order.mmd --format text --width 100 --check --fix
```
