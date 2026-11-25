# Why ursula

An agent that wants to show a diagram usually takes one of two roads.

- **A drawing skill.** The model plans the layout itself, writes the coordinates or a script that computes them,
  checks the result and plans again. The pictures can look hand-made, with zones, a legend and emphasis chosen for
  each one. But every round of planning and checking is another model turn, so one drawing takes many turns and many
  tokens, and the same request can come out different the next time.
- **Mermaid as it is.** The model writes Mermaid text and Mermaid draws it. This is fast and cheap for the model,
  but Mermaid draws in a browser (or, from the command line, in a headless Chromium), the model cannot see what the
  layout came out like, and in a terminal the reader sees only the source text.

ursula sits between the two. The model writes Mermaid only, never a coordinate: the official examples have a
median of 154 bytes of text, and the order flowchart on the [home page](/) is 315. The engine does the layout, with no model in the
loop, so the same text gives the same drawing. One engine draws both an SVG and a drawing in terminal cells, so the
picture also shows up where an agent actually answers: in the terminal.

Measured on an Apple M2 Max with Node 26, over the 531 examples in the Mermaid documentation, each drawn five
times (the last two rows: one flowchart, six runs of the command each):

| | Median | Slowest |
| --- | --- | --- |
| SVG, from the library | 0.36 ms | 79.6 ms |
| Terminal text at width 100, from the library | 0.29 ms | 46.3 ms |
| One run of the command, order flowchart, `--format text` | 0.15 s | |
| One run of the command, order flowchart, `--format svg` | 0.35 s | |

A run of the command is mostly the start of Node and the reading of the one-file bundle (1.56 MB).
In place of the model looking at its own picture, `--format check` prints the count of bends and crossings and,
sometimes, a question about the text. The agent skill answers the questions once and then draws; it does not loop.
