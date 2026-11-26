# Roadmap

What ursula plans to support next. Each item is a GitHub issue, and the issue is where the work is discussed and
tracked; this page lists them. There are no dates. To suggest something, [open an issue](https://github.com/yjun1806/ursula-diagram/issues/new).

All open roadmap items: [issues labelled `roadmap`](https://github.com/yjun1806/ursula-diagram/issues?q=is%3Aissue%20state%3Aopen%20label%3Aroadmap).

## Planned

- Apply Mermaid styling (`classDef`, `class`, `style`, `linkStyle`, `:::`, `themeVariables`) to SVG and terminal drawings; today it is read and ignored. [#24](https://github.com/yjun1806/ursula-diagram/issues/24)
- Docs build plugins for markdown-it (VitePress) and remark/rehype (Docusaurus, Astro, Next.js MDX) that draw Mermaid blocks at build time. [#26](https://github.com/yjun1806/ursula-diagram/issues/26)
- A GitHub Action that renders Mermaid in pull requests and READMEs. [#27](https://github.com/yjun1806/ursula-diagram/issues/27)
- A scheduled job that draws the examples in the Mermaid docs and opens an issue for any that fail. [#28](https://github.com/yjun1806/ursula-diagram/issues/28)
- A shorter agent loop. [#29](https://github.com/yjun1806/ursula-diagram/issues/29)
  - ~~`--fix` for a misspelt header or keyword and a flowchart `->`.~~ [#13](https://github.com/yjun1806/ursula-diagram/pull/13)
  - ~~A skill 17% shorter that stops re-checking a successful drawing.~~ [#49](https://github.com/yjun1806/ursula-diagram/pull/49)
  - `--fix` for more of the mistakes agents make.
  - A `--check` that counts the crossings and bends of the terminal drawing itself, not of the SVG layout.
- Tidier terminal drawings. [#30](https://github.com/yjun1806/ursula-diagram/issues/30)
  - ~~Rounded boxes, with most side-by-side arrowheads kept apart.~~ [#19](https://github.com/yjun1806/ursula-diagram/pull/19)
  - ~~Faster terminal drawings, winning back most of the time rounded boxes added.~~ [#39](https://github.com/yjun1806/ursula-diagram/pull/39)
  - Boxes sized to their own text.
  - Emoji counted as two cells.
  - No side-by-side arrowheads in the C4 examples at 80 columns or the actor column of use case diagrams.
- Theme presets as CSS-variable sets, such as `monochrome` and `blueprint`. [#31](https://github.com/yjun1806/ursula-diagram/issues/31)

## In progress

Nothing at the moment.

## Done

What has shipped, struck through, under the version it shipped in. Full notes for each version: [releases](https://github.com/yjun1806/ursula-diagram/releases).

### 0.2.1 (2026-11-26)

- ~~`--version` and `-v` print the version.~~ [#61](https://github.com/yjun1806/ursula-diagram/pull/61)

### 0.2.0 (2026-11-26)

- ~~PNG output with `--format png`, through an optional renderer so the default install keeps 0 runtime dependencies; each PNG reads only the font files it needs.~~ [#32](https://github.com/yjun1806/ursula-diagram/issues/32), [#46](https://github.com/yjun1806/ursula-diagram/pull/46), [#58](https://github.com/yjun1806/ursula-diagram/pull/58)
- ~~A shorter agent loop: the MCP server, `syntax`, `--check` and exit codes, `--fix` for a misspelt header or keyword, and a skill 17% shorter that stops re-checking a successful drawing.~~ [#5](https://github.com/yjun1806/ursula-diagram/pull/5), [#13](https://github.com/yjun1806/ursula-diagram/pull/13), [#49](https://github.com/yjun1806/ursula-diagram/pull/49)
- ~~Terminal boxes with rounded corners, and side-by-side arrowheads kept apart.~~ [#19](https://github.com/yjun1806/ursula-diagram/pull/19)
- ~~Faster terminal drawings, winning back most of the time rounded boxes added.~~ [#33](https://github.com/yjun1806/ursula-diagram/issues/33), [#39](https://github.com/yjun1806/ursula-diagram/pull/39), [#41](https://github.com/yjun1806/ursula-diagram/pull/41), [#43](https://github.com/yjun1806/ursula-diagram/pull/43), [#45](https://github.com/yjun1806/ursula-diagram/pull/45), [#48](https://github.com/yjun1806/ursula-diagram/pull/48), [#50](https://github.com/yjun1806/ursula-diagram/pull/50)
- ~~`--color` tones in the terminal for every diagram type.~~ [#44](https://github.com/yjun1806/ursula-diagram/pull/44), [#52](https://github.com/yjun1806/ursula-diagram/pull/52)
- ~~A Gantt chart without tasks draws as an empty frame, so all 531 of 531 examples in the Mermaid docs draw.~~ [#4](https://github.com/yjun1806/ursula-diagram/pull/4)
- ~~The Examples pages show those 531 examples, each as SVG and as a terminal drawing in tabs.~~ [#8](https://github.com/yjun1806/ursula-diagram/pull/8), [#11](https://github.com/yjun1806/ursula-diagram/pull/11)
- ~~Every drawing, error and command the docs show comes from the built command at build time.~~ [#51](https://github.com/yjun1806/ursula-diagram/pull/51)
- ~~The benchmarks behind the comparison pages, each run by one command.~~ [#42](https://github.com/yjun1806/ursula-diagram/pull/42)

## Not planned

- Syntax of ursula's own beyond Mermaid. ursula reads Mermaid so that any text an agent writes also works in Mermaid and on GitHub.
- An editor where you drag boxes around. ursula draws text written by agents; a change goes back into the text.
