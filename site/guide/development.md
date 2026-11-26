---
description: 'Develop ursula-diagram: install the dependencies, check the types, run the tests and run the docs site and playground of this Mermaid renderer.'
---

# Development

The repository holds the engine (`src/`), its tests (`test/`), the agent skill (`skills/ursula`) and this site
(`site/`). How a release is made is in [RELEASING.md](https://github.com/yjun1806/ursula-diagram/blob/main/RELEASING.md).

Install the dependencies:

```bash
npm install
```

Check the types:

```bash
npx tsc --noEmit
```

Run the whole suite but the slow comparisons:

```bash
npm test
```

Run the slow comparisons of the layered engine, which take about a quarter of an hour:

```bash
npm run test:rewrite
```

Build `dist/` and the command inside the skill. Run it again when a drawing changes:

```bash
bun scripts/build.ts
```

Redraw the outputs the READMEs and `assets/` keep as files, after a build that changes a drawing. `npm test` fails
while one of them differs from what the built command draws:

```bash
npm run docs:sync
```

The site draws its outputs at build time. Run the documentation site and playground on the `dist/` just built:

```bash
cd site && npm install && npm run dev
```

Before a pull request that changes the engine, compare the drawings of the official examples with `main`. Paste what
it prints into the pull request:

```bash
npm run compare
```

The pull request template asks for that output. The contributor skill in
[`.claude/skills/ursula-dev/`](https://github.com/yjun1806/ursula-diagram/tree/main/.claude/skills/ursula-dev) walks a
person or an agent through the map of the sources, the tests and the pull request flow.

The built files run on Node 22 or later. In a checkout, Node 24 or later also runs the sources directly:
`node src/cli.ts order.mmd --format text`.
