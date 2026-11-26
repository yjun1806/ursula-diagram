# Benchmarks

These scripts measured every number on the comparison pages of the docs site and in the README. Each benchmark runs
from a fresh clone with one command and writes JSON to `bench/results/`. If a number is wrong or a tool has a newer
version, [open an issue](https://github.com/yjun1806/ursula-diagram/issues/new).

| Benchmark | What it measures | Command | Took |
| --- | --- | --- | --- |
| [Tools](#tools) | What eight Mermaid tools draw, and how fast, from the command line and as a library | `npm run bench:tools` | about 20 min |
| [Browser](#browser) | ursula against Mermaid.js in one page of headless Chrome | `npm run bench:browser` | about 30 s |
| [Agent skill](#agent-skill) | An agent drawing with the ursula skill against a skill where the model lays out the drawing | `bash bench/agent-skill/run-all.sh` | about 15 min, about 5.60 USD |

None of this is part of the npm package: `bench/` is not in `files`, and the benchmark dependencies are in
`bench/package.json`, not in the package's own (which has none at run time).

## The published numbers

The site and the README quote the numbers in `bench/results/`, all measured on 26 November 2026 on one Apple M2 Max
with macOS 26.6.2, Node 26.12.1 and Python 3.14.6. The counts come from a run of `npm run bench:tools`; the times come
from the earlier run of the same day that the site quotes, with the same method and tool versions, and the browser
times from headless Chrome 158. `results/run.json` names the ursula commit and every tool version. The run times in
the table above were taken while other work loaded the machine.

| File | Holds |
| --- | --- |
| `coverage.json` | Examples drawn per tool and output, per type |
| `per-command.json` | Time per command on the flowchart examples, and an empty Node script for scale |
| `in-process.json` | Time per library call inside one Node process |
| `wide.json` | Broken line ends in Korean, Chinese/Japanese and emoji drawings |
| `browser.json` | Time per flowchart in the browser, and the gzip size of each browser file |
| `site.json` | The numbers above in the shape of the site's chart and table data |
| `../agent-skill/results.json` | Time, turns, tokens and cost of every agent-skill run of the first measurement |
| `../agent-skill/results-2026-11-26-ursula-8c8222c.json` | The same for the ursula skill measured again with the skill at commit 8c8222c |
| `../agent-skill/breakdown-2026-11-26.json` | Where the time of each of those runs went: model, the skill's command, other commands, turn by turn |

Times depend on the machine and on what else runs on it. Expect your times to differ from ours; the ratios between
tools move much less. Counts of drawn examples and broken line ends do not depend on the machine.

## What counts as a drawing

A tool drew an example when it exited with 0 and its output is a drawing: text with at least one visible character,
or an SVG that is not an error picture (`aria-roledescription="error"`). Whether the picture is right is not judged.
The rule is `is_drawing` in [tools/tools.py](tools/tools.py) and the same checks in
[tools/in-process.mjs](tools/in-process.mjs) and [browser/page.html](browser/page.html). Every timed call is checked
too: a call that throws or returns no drawing is never timed as a drawing, and a file counts for a tool only when every
timed run of it drew.

## Tools

Needs Node 22 or later, Python 3.9 or later with `venv`, `tar`, and network access to npm, PyPI and GitHub releases.
Go and Rust are not needed: mmdflux and mermaid-ascii are their release binaries for macOS (arm64, x64) or Linux
(x64; mermaid-ascii also arm64), checked against the SHA-256 sums in [tools/versions.json](tools/versions.json). Windows
is not supported. If `dist/` is not built, the script builds ursula with Bun through `npx`.

```bash
npm run bench:tools
```

It installs the other tools into `bench/.cache` (about 1.2 GB; mermaid-cli downloads Chrome for Testing through
Puppeteer), then runs these steps. Name steps to run only those, for example `npm run bench:tools -- coverage wide`.

| Step | Script | What it does |
| --- | --- | --- |
| `install` | [install.mjs](tools/install.mjs) | npm packages from the lockfiles in [tools/lock/](tools/lock/), termaid in a venv, the two binaries |
| `coverage` | [coverage.py](tools/coverage.py) | Every tool and output on the 531 examples in `site/examples/official`, one command per drawing |
| `command` | [per_command.py](tools/per_command.py) | The 116 flowchart examples, a new process per drawing, 3 runs, round by round so a slow moment hits every tool alike. The median per file, then the median over the files every tool draws |
| `library` | [in-process.mjs](tools/in-process.mjs) | ursula, Pele and beautiful-mermaid inside one Node process: one warm-up pass, then 10 calls per file, each with a different trailing comment line so no cache can answer |
| `wide` | [wide.py](tools/wide.py) | The 13 Korean drawings in [inputs/wide/ko](inputs/wide/ko) against the same 13 in English, plus a Chinese/Japanese and an emoji drawing, with the break counter [break_count.py](tools/break_count.py) |
| `site` | [to-site.mjs](tools/to-site.mjs) | Writes `results/site.json` |

| Tool | Version | Called as |
| --- | --- | --- |
| ursula | this checkout | `skills/ursula/scripts/ursula.mjs`; the library from `dist/index.js` |
| mermaid-cli | 12.2.0 (Mermaid 12.3.0, Puppeteer 25.18.1) | `mmdc -i -o` |
| Pele | 1.13.0 | [tools/pele-cli.mjs](tools/pele-cli.mjs) and the package's main entry; it has no command of its own |
| beautiful-mermaid | 1.1.3 | [tools/bm-cli.mjs](tools/bm-cli.mjs); it has no command of its own |
| mmdflux | 2.6.1 | `mmdflux --color off -f text` or `-f svg` |
| mermaid-ascii | 1.6.2 | `mermaid-ascii -f <file> --max-width 100` |
| termaid | 0.14.0 | `termaid --width 100 <file>` |

Text tools with a width option get 100 columns (`WIDTH` changes it). For the timing steps, stop other work on the
machine first.

## Browser

Needs Node 22 or later. It installs Puppeteer and Mermaid into `bench/node_modules` from
[package-lock.json](package-lock.json), and Puppeteer downloads Chrome for Testing into `bench/.cache`.

```bash
npm run bench:browser
```

[browser/page.html](browser/page.html) draws the 116 flowchart examples with `ursula.render` (from
`dist/ursula.global.js`) and `mermaid.render` (from `mermaid.min.js`) in the same page: one untimed pass each, then
one timed pass. It reports the median and the 10th to 90th percentile per drawing, and the gzip size of each file.

The published browser numbers were taken in headless Chrome 158; this script uses the Chrome for Testing that
Puppeteer 25.18.1 downloads.

## Agent skill

This one runs Claude Code and costs money: about 5.60 USD for the twelve runs on our account. It needs the `claude`
command, signed in.

```bash
bash bench/agent-skill/run-all.sh
```

Each run is a fresh headless session (`claude -p`) in an empty folder that holds one skill:
the ursula skill from `skills/ursula` in this checkout, or
[diagram-design](https://github.com/cathrynlavery/diagram-design) at commit `b228c5d`. Both skills get the same
[prompt](agent-skill/prompt.txt) with one of the three [inputs](agent-skill/inputs), twice. The sessions load project
settings only, with no MCP servers and the same five tools (Bash, Read, Write, Edit, Skill); the model is
`claude-opus-5-5` (`MODEL` changes it). [run.sh](agent-skill/run.sh) is one run;
[summarize.py](agent-skill/summarize.py) collects time, turns, tokens and cost into
[agent-skill/results.json](agent-skill/results.json). Every stream and every file the sessions wrote stays in
`bench/.cache/agent-skill/out`.

The site quotes the diagram-design runs from `results.json` and the ursula runs measured again later the same day with
the skill at commit 8c8222c, in `results-2026-11-26-ursula-8c8222c.json`. Those six ursula runs cost 0.69 USD. To run
only one skill, call `run.sh` per input and run, then name the output file:

```bash
python3 -I bench/agent-skill/summarize.py bench/agent-skill/results-ursula.json
```

[breakdown.py](agent-skill/breakdown.py) splits each run's time, from the timestamps in its stream, into waiting for
the model, the skill's own command (ursula, or diagram-design's scripts) and other commands, and lists what each turn
did. The first command of every session took 1.2–3.8 s whatever it ran, so the ursula command's time there is more
than the 0.1–0.4 s it takes on these texts alone.

```bash
python3 -I bench/agent-skill/breakdown.py bench/.cache/agent-skill/out > breakdown.json
```
