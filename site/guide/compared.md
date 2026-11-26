---
aside: false
pageClass: compare-page
---

# Compared with other tools

ursula is the only tool here that draws all 531 examples in the Mermaid documentation both as SVG and as terminal
text. Per command it is about 6 times faster than mermaid-cli and about 10 times slower than the native text tools.
Against a skill where the model lays out the picture itself, an agent with ursula took 5 to 13 times less time.

Every number below was measured on one Apple M2 Max (macOS 26.6, Node 26.12.1) on 2026-11-26, with the same input
for every tool. The other tools are mermaid-cli 12.2.0, Mermaid 12.3.0, Pele 1.13.0, beautiful-mermaid 1.1.3,
mmdflux 2.6.1, mermaid-ascii 1.6.2 and termaid 0.14.0.

## Against a skill that draws by hand

An agent can draw a diagram in two ways: the model lays it out and writes the SVG, or the model writes Mermaid and an
engine lays it out. The same three drawings went through [diagram-design](https://github.com/cathrynlavery/diagram-design),
a skill of the first kind, and through the ursula skill.

<FeatureTable name="skill" />

<BenchmarkBars name="skill" />

Both skills kept every node, edge and label. diagram-design also chose a layout, a title and legend wording for each
picture; ursula has one look and changes only its colours.

## What each tool draws

<FeatureTable name="coverage" />

## Speed

<BenchmarkBars name="speed" />

Most of the 103 ms is the start of Node. Called as a library inside one program, the gap turns the other way for two
of the tools:

<FeatureTable name="inProcess" />

## Korean and other wide characters

A Korean or Chinese character takes two cells in a terminal. A tool that counts it as one moves the right edge of
its box and breaks the lines that meet it.

<FeatureTable name="wide" />

## Outputs and what it needs to run

<FeatureTable name="outputs" />

<FeatureTable name="runtime" />

## The same examples side by side

These are examples from the Mermaid documentation, each drawn by four tools at their defaults on a light page. Mermaid
and Pele drew them in headless Chrome.

### Flowchart

<div class="compare-pics">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-flowchart-100-subgraphs-2.svg" alt="Flowchart: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-flowchart-100-subgraphs-2.svg" alt="Flowchart: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-flowchart-100-subgraphs-2.svg" alt="Flowchart: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><img src="/compare/beautiful-mermaid-flowchart-100-subgraphs-2.svg" alt="Flowchart: beautiful-mermaid" loading="lazy"></div></figure>
</div>

### Sequence

<div class="compare-pics">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-sequence-02-with-the-defaults.svg" alt="Sequence: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-sequence-02-with-the-defaults.svg" alt="Sequence: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-sequence-02-with-the-defaults.svg" alt="Sequence: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><img src="/compare/beautiful-mermaid-sequence-02-with-the-defaults.svg" alt="Sequence: beautiful-mermaid" loading="lazy"></div></figure>
</div>

### Class

<div class="compare-pics">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-class-02-with-the-defaults.svg" alt="Class: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-class-02-with-the-defaults.svg" alt="Class: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-class-02-with-the-defaults.svg" alt="Class: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><img src="/compare/beautiful-mermaid-class-02-with-the-defaults.svg" alt="Class: beautiful-mermaid" loading="lazy"></div></figure>
</div>

### Entity relationship

<div class="compare-pics compare-pics-large">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-er-02-entity-relationship-diagrams-2.svg" alt="Entity relationship: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-er-02-entity-relationship-diagrams-2.svg" alt="Entity relationship: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-er-02-entity-relationship-diagrams-2.svg" alt="Entity relationship: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><img src="/compare/beautiful-mermaid-er-02-entity-relationship-diagrams-2.svg" alt="Entity relationship: beautiful-mermaid" loading="lazy"></div></figure>
</div>

### C4 system context

<div class="compare-pics compare-pics-large">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-c4-02-c4-system-context-diagram.svg" alt="C4 system context: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-c4-02-c4-system-context-diagram.svg" alt="C4 system context: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-c4-02-c4-system-context-diagram.svg" alt="C4 system context: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><span class="none">Does not draw this type</span></div></figure>
</div>

### Pie

<div class="compare-pics">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-pie-02-example.svg" alt="Pie: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-pie-02-example.svg" alt="Pie: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-pie-02-example.svg" alt="Pie: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><span class="none">Does not draw this type</span></div></figure>
</div>

## When another tool fits better

- **You need a PNG from the command line.** mermaid-cli writes one, at 630 ms and a Chromium per drawing. ursula
  saves a PNG only from its one-file HTML page.
- **You start a new process for every drawing.** mmdflux and mermaid-ascii take 9 to 11 ms; ursula takes 103 ms,
  59 ms of which an empty Node script already takes.
- **You call a library many times in one program.** Pele (0.015 ms) and beautiful-mermaid's text output (0.009 ms)
  draw a flowchart faster than ursula (0.6 ms).
- **Your labels have emoji and the drawing goes to a terminal.** ursula counts an emoji as one cell, which left 18
  extra breaks in the emoji drawing; mmdflux, mermaid-ascii and termaid left none.
