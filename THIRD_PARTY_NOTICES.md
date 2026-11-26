# Third-party notices

## Mermaid documentation

Some files in this repository hold diagram text copied, or adapted, from the
[Mermaid documentation](https://mermaid.js.org/) (source:
https://github.com/mermaid-js/mermaid/tree/develop/packages/mermaid/src/docs). That text is used under the MIT License
below.

Copied without change, one example per file:

- `site/examples/official/` — 531 examples, one folder per diagram type, shown on the documentation site's Examples
  pages.
- `test/sequence-official/` — the sequence diagram examples.
- `test/fixtures-c4/` — the C4 examples.
- `examples/c4-container.mmd` and `examples/c4-deployment.mmd` — two of the C4 examples.

Drawings of these examples by other tools, kept as they came out for the documentation site's comparisons (each tool's
output of the example text; the tools themselves are not included):

- `site/public/compare/` — SVGs by Mermaid.js 12.3.0, mermaid-cli 12.2.0, Pele 1.13.0, beautiful-mermaid 1.1.3 and
  mmdflux 2.6.1. Mermaid's need a browser, so they are saved here rather than drawn when the site is built.
- `site/compare-text/` — terminal text by beautiful-mermaid 1.1.3, mmdflux 2.6.1, mermaid-ascii 1.6.2 and
  termaid 0.14.0.
- `site/public/compare/skill/*-skill.png` — pictures a Claude Code session drew with the
  [diagram-design](https://github.com/cathrynlavery/diagram-design) skill (MIT) from `examples/order-flow.mmd`,
  `examples/c4-container.mmd` and `examples/checkout-sequence.mmd`.

Adapted inside test files (each says so on its first line, "Examples adapted from the Mermaid documentation (MIT)"):

- `test/architecture.test.ts`
- `test/block.test.ts`
- `test/c4-grid.test.ts`
- `test/c4.test.ts`
- `test/class.test.ts`
- `test/cynefin.test.ts`
- `test/er.test.ts`
- `test/eventmodeling.test.ts`
- `test/flowchart-syntax.test.ts`
- `test/gantt.test.ts`
- `test/git.test.ts`
- `test/ishikawa.test.ts`
- `test/journey.test.ts`
- `test/kanban.test.ts`
- `test/mindmap.test.ts`
- `test/packet.test.ts`
- `test/pie.test.ts`
- `test/quadrant.test.ts`
- `test/radar.test.ts`
- `test/railroad-examples.ts`
- `test/railroad.test.ts`
- `test/requirement.test.ts`
- `test/sankey.test.ts`
- `test/sequence-blocks.test.ts`
- `test/sequence-examples.test.ts`
- `test/sequence-half-arrows.test.ts`
- `test/state.test.ts`
- `test/timeline.test.ts`
- `test/treemap.test.ts`
- `test/treeview.test.ts`
- `test/usecase.test.ts`
- `test/venn.test.ts`
- `test/wardley.test.ts`
- `test/xychart.test.ts`
- `test/zenuml.test.ts`
- `test/sequence-participants.test.ts` — its "Mermaid documentation examples" block reads `test/sequence-official/`.

### License

```text
The MIT License (MIT)

Copyright (c) 2014 - 2022 Knut Sveidqvist

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
