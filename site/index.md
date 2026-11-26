---
layout: home

hero:
  name: ursula-diagram
  text: Mermaid text to SVG and terminal text
  tagline: No browser, no runtime dependencies. The same text always gives the same drawing.
  actions:
    - theme: brand
      text: Quick start
      link: /guide/quick-start
    - theme: alt
      text: Playground
      link: /playground
    - theme: alt
      text: GitHub
      link: https://github.com/yjun1806/ursula-diagram

features:
  - title: Every diagram type
    details: Reads the Mermaid text of any of the 35 diagram types in the Mermaid documentation and computes where every box, line and label goes.
  - title: SVG and terminal text
    details: One engine draws both an SVG and a drawing in terminal cells, so the picture also shows up where an agent actually answers.
  - title: Node alone
    details: No browser, no DOM, nothing to install at run time. The same text always gives the same drawing.
---

<TypeGrid />

<div class="home-prose">

## What it does

ursula-diagram reads the Mermaid text of any of the 35 diagram types in the Mermaid documentation and computes where every
box, line and label goes. It is made for coding agents: the agent writes a few lines of Mermaid, and the engine lays
them out, as an SVG or as a drawing for the agent's terminal, in a median of 0.36 ms. The same text always gives the
same drawing. It runs on Node alone: no browser, no DOM, nothing to install at run time.

The drawing at the top of this page is one such text and what ursula draws from it, unedited: the SVG with
`--format svg` and the terminal text with `--format text --width 80` (`--width 40` on a narrow screen). Try your own
text in the [playground](/playground).

</div>
