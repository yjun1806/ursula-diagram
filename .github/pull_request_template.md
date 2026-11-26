## ELI5

<!-- A simple explanation in plain language, one or two sentences: what this does and for whom. No jargon. -->

## What changed

<!-- Before and after as a user sees it: an SVG drawing, a terminal drawing, a command or option, an MCP tool, the
library API, or the docs. Then the mechanism you changed, not only the symptom. -->

## Why

<!-- The problem, and why this approach over the alternatives you considered. -->

## Linked issue

<!-- `Fixes #123`. Outside contributors: open an issue first. Maintainers may leave this out. -->

Fixes #

## Drawing proof

<!-- REQUIRED when any output can change. Show the affected drawings before and after: the SVG (attach or drag the
images in, do not commit them) and the terminal text in a code block. Otherwise write `N/A` and say why. -->

## Output impact

<!-- REQUIRED. Paste the block that `npm run compare` prints: how many SVG and terminal outputs of the official
examples changed byte for byte, and the terminal breakage counts (`breaksOf`) before and after. A terminal change may
widen a drawing or add bends, but no breakage count may rise. Write `N/A — docs only` when no source changed. -->

## Performance

<!-- REQUIRED, one line. "None, because …", or numbers: render time per example (median / max, from
`npm run compare`) and bundle size when it changes. -->

None, because

## Public surface

<!-- Tick what this changes, and update the docs (README.md, README.ko.md, site/ and site/ko/) with it. -->

- [ ] Command options or `--help`
- [ ] Exit codes
- [ ] MCP tools or their arguments
- [ ] Library exports or types
- [ ] The `syntax` catalog
- [ ] None of the above

## Risk

<!-- What could break, and for whom? Name the riskiest part and what users would see if it went wrong. How to back it
out: a plain revert, or what a revert would not undo (a published version, for one). -->

**Level:** <!-- Low, Medium or High -->

## AI disclosure

<!-- Which model or agent wrote or reviewed this, if any, and what a person checked by hand. -->

## Checklist

- [ ] Small and focused: one change
- [ ] `npx tsc --noEmit` and `npm test` pass
- [ ] The bundled skill command is rebuilt (`npx -y bun@1 scripts/build.ts`) if `src/` changed
- [ ] `cd site && npm run build && npm run check` passes if `site/` or a README changed
- [ ] English and Korean are in step
- [ ] One command per code block; diagram type names in English; no version numbers written into the docs
