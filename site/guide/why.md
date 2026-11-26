---
description: 'Why ursula: Mermaid for AI coding agents. It renders Mermaid without a browser, names the fix in every error and gives the same drawing every time.'
---

# Why ursula

ursula is built for a situation where the four statements below hold. Check them against your own case first.

1. An agent, not a person, writes the diagram: as part of an answer, often several in one session.
2. Nobody fixes it by hand: if the text is wrong, the agent has to notice and fix it alone.
3. There may be no browser: a terminal, CI, a sandbox or a server without Chromium.
4. The same answer is read in more than one place: a terminal, a chat window, a web page, a README.

If these hold for you, the four things in the table matter more than anything else. The numbers were measured under
the [conditions](#conditions) at the end of the page.

| Premise | What ursula does | Measured |
| --- | --- | --- |
| The agent draws several pictures a session | The model writes Mermaid only; the engine computes the layout | 11–17 s a drawing, against 65–174 s for a skill that has the model lay it out; the engine's part is 0.1–0.4 s. Two runs give byte-identical SVGs |
| The agent fixes it alone | An error names the place, the word likely meant and a correct example line. The check names crossing lines by their source line | In 93 deliberately broken texts, replacing the line with the error's example drew all 93. `--fix` draws 50 of them with no extra turn |
| There may be no browser | It runs on Node alone | 0 runtime dependencies. 103 ms per run of the command |
| It is read in several places | One engine draws an SVG, a terminal drawing and that drawing as an SVG (`text-svg`). Clients without a shell get it over MCP | All 531 examples in the Mermaid documentation, as SVG and as terminal text (35 types) |

The other way round: if a person polishes one important picture by hand, or Mermaid in a browser already serves you
well, you may not need ursula. [When ursula is not the right tool](#when-ursula-is-not-the-right-tool) gives the
numbers.

## When the model lays out the drawing

Some drawing skills have the model plan the layout itself.
[diagram-design](https://github.com/cathrynlavery/diagram-design) has the model choose the layout and write the SVG.
We drew the same three Mermaid texts twice with that skill and twice with the ursula skill. Each cell is first run /
second run.

| Drawing | Skill | Seconds | Tokens the model wrote | Total tokens | Turns |
| --- | --- | ---: | ---: | ---: | ---: |
| Flowchart, 9 nodes | diagram-design | 65 / 78 | 6.7k / 8.5k | 330k / 443k | 10 / 12 |
| | ursula | 12 / 11 | 0.7k / 0.6k | 36k / 36k | 4 / 4 |
| C4, 7 elements | diagram-design | 154 / 174 | 15.4k / 17.7k | 379k / 672k | 11 / 14 |
| | ursula | 16 / 17 | 1.3k / 1.3k | 40k / 40k | 4 / 4 |
| Sequence, 10 messages | diagram-design | 161 / 144 | 18.8k / 17.9k | 666k / 392k | 14 / 10 |
| | ursula | 13 / 14 | 0.8k / 0.9k | 37k / 37k | 4 / 4 |

The total includes each skill's own instructions and the conversation that is sent again on every turn. What the
model actually wrote is the column of output tokens. The ursula rows are from the skill of
[pull request #49](https://github.com/yjun1806/ursula-diagram/pull/49), measured later the same day as diagram-design.

Where the time went, per run, from the timestamps in each session's stream:

| Skill | Waiting for the model | The skill's own command | Other commands |
| --- | ---: | ---: | ---: |
| ursula | 8–12 s | 3.4–5.5 s (ursula) | 0–0.1 s |
| diagram-design | 63–170 s | 0.4–1.9 s (its scripts) | 1.3–2.9 s |

The engine itself draws in about 0.1–0.4 s per call; the rest is the model reading the skill, writing the Mermaid text
and answering. The model wrote 0.6k–1.3k tokens with ursula against 6.7k–18.8k when it wrote the drawing itself, and
writing tokens takes time. A run with ursula went: load the skill, write the text and run the command, then answer. A run with diagram-design read its references, spent 35–127 s planning
and writing the drawing (or a script that writes it), then checked it, looked at a screenshot and fixed it.

The ursula command took longer inside the session than alone, most likely because it was the session's first command:
the first command took 1.2–5.5 s whatever it ran, and diagram-design's, a cat, took 1.2–1.9 s.

diagram-design drew the same text differently from run to run. The flowchart came out as horizontal lanes the first
time and as zone boxes the second. Its title ("Order fulfilment flow") and legend ("Paid handoff to warehouse") are
words the model made up; they are not in the input. The ursula skill gave byte-identical SVGs in both runs for all
three texts.

<div class="compare-pics compare-pics-large">
  <figure><figcaption>diagram-design, first run</figcaption><div><img src="/skill-compare/order-flow-diagram-design.png" alt="Flowchart drawn by diagram-design" loading="lazy"></div></figure>
  <figure><figcaption>ursula, first and second run</figcaption><div><img src="/skill-compare/order-flow-ursula.svg" alt="Flowchart drawn by ursula" loading="lazy"></div></figure>
</div>

diagram-design's picture is the better designed: the model chose a node to emphasise and added a legend. ursula's
is plainer, but no node, edge or label is missing, and it is the same every time.

This table is the cost of having the model lay out the drawing. If the model writes Mermaid and Mermaid.js draws it,
we expect the turns to drop about as far as with ursula (not measured). The next section is about that case.

## When Mermaid.js draws it

If the model writes Mermaid and Mermaid.js draws it, the model takes few turns. The differences from ursula are where
it can draw and what its errors say.

**Where it draws.** Mermaid.js needs a DOM. On the command line, mermaid-cli downloads Chromium when it is installed
and starts a headless Chromium for every drawing: 630 ms each. ursula runs on Node alone, 103 ms per run of the
command. Mermaid.js also gives only an SVG, so an agent answering in a terminal can show only the Mermaid source.
ursula draws the same text as a terminal drawing too.

**Errors.** Mermaid also tells you where it failed. ursula also tells you what to write there. Given a text whose
first line is `flowchrt LR`, `mermaid.parse` in Mermaid 12.3.0 answers:

```
No diagram type detected matching given configuration for text: flowchrt LR
```

ursula answers:

```ursula-output exit=1 --format text
flowchrt LR
  A --> B
```

An error with only one possible fix, like this one, is fixed by the engine with `--fix`, which then draws and names
the line it changed. Once the text draws, `--format check` names each pair of crossing lines with their source line
numbers.

**Speed.** For an agent whose turn takes seconds, this hardly matters. It does for a live preview in a browser or for
many drawings: a flowchart takes a median of 0.7 ms in ursula and 20.6 ms in Mermaid.js. The browser file is 330 kB
gzipped for ursula and 1.58 MB for Mermaid.js.

## Text-drawing tools

termaid, mmdflux and mermaid-ascii also draw Mermaid as terminal text. mmdflux and mermaid-ascii are single native
binaries: 9–11 ms per run, about 10 times faster than ursula. All three keep labels with emoji in line. termaid and
mermaid-ascii line up wide characters such as Korean as ursula does.

The difference is how many types they draw. Of the 531 examples in the Mermaid documentation, termaid draws 366 (18
types), mmdflux 206 (4 types) and mermaid-ascii 160 (3 types); ursula draws 531 (35 types). termaid and
mermaid-ascii do not write SVG.

## When ursula is not the right tool

- **A person designs one picture with care.** ursula's drawings have one look, and only the colours can change. A
  drawing skill or a designer does better.
- **You need a PNG with nothing more to install.** ursula writes PNG only once the optional `@resvg/resvg-js`
  (about 4 MB) is installed. mermaid-cli writes one as it comes, at 630 ms and a Chromium per drawing.
- **You start a new process for every drawing.** mmdflux and mermaid-ascii take 9–11 ms, ursula 103 ms, of which
  59 ms is what an empty Node script takes.
- **Labels in a terminal drawing contain emoji.** ursula counts an emoji as one cell, so the drawings with emoji had
  18 more broken line ends. mmdflux, mermaid-ascii and termaid had none.

## Try it

Draw your own Mermaid text in the [playground](/playground). Install the agent skill with:

```bash
npx skills add yjun1806/ursula-diagram
```

[Agent skill](/guide/agent-skill) sets up the skill and the MCP server, and
[Compared with other tools](/guide/compared) has the numbers per tool.

## Conditions

Everything was measured on 26 November 2026 on one Apple M2 Max (macOS 26.6, Node 26.12.1). The skills were run in
Claude Code with claude-opus-5-5, a fresh session and the same prompt for each run, on three public Mermaid texts, two
runs each; the ursula skill was that of pull request #49 and diagram-design at commit b228c5d. One run of the command is the median over 103 flowchart examples of the Mermaid documentation. Browser
speed is the median over 116 flowchart examples drawn as SVG by both in one page of headless Chrome 158. Tool
versions: mermaid-cli 12.2.0, Mermaid 12.3.0, mmdflux 2.6.1, mermaid-ascii 1.6.2, termaid 0.14.0.

The scripts are in the repository under `bench/`. In a clone, this measures the other tools and the command:

```bash
npm run bench:tools
```

This measures the speed in the browser:

```bash
npm run bench:browser
```

[bench/README.md](https://github.com/yjun1806/ursula-diagram/blob/main/bench/README.md) has the details, including the skill comparison. If a number is wrong or a tool has a newer
version, [open an issue](https://github.com/yjun1806/ursula-diagram/issues/new).
