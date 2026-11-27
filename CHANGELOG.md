# Changelog

What changed in each version of the `ursula-diagram` package: the command, the library, the agent skill and the MCP
server. The documentation site changes with every merge and is not listed. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [semver](https://semver.org/). What is
planned next is on the [roadmap](https://yjun1806.github.io/ursula-diagram/roadmap).

## Unreleased

## 0.2.4 (2026-11-27)

### Fixed

- The agent skill tells the agent to write the full `node …/scripts/ursula.mjs` command in each call instead of a shell variable, which zsh does not split into words, so the first drawing no longer fails. [#84](https://github.com/yjun1806/ursula-diagram/pull/84)
- Legends write their captions in Korean (흐름, 요청, 대기; 호출, 응답, 비동기, 실패) when more words of the diagram are in Hangul than in Latin letters, instead of always Flow, Pending, Call, Reply. Captions given through the `legend` option still win. [#85](https://github.com/yjun1806/ursula-diagram/pull/85)
- A line drawn again onto a free face of its box after the drawing is chosen keeps 24 px from the boxes it passes, where it kept 6 px, so a state transition no longer runs along an unrelated state; a label no longer stands flush against a box its line passes. [#86](https://github.com/yjun1806/ursula-diagram/pull/86)
- A flowchart drawn in pixels keeps the flow its text starts with on the first row when a longer flow written after it feeds into it, instead of pushing the first flow below. [#87](https://github.com/yjun1806/ursula-diagram/pull/87)

## 0.2.3 (2026-11-26)

### Added

- `ursula-diagram update` checks npm for a newer version and prints the command that updates this install (global npm, pnpm or bun, a project, npx or the agent skill); `--yes` runs it for a global install. It is the only command that uses the network, and ends with the new code 5 when npm cannot be reached. [#78](https://github.com/yjun1806/ursula-diagram/pull/78)
- The package installs the command under the short name `ud` as well. [#78](https://github.com/yjun1806/ursula-diagram/pull/78)

### Changed

- An unknown option prints `error: unknown option --x` and a `did you mean` when an option is near; `--engine`, `--no-questions` and `--no-elbows` say they were removed in 0.2.2 and why. [#78](https://github.com/yjun1806/ursula-diagram/pull/78)

## 0.2.2 (2026-11-26)

### Changed

- The json of a class diagram takes `maxWidth`, `composition` and `quality` like its svg, and the json of a requirement diagram takes `quality`, so `--check` describes the drawn layout. [#72](https://github.com/yjun1806/ursula-diagram/pull/72)
- The SVG of every diagram type, and the HTML page around it, use the system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', …`); pie, gantt, sequence and the other chart types named IBM Plex Sans KR first. [#73](https://github.com/yjun1806/ursula-diagram/pull/73)

### Removed

- The second flowchart layout engine: the `--engine` option and the `engine` option of the library (`LayoutOptions`, `RenderOptions`, `TextOptions`, `renderText`, `renderTextSpans`, `renderTextSvg`), and the `laneAxis` option of `LayoutOptions` that only it read. Every drawing stays the same. [#70](https://github.com/yjun1806/ursula-diagram/pull/70)
- The `--no-questions` and `--no-elbows` options, and the `questions` and `elbows` options of the library (`RenderOptions`, `TextOptions`, `LayoutOptions`, the renderText family). [#72](https://github.com/yjun1806/ursula-diagram/pull/72)

### Fixed

- Block terminal drawings keep their columns when two labels with wide characters (Korean, for one) overlap: writing over half of a wide character clears its other half. [#74](https://github.com/yjun1806/ursula-diagram/pull/74)

## 0.2.1 (2026-11-26)

### Fixed

- `--version` and `-v` print the version. [#61](https://github.com/yjun1806/ursula-diagram/pull/61)

## 0.2.0 (2026-11-26)

### Added

- PNG output with `--format png`, through the optional renderer `@resvg/resvg-js`; the default install keeps 0 runtime dependencies. [#46](https://github.com/yjun1806/ursula-diagram/pull/46)
- `ursula-diagram mcp`, an MCP server with the `render`, `check` and `syntax` tools. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- `ursula-diagram syntax [type]` prints a short example and the rules of a diagram type. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- `--check` prints the check on stderr next to any drawing, and `--format check` names the crossing lines with their source lines. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- Exit codes: 0 drawn, 1 text error, 2 usage, 3 too narrow, 4 engine failure. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- `--fix` and `--format fixed` fix a misspelt header or keyword and a flowchart `->`; `fixSource` in the library. [#13](https://github.com/yjun1806/ursula-diagram/pull/13)
- `--color` tones for flowchart, class, state, ER, requirement, C4, use case and architecture terminal drawings. [#44](https://github.com/yjun1806/ursula-diagram/pull/44), [#52](https://github.com/yjun1806/ursula-diagram/pull/52)

### Changed

- Errors show the source line with a `^` under the column, a `did you mean`, a hint and an example. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- `text` and `text-svg` with `--width` fail with exit code 3 and the width that fits instead of printing past the limit. [#5](https://github.com/yjun1806/ursula-diagram/pull/5)
- Terminal boxes have rounded corners, and side-by-side arrowheads are kept apart. [#19](https://github.com/yjun1806/ursula-diagram/pull/19)
- Faster terminal drawings, winning back most of the time rounded boxes added. [#39](https://github.com/yjun1806/ursula-diagram/pull/39), [#41](https://github.com/yjun1806/ursula-diagram/pull/41), [#43](https://github.com/yjun1806/ursula-diagram/pull/43), [#45](https://github.com/yjun1806/ursula-diagram/pull/45), [#48](https://github.com/yjun1806/ursula-diagram/pull/48), [#50](https://github.com/yjun1806/ursula-diagram/pull/50)
- C4 tags and boundaries read in words (`Database · external`, `System boundary`), not macro names. [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- A wide left-to-right ER drawing is set down the page when that is narrower. [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- The agent skill is 17% shorter and says that a drawing that exits 0 needs no re-check. [#49](https://github.com/yjun1806/ursula-diagram/pull/49)
- A PNG reads only the font files it needs, and the command warns when no font is found. [#58](https://github.com/yjun1806/ursula-diagram/pull/58)

### Fixed

- A Gantt chart without tasks draws as an empty frame, so all 531 examples in the Mermaid docs draw. [#4](https://github.com/yjun1806/ursula-diagram/pull/4)
- `A:::hot-->B` reads; `:::` took the first hyphens of the arrow. [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- Thick links (`==>`) are drawn thick in SVG. [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- Side-by-side subgraph columns in a terminal drawing are divided by a dashed rule. [#44](https://github.com/yjun1806/ursula-diagram/pull/44)
- The check no longer prints `note: [object Object]` for the notes of a sequence diagram. [#54](https://github.com/yjun1806/ursula-diagram/pull/54)

## 0.1.1 (2026-11-25)

### Added

- The command is also installed as `ursula-diagram`, so `npx ursula-diagram` works.

### Changed

- Published from CI with npm provenance; the package links its repository and issues.

## 0.1.0 (2026-11-25)

### Added

- Draws all 35 Mermaid diagram types as inline SVG and as terminal text, with no browser and no runtime dependencies.
- Terminal drawings in ASCII only (`--charset ascii`) or as an SVG that keeps its columns (`--format text-svg`).
- An agent skill (`skills/ursula`) that carries the command as one file.
