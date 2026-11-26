# Roadmap

What ursula plans to support next. Each item is a GitHub issue, and the issue is where the work is discussed and
tracked; this page lists them. There are no dates. To suggest something, [open an issue](https://github.com/yjun1806/ursula-diagram/issues/new).

All open roadmap items: [issues labelled `roadmap`](https://github.com/yjun1806/ursula-diagram/issues?q=is%3Aissue%20state%3Aopen%20label%3Aroadmap). What has shipped is in the [changelog](/changelog).

## Planned

- Apply Mermaid styling (`classDef`, `class`, `style`, `linkStyle`, `:::`, `themeVariables`) to SVG and terminal drawings; today it is read and ignored. [#24](https://github.com/yjun1806/ursula-diagram/issues/24)
- Docs build plugins for markdown-it (VitePress) and remark/rehype (Docusaurus, Astro, Next.js MDX) that draw Mermaid blocks at build time. [#26](https://github.com/yjun1806/ursula-diagram/issues/26)
- A GitHub Action that renders Mermaid in pull requests and READMEs. [#27](https://github.com/yjun1806/ursula-diagram/issues/27)
- A scheduled job that draws the examples in the Mermaid docs and opens an issue for any that fail. [#28](https://github.com/yjun1806/ursula-diagram/issues/28)
- A shorter agent loop. [#29](https://github.com/yjun1806/ursula-diagram/issues/29)
  - `--fix` for more of the mistakes agents make.
  - A `--check` that counts the crossings and bends of the terminal drawing itself, not of the SVG layout.
- Tidier terminal drawings. [#30](https://github.com/yjun1806/ursula-diagram/issues/30)
  - Boxes sized to their own text.
  - Emoji counted as two cells.
  - No side-by-side arrowheads in the C4 examples at 80 columns or the actor column of use case diagrams.
- Theme presets as CSS-variable sets, such as `monochrome` and `blueprint`. [#31](https://github.com/yjun1806/ursula-diagram/issues/31)

## In progress

Nothing at the moment.

## Not planned

- Syntax of ursula's own beyond Mermaid. ursula reads Mermaid so that any text an agent writes also works in Mermaid and on GitHub.
- An editor where you drag boxes around. ursula draws text written by agents; a change goes back into the text.
