# Roadmap

What ursula plans to support next. Each item is a GitHub issue, and the issue is where the work is discussed and
tracked; this page lists them. There are no dates. To suggest something, [open an issue](https://github.com/yjun1806/ursula-diagram/issues/new).

All open roadmap items: [issues labelled `roadmap`](https://github.com/yjun1806/ursula-diagram/issues?q=is%3Aissue%20state%3Aopen%20label%3Aroadmap).

## Planned

- Apply Mermaid styling (`classDef`, `class`, `style`, `linkStyle`, `:::`, `themeVariables`) to SVG and terminal drawings; today it is read and ignored. [#24](https://github.com/yjun1806/ursula-diagram/issues/24)
- Docs build plugins for markdown-it (VitePress) and remark/rehype (Docusaurus, Astro, Next.js MDX) that draw Mermaid blocks at build time. [#26](https://github.com/yjun1806/ursula-diagram/issues/26)
- A GitHub Action that renders Mermaid in pull requests and READMEs. [#27](https://github.com/yjun1806/ursula-diagram/issues/27)
- A scheduled job that draws the examples in the Mermaid docs and opens an issue for any that fail. [#28](https://github.com/yjun1806/ursula-diagram/issues/28)
- A shorter agent loop: a wider `--fix`, smaller skill instructions, and a check that counts the terminal drawing. [#29](https://github.com/yjun1806/ursula-diagram/issues/29)
- Tidier terminal drawings: boxes sized to their text, no adjacent arrowheads or lines, emoji counted as two cells. [#30](https://github.com/yjun1806/ursula-diagram/issues/30)
- Theme presets as CSS-variable sets, such as `monochrome` and `blueprint`. [#31](https://github.com/yjun1806/ursula-diagram/issues/31)

## In progress

- PNG output from the command, with an optional renderer so the default install keeps 0 runtime dependencies. [#32](https://github.com/yjun1806/ursula-diagram/issues/32)
- Win back terminal rendering speed. [#33](https://github.com/yjun1806/ursula-diagram/issues/33)

## Recently shipped

- Terminal boxes with rounded corners, and side-by-side arrowheads kept apart. [#19](https://github.com/yjun1806/ursula-diagram/pull/19)
- `--fix` corrects a misspelt header or keyword and a flowchart `->`. [#13](https://github.com/yjun1806/ursula-diagram/pull/13)
- Every example on the site as SVG and as a terminal drawing, in tabs. [#11](https://github.com/yjun1806/ursula-diagram/pull/11)
- All 531 examples of the Mermaid documentation on the Examples pages. [#8](https://github.com/yjun1806/ursula-diagram/pull/8)
- Publishing to npm when a merged pull request raises the version. [#6](https://github.com/yjun1806/ursula-diagram/pull/6)
- The MCP server, the `syntax` command, `--help`, `--check` and distinct exit codes. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- A Gantt chart without tasks draws as an empty frame. [#4](https://github.com/yjun1806/ursula-diagram/pull/4)

## Not planned

- Syntax of ursula's own beyond Mermaid. ursula reads Mermaid so that any text an agent writes also works in Mermaid and on GitHub.
- An editor where you drag boxes around. ursula draws text written by agents; a change goes back into the text.
