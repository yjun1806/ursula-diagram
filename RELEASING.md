# Releasing

Every change reaches `main` through a pull request. A release is a pull request that raises the version; merging it publishes.

## Changes

1. Branch from `main`: `git switch -c <type>/<topic>` (`feat`, `fix`, `docs`, `perf`, `refactor`, `test`, `ci`, `chore`).
2. Commit with `<type>: <description>` messages.
3. Push the branch and open a pull request against `main`.
4. The `CI` check (types, the test suite, the build, and the bundled skill command matching the sources) must pass.
   `main` accepts no direct pushes.
5. Squash-merge. The pull request title becomes the commit on `main`, so give it the same `<type>: <description>` form.

Pushing to `main` also redeploys the documentation site.

Every pull request that users of the package would notice (the command, the library, the agent skill or the MCP
server; not the docs site, which redeploys on every merge) adds a line under `## Unreleased` in `CHANGELOG.md`, and the
same line in Korean in `CHANGELOG.ko.md`. Put it under `### Added`, `### Changed`, `### Removed` or `### Fixed`
(in English on both), keep it to one sentence, and end it with the pull request link. `npm test` fails when the two
files differ in their headings or in the pull requests they link under a version.

When a pull request ships an item on the roadmap (an issue labelled `roadmap`), remove its line from `site/roadmap.md`
and `site/ko/roadmap.md` in the same pull request and close the issue with `Fixes #<n>`. When it ships only part of an
item, remove that part. The roadmap lists only work still to do; what shipped is in the changelog. The site's
`npm run check` (run on every push to `main` before the site deploys) fails when the pages list a closed issue or miss an open one.

## Releases

Versions follow semver. Before 1.0, a minor bump (`0.x.0`) may change the API; a patch bump (`0.x.y`) does not.

1. Branch from `main`: `git switch -c chore/release-<version>`.
2. Set the new version in `version` of `package.json` and in `VERSION` of `src/version.ts`. A test fails when the two differ.
3. Rebuild the bundled skill command, which carries the version: `bun scripts/build.ts`.
   Check that `skills/ursula/scripts/ursula.mjs` changed.
4. In `CHANGELOG.md` and `CHANGELOG.ko.md`, rename `## Unreleased` to `## <version> (<yyyy-mm-dd>)` and add a new, empty
   `## Unreleased` above it. `npm test` fails when `CHANGELOG.md` has no section with notes for the version in
   `package.json`.
5. Commit the changed files as `chore: release <version>`, push, and open a pull request with that name.
6. Merge it after `CI` passes. That is the whole release.
7. On the push to `main`, the `Release` workflow sees that the version in `package.json` is not on npm yet. It runs the
   tests and the build, publishes to npm through trusted publishing (with provenance, no token), tags the commit
   `v<version>` and creates the GitHub release with the section of that version in `CHANGELOG.md` as its notes
   (generated notes when the section is empty). Pushes that do not change the version stop after that check.
8. npm can take a few minutes to serve a new version. Check with `npm view ursula-diagram version`.

If the workflow fails before publishing, fix the cause in a pull request; the next push to `main` (or running the
`Release` workflow by hand from the Actions tab) tries again. A version that reached npm cannot be published again;
release the next patch instead.
