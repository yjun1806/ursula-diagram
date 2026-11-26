<p align="center"><img src="https://raw.githubusercontent.com/yjun1806/ursula-diagram/main/assets/banner.png" alt="ursula" width="100%"></p>

<p align="center"><b>English</b> · <a href="https://github.com/yjun1806/ursula-diagram/blob/main/README.ko.md">한국어</a></p>

<p align="center"><b>Diagrams your coding agent can draw: Mermaid in, SVG and terminal text out. No browser, no runtime dependencies.</b></p>

<p align="center">
  <a href="https://www.npmjs.com/package/ursula-diagram"><img src="https://img.shields.io/npm/v/ursula-diagram" alt="npm version"></a>
  <a href="https://github.com/yjun1806/ursula-diagram/actions/workflows/ci.yml"><img src="https://github.com/yjun1806/ursula-diagram/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/yjun1806/ursula-diagram/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/ursula-diagram" alt="MIT license"></a>
</p>

<p align="center"><a href="https://yjun1806.github.io/ursula-diagram/"><b>Documentation</b></a> · <a href="https://yjun1806.github.io/ursula-diagram/playground">Playground</a> · <a href="https://yjun1806.github.io/ursula-diagram/examples/">Examples</a></p>

ursula is a diagram engine for coding agents: the agent writes a few lines of Mermaid, and the engine computes where
every box, line and label goes, as an SVG or as a drawing for the agent's terminal. It is built for the case where an
agent writes the diagram, nobody fixes it by hand, there may be no browser, and the same answer is read in a terminal,
a chat window and on the web. It draws all 531 examples in the Mermaid documentation (35 types) both as SVG and as
terminal text, on Node alone with 0 runtime dependencies. With the ursula skill an agent took 11–17 s per drawing;
with a skill that has the model lay out the drawing, 65–174 s. The engine's part of that is 0.1–0.4 s; the rest is
the model reading the skill, writing the Mermaid text and answering.

```
flowchart LR
  order([Order placed]) --> pay{Paid?}
  pay -->|yes| pick[Pick items]
  pay -->|no| remind[Send reminder]
  remind --> pay
  pick --> ship([Ship])
```

<p align="center"><img src="https://raw.githubusercontent.com/yjun1806/ursula-diagram/main/assets/hero.svg" alt="The same flowchart drawn by ursula as SVG" width="640"></p>

<!-- ursula-output --format text --width 80 -->
```
                                         ╭────────────╮   ╭────────────╮
                                ┌─ yes ─▶│ Pick items │──▶│    Ship    │
╭────────────╮   ╭────────────╮ │        ╰────────────╯   ╰────────────╯
│   Order    │──▶│   Paid?    │─┤
│   placed   │   ╰────────────╯ │        ╭────────────╮
╰────────────╯          ▲       └─ no ──▶│    Send    │
                        │                │  reminder  │
                        │                ╰────────────╯
                        │                       │
                        └───────────────────────┘
```

The first block is the input. The picture and the text drawing are what ursula draws from it, with `--format svg`
and with `--format text --width 80`.

## Install and use

Install the command (Node 22 or later):

```bash
npm install -g ursula-diagram
```

Draw a Mermaid file in the terminal, 80 columns wide:

```bash
ursula-diagram order.mmd --format text --width 80
```

Give your coding agent the skill (Claude Code, Codex, Cursor and other agents):

```bash
npx skills add yjun1806/ursula-diagram
```

For an agent without a shell, add the MCP server instead (here in Claude Code):

```bash
claude mcp add ursula -- npx -y ursula-diagram mcp
```

## Documentation

- [Why ursula](https://yjun1806.github.io/ursula-diagram/guide/why): the premises, the measurements, and when another tool fits better
- [Quick start](https://yjun1806.github.io/ursula-diagram/guide/quick-start): install, a first drawing, the Mermaid version it follows
- [Examples](https://yjun1806.github.io/ursula-diagram/examples/): all 531 examples of the Mermaid documentation, as SVG and in the terminal
- [Playground](https://yjun1806.github.io/ursula-diagram/playground): draw a text in the browser
- [In a terminal](https://yjun1806.github.io/ursula-diagram/guide/terminal): text drawings, errors, exit codes, ASCII output
- [Output formats](https://yjun1806.github.io/ursula-diagram/guide/output-formats): `svg`, `text`, `text-svg`, `html`, `json`, `check`, `fixed`, and every option
- [Library](https://yjun1806.github.io/ursula-diagram/guide/library): `render`, `renderText` and the rest of the API
- [Agent skill and MCP](https://yjun1806.github.io/ursula-diagram/guide/agent-skill): installing the skill, the MCP server and its configuration
- [Colours](https://yjun1806.github.io/ursula-diagram/guide/colours): the CSS variables of a drawing
- [Compared with other tools](https://yjun1806.github.io/ursula-diagram/guide/compared): mermaid-cli, Pele, termaid, beautiful-mermaid, mmdflux, mermaid-ascii
- [Roadmap](https://yjun1806.github.io/ursula-diagram/roadmap): what is planned next, backed by GitHub issues

## Contributing

The commands to build, test and compare drawings are on the
[Development](https://yjun1806.github.io/ursula-diagram/guide/development) page. The contributor skill in
[`.claude/skills/ursula-dev/`](https://github.com/yjun1806/ursula-diagram/tree/main/.claude/skills/ursula-dev) walks a
person or an agent through the sources and the pull request flow, and
[RELEASING.md](https://github.com/yjun1806/ursula-diagram/blob/main/RELEASING.md) says how a change reaches a release.

## License

[MIT](https://github.com/yjun1806/ursula-diagram/blob/main/LICENSE). Notices for the Mermaid documentation text in this
repository are in [THIRD_PARTY_NOTICES.md](https://github.com/yjun1806/ursula-diagram/blob/main/THIRD_PARTY_NOTICES.md).
