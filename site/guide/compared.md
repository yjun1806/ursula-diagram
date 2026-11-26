---
aside: false
pageClass: compare-page
---

# Compared with other tools

ursula is the only tool here that draws all 531 examples in the Mermaid documentation both as SVG and as terminal
text. Per command it is about 6 times faster than mermaid-cli and about 10 times slower than the native text tools.
Against a skill where the model lays out the picture itself, an agent with ursula took 6 to 12 times less time.

Every number below was measured on one Apple M2 Max (macOS 26.6, Node 26.12.1) on 2026-11-26, with the same input
for every tool. The other tools are mermaid-cli 12.2.0, Mermaid 12.3.0, Pele 1.13.0, beautiful-mermaid 1.1.3,
mmdflux 2.6.1, mermaid-ascii 1.6.2 and termaid 0.14.0.

## Against a skill that draws by hand

An agent can draw a diagram in two ways: the model lays it out and writes the SVG, or the model writes Mermaid and an
engine lays it out. The same three drawings went through [diagram-design](https://github.com/cathrynlavery/diagram-design),
a skill of the first kind, and through the ursula skill.

diagram-design makes the more designed pictures: a title, zones, a legend, a highlight it chose. ursula's are plainer,
but complete, clean and the same every time, and the agent finished them 6 to 12 times sooner.

<FeatureTable name="skill" />

<BenchmarkBars name="skill" />

Almost all of that time is the model's. The engine itself draws in about 0.1–0.4 s per call; the rest is the model
reading the skill, writing the Mermaid text and answering. The model wrote 0.6k–1.3k tokens with ursula against
6.7k–18.8k when it wrote the drawing itself, and writing tokens takes time.

<FeatureTable name="skillTime" />

The pictures below are the first of the two runs per text, unedited. Under each: the mean time and total tokens of the
two runs, then what we checked in the picture. Click a picture to enlarge it; the name links to the input text.

<PicGrid name="skill" named />

diagram-design chose a layout, a title and legend wording for each picture, and they change from run to run; ursula
has one look and changes only its colours. For each text, the two ursula runs gave byte-identical SVGs.

## What each tool draws

<FeatureTable name="coverage" />

## Speed

<BenchmarkBars name="speed" />

The flowchart example 101-flowcharts, the one with the most lines of the 116, drawn by every tool in the chart at its
defaults; the text tools at 100 columns. The terminal texts are shown as pictures with every character in its own cell,
so the columns hold in any font. beautiful-mermaid's text leaves out a2, b2 and the lines inside the groups, and
mermaid-ascii's runs lines through its own group boxes.

<PicGrid name="tools" />

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
and Pele drew them in headless Chrome. One row per example, one column per tool; click a picture to enlarge it.

<PicGrid name="side" />

## When another tool fits better

- **You need a PNG with nothing more to install.** mermaid-cli writes one as it comes, at 630 ms and a Chromium per
  drawing. ursula writes PNG once the optional `@resvg/resvg-js` (about 4 MB) is installed.
- **You start a new process for every drawing.** mmdflux and mermaid-ascii take 9 to 11 ms; ursula takes 103 ms,
  59 ms of which an empty Node script already takes.
- **You call a library many times in one program.** Pele (0.015 ms) and beautiful-mermaid's text output (0.009 ms)
  draw a flowchart faster than ursula (0.6 ms).
- **Your labels have emoji and the drawing goes to a terminal.** ursula counts an emoji as one cell, which left 18
  extra breaks in the emoji drawing; mmdflux, mermaid-ascii and termaid left none.

## Run it yourself

The scripts that measured these numbers are in the repository under `bench/`. In a clone, this installs the other
tools into `bench/.cache` and measures what each tool draws, the time per command and per library call, and the wide
characters. It takes about half an hour, and mermaid-cli downloads Chromium:

```bash
npm run bench:tools
```

This times ursula and Mermaid.js in one page of headless Chrome:

```bash
npm run bench:browser
```

[bench/README.md](https://github.com/yjun1806/ursula-diagram/blob/main/bench/README.md) says what each one measures, what it needs, and how to rerun the skill comparison, which
runs Claude Code and costs money. If a number is wrong or a tool has a newer version, [open an issue](https://github.com/yjun1806/ursula-diagram/issues/new).
