---
title: 'ursula-diagram: Mermaid to SVG and terminal text, no browser'
titleTemplate: false
description: 'ursula-diagram is a Mermaid CLI and library that renders Mermaid to SVG and terminal text without a browser. Its errors tell AI coding agents how to fix it.'
layout: home

hero:
  name: ursula-diagram
  text: Diagrams your coding agent can draw
  tagline: Mermaid in, SVG and terminal text out. Every error tells your agent where, what and how to fix, so it fixes its own diagram and draws again. The same text always gives the same drawing.
  actions:
    - theme: brand
      text: Quick start
      link: /guide/quick-start
    - theme: alt
      text: Agent skill
      link: /guide/agent-skill
    - theme: alt
      text: Playground
      link: /playground
    - theme: alt
      text: GitHub
      link: https://github.com/yjun1806/ursula-diagram
---

<AgentCards />

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
