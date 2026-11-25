# Compared with other tools

Each of these does something ursula does not. The table says what was measured; a cell that says *not checked* was
not measured here. The counts of examples are out of the 531 examples in the Mermaid documentation, 35 types.

| | Output | What it draws | Runs on | Speed | In a terminal | Korean and other wide characters |
| --- | --- | --- | --- | --- | --- | --- |
| **ursula** 0.1.0 | SVG, terminal text, text as SVG, one-file HTML, JSON | 530 of 531; all 35 types | Node 22+, no runtime dependencies, no browser | Median under 1 ms in the library; 0.1–0.4 s per command run | Yes: 21 types as boxes and lines, 14 as a table or a list | Counted in terminal cells: no extra breaks in 13 Korean test drawings. Emoji counted one cell wide (wrong) |
| **A drawing skill** | SVG or HTML the model writes | Whatever the model can lay out; layout chosen per picture | The agent's model | Many model turns per drawing (not measured) | Not checked | Not checked |
| **Mermaid** in a browser (12.3.0) | SVG | 515 of 531 (fails on ZenUML) | A browser; 22 dependencies | Not checked | Not checked | Not checked |
| **mermaid-cli** (12.2.0) | SVG, PNG | Mermaid's types (not counted) | Node 22.13+ and Chromium through Puppeteer | Not checked | No | Not checked |
| **Text drawing tools**: mermaid-ascii, termaid, mmdflux, beautiful-mermaid | Terminal text; mmdflux and beautiful-mermaid also SVG | mmdflux 206 of 531 in 4 types; beautiful-mermaid 226 of 531 in 6 types; the others not counted | Go (mermaid-ascii), Python (termaid), Rust (mmdflux), a Node library (beautiful-mermaid) | mmdflux 7.9 ms per process run; the others not checked | Yes | termaid: no extra breaks in 13 of 13. mermaid-ascii: none in the 10 it drew. mmdflux: one (a label over a crossing) in the 11 it drew. All three count emoji as two cells. beautiful-mermaid 1.1.2 counts characters, not cells, and breaks all 13 Korean drawings |

Per process, mmdflux is about 12 times faster than the `ursula-diagram` command (median 7.9 ms against 99 ms over the 116
flowchart examples); the difference is mostly the start of Node. Inside one program ursula is under 1 ms too.

# When ursula is not the better choice

- **You want a picture tuned by hand.** A drawing skill or a person picks zones, a legend and emphasis for each
  picture. ursula has one look and changes only its colours (through CSS variables). Some types keep fewer lines
  straight: in the official examples, 87% of the lines are straight in flowcharts but 60% in C4 and 67% in use case
  drawings, and Event Modeling lines all bend.
- **You need a PNG from the command line.** mermaid-cli writes one. ursula saves a PNG only from its `html` page.
- **You call it once per process in a tight loop.** A native binary such as mmdflux starts about 12 times faster.
  Calling the library from one Node program avoids the cost.
- **Your labels have emoji and the drawing goes to a terminal.** ursula counts an emoji as one cell, so the right
  edge of that box moves one cell; mermaid-ascii, mmdflux and termaid count two.
- **You want a chart drawn in a terminal.** Pie, XY chart, radar, quadrant, Sankey, Wardley, timeline, user
  journey, railroad, Venn and Cynefin come out as tables or lists there, not as pictures.
- **Your subgraphs nest and the drawing goes to a terminal.** A nested subgraph is drawn as a band named
  `outer / inner`, not as a box inside a box, so the nesting is not visible.
- **You need a settled API.** This is the first release, 0.1.0. The library ignores an option it does not know,
  without a warning (the command refuses it).
