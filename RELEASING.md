# Releasing

Every change reaches `main` through a pull request, and every release is a tag on `main`.

## Changes

1. Branch from `main`: `git switch -c <type>/<topic>` (`feat`, `fix`, `docs`, `perf`, `refactor`, `test`, `ci`, `chore`).
2. Commit with `<type>: <description>` messages.
3. Push the branch and open a pull request against `main`.
4. The `CI` check (types, the test suite, the build, and the bundled skill command matching the sources) must pass.
   `main` accepts no direct pushes.
5. Squash-merge. The pull request title becomes the commit on `main`, so give it the same `<type>: <description>` form.

Pushing to `main` also redeploys the documentation site.

## Releases

Versions follow semver. Before 1.0, a minor bump (`0.x.0`) may change the API; a patch bump (`0.x.y`) does not.

1. Open a pull request named `chore: release <version>` that changes only `version` in `package.json`.
2. Merge it after `CI` passes.
3. Tag the merge commit on `main` and push the tag:

   ```bash
   git switch main && git pull
   git tag v<version>
   git push origin v<version>
   ```

4. The `Release` workflow checks that the tag matches `package.json` and sits on `main`, runs the tests and the build,
   publishes to npm through trusted publishing (with provenance, no token), and creates the GitHub release with
   generated notes.
5. npm can take a few minutes to serve a new version. Check with `npm view ursula-diagram version`.

If the workflow fails before publishing, fix it in a pull request, delete the tag (`git push origin :refs/tags/v<version>`
and `git tag -d v<version>`) and tag again. A version that reached npm cannot be published again; release the next
patch instead.
