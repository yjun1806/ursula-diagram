---
name: ursula-dev
description: Work on the ursula-diagram repository itself - change the engine, a diagram type, the command, the MCP server, the docs site or the release. Covers the source map, build, tests, golden outputs, the output comparison, the terminal breakage rule and the pull request flow. Not for drawing diagrams; the ursula skill does that.
metadata:
  internal: true
---

# Working on ursula-diagram

Read this before changing anything in this repository. To draw a diagram, use the `ursula` skill in `skills/ursula/`.

## Map

| Where | What |
| --- | --- |
| `src/index.ts` | Library entrance: `render`, `renderText`, `renderTextSpans`, `renderTextSvg`. Importing it registers every front end. |
| `src/registry.ts` | Picks the front end by the first word of the text; strips front matter; wraps errors. |
| `src/<type>/` | One diagram type: `parse.ts`, `frontend.ts` (svg, terminal lines, json), and its own layout when it has one. Flowcharts live in `src/parse.ts` and `src/flowchart-frontend.ts`. |
| `src/layout/` | Layout of boxes and lines (flowchart, class, state, ER, requirement, architecture, C4, use case): `layout()` in `index.ts` picks the engine; the grid engine (`engine: 'grid'`), labels, records, terminal tidying and checks. `text-intact.ts` holds `breaksOf`. |
| `src/layered/` | The layered engine, the default: ranks, order, ports, routing, bands, questions. |
| `src/chart/` | Shared pieces of the charts (ticks, arcs, label placement). |
| `src/render/` | SVG (`svg.ts`, `scene-svg.ts`, themes), terminal text (`text.ts`), ASCII (`ascii.ts`), terminal as SVG (`text-svg.ts`), HTML. |
| `src/text/` | Fitting, wrapping and cutting text by terminal cells. `src/metrics.ts` has the rulers (pixels, cells). |
| `src/errors/` | Error messages: where, why, `did you mean`, hints, and `--fix` (`fix.ts`). |
| `src/syntax/` | The catalog behind `ursula syntax <type>`: one entry per type. |
| `src/command/`, `src/cli.ts` | The command: options, help, exit codes, `--check` report. |
| `src/mcp/` | The MCP server and its tools. |
| `skills/ursula/` | The product skill. `scripts/ursula.mjs` is built from `src/`; never edit it by hand. |
| `site/` | VitePress docs and playground, English and Korean. `site/examples/official/<type>/*.mmd` are the official examples. |
| `scripts/docs/` | What the docs show: running the built command, the texts and pictures they draw, the README outputs, the commands they name. `scripts/docs-sync.mjs` is `npm run docs:sync`. |
| `test/` | Vitest suites; `test/golden.json` holds output hashes. |

## Setup

Use Node 22 or later. Install the dependencies:

```bash
npm install
```

Bun runs the build; it need not be installed, `npx` fetches it (see "The bundled command" below). `npm run build` does the same when `bun` is on the path. Node 24 or later runs the sources directly: `node src/cli.ts d.mmd --format text`.

## Tests

- `npx tsc --noEmit` and `npm test` before every push. CI runs both.
- `npm run test:rewrite` compares the layered engine with its reference versions. It takes about a quarter of an hour; run it when you change `src/layered/`.
- Speed tests assert time limits with `within(ms)` from `test/speed.ts` (three times wider on CI). Do not raise a limit to make a test pass; find what got slower.
- Add a test that fails without your change. Put it in the suite of the type or module you changed.

## Golden outputs

`test/golden.test.ts` hashes the SVG and the terminal text (80 and 120 columns) of fixed graphs. When it fails, the drawing changed. If the change is intended, regenerate and review the diff of `test/golden.json` in the same commit:

```bash
URSULA_UPDATE_GOLDEN=1 npx vitest run test/golden.test.ts
```

The pictures in `assets/` and `examples/` (`.svg`, `.txt`) and the terminal drawings in the READMEs are files the command draws. When a drawing changes on purpose, rebuild and redraw them; `test/docs.test.ts` fails until they match:

```bash
npm run docs:sync
```

## Compare outputs before every engine pull request

```bash
npm run compare
```

It draws all official examples with your working tree and with `origin/main` (in a temporary worktree), and prints a Markdown block: changed SVG and terminal outputs, errors, `breaksOf` counts of the flowchart examples, and time per example. Paste it into "Output impact" and "Performance" of the pull request. Use `-- --base <ref>` for another base and `-- --list` to name every changed example. Open the changed examples and look at them; a count of 0 is the only number that proves nothing changed.

## The terminal breakage rule

`breaksOf` (`src/layout/text-intact.ts`) counts what breaks in a terminal drawing: broken lines and boxes, tangled or hugging lines, stray, covered or unseen labels, and more. Merge but tighten: a terminal change may widen a drawing or add bends, but must not raise any breakage count. `npm run compare` exits 1 when one rises. Fix the cause; do not trade one kind of break for another.

## Docs site

When you change `site/` or a README:

```bash
cd site && npm ci && npm run build && npm run check
```

`npm run check` (`site/scripts/check-playground.mjs`) fails when:

- a code block has no copy button, or Mermaid text is not in a `mermaid` block (those wrap instead of scrolling);
- a shell block holds more than one command or a trailing `# comment`. Say what a command is for in the sentence before it. Mark a block whose lines must run together in order with `<!-- sequence -->` in a README, or wrap it in `<div class="cmd-sequence">` on the site;
- an English page has no Korean page, or an example fails to draw;
- a command the docs name fails (the same check as `npm test`), or a page claims another number of Mermaid documentation examples than the Examples pages show.

Docs never paste what the command prints; they show what it prints now:

- On a site page, a fence ```` ```ursula-output <options> ```` becomes what `ursula-diagram <options>` prints at build time, for the fence's body as input or the text named by `input=` (`home`, `gallery:<id>`, `gallery-ko:<id>`, `file:<path>`; see `scripts/docs/sources.mjs`). Give `exit=N` when the output is an error. A fence ```` ```ursula-input <name> ```` shows that text. The plugin is `site/.vitepress/ursula-output.mjs`.
- The home page's drawings and card outputs come from `site/scripts/render-home.mjs`; each card in `home/agents.js` names its commands and, for an error, its `exit`.
- In a README, a line `<!-- ursula-output <options> -->` above a fence marks it as the output for the Mermaid fence above it. `npm run docs:sync` rewrites it.
- Every command a page, a README or a skill names is run by `npm test` (`test/docs.test.ts`) and by the site check against the built command, and must end with 0, or with N given by an `<!-- exit N -->` line above its fence. A command that installs, needs the network or works on the checkout itself is listed in `ALLOWED` of `scripts/docs/commands.mjs` with the reason; a command that neither runs ursula nor is listed fails.
- The same test fails when Output formats misses a `--format`, Agent skill misses an MCP tool or argument, or a page imports a name the package does not export.

The READMEs stay short: a tagline, one example, install, and links into the site. Details go on a site page, not in a README. Also keep English and Korean in step (README.md and README.ko.md, `site/` and `site/ko/`), write diagram type names in English in both, and never write a version number in docs; the install commands take the latest. The one exception is the release headings under "Done" on the roadmap pages.

## The bundled command

`skills/ursula/scripts/ursula.mjs` is the command built from `src/`. After any change to `src/`, rebuild it and commit it with the change; CI fails when it does not match the sources:

```bash
npx -y bun@1 scripts/build.ts
```

## Public surface

Treat these as the public interface and update the site pages (en and ko) and tests with them: command options and `--help`, exit codes (1 text error, 2 wrong options, 3 too narrow, 4 engine failure), MCP tools and their arguments, library exports and types in `src/index.ts`, and the `syntax` catalog.

## Pull requests

1. Branch from `main`: `git switch -c <type>/<topic>` (`feat`, `fix`, `docs`, `perf`, `refactor`, `test`, `ci`, `chore`).
2. Commit as `<type>: <description>`. Keep a pull request to one change.
3. Push and open a pull request against `main`. Fill in every section of `.github/pull_request_template.md`; write `N/A` with a reason rather than deleting one.
4. The `test` check of the CI workflow must pass. `main` takes no direct pushes.
5. Squash-merge; the pull request title becomes the commit on `main`, so give it the `<type>: <description>` form.

## Roadmap

`site/roadmap.md` and `site/ko/roadmap.md` list the open issues labelled `roadmap`, one line and a link each. GitHub issues are the source of truth; the page follows them.

- New planned work: open an issue with the `roadmap` label, then add one line to Planned on both pages.
- When a pull request ships a roadmap item: in the same pull request, move its line to "Done" ("완료" on the Korean page) as a plain line (strike through only the finished sub-points of an item that stays under Planned), under `### Unreleased` (`### 출시 예정`; add the heading if it is missing, and the release pull request renames it to the version), with the issue and pull request links (keep about ten lines there), and write `Fixes #<n>` so merging closes the issue.
- When a pull request ships only part of a roadmap item: keep the item under Planned with its issue link, list its parts as sub-points, and strike through the finished parts with the pull request link. Link only pull requests there, not issues: the check reads every issue link under Planned and In progress as open.
- When an issue closes or changes without such a pull request (closed by hand, scope narrowed), update both pages in a pull request of their own.
- `npm run check` in `site/` fails when the two pages list different issues, and, when it can reach GitHub, when Planned and In progress differ from the open `roadmap` issues. Without network it prints `skip the roadmap against GitHub` and the rules above are the only guard.

## Releases

Follow `RELEASING.md`: a release is a pull request `chore: release <version>` that sets the version in `package.json` and `src/version.ts` and rebuilds the bundled command. Merging it publishes to npm, tags `v<version>` and creates the GitHub release.
