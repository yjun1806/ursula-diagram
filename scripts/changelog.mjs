// CHANGELOG.md is the record of each version; CHANGELOG.ko.md says the same in Korean. The docs site shows both, the
// tests check that the two have the same versions and pull request links and that the version in package.json has a
// heading, and the Release workflow takes the GitHub release notes from the section of the version it publishes:
//
//   node scripts/changelog.mjs notes <version>
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const UNRELEASED = 'Unreleased';
const PULL = /github\.com\/yjun1806\/ursula-diagram\/pull\/(\d+)/g;

/** The `## ` sections of a changelog in order: `version` is the version, or `Unreleased`; `body` is the text below. */
export function sections(markdown) {
  const found = [];
  for (const line of markdown.split('\n')) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) {
      const version = /^(\d+\.\d+\.\d+\S*) \(\d{4}-\d{2}-\d{2}\)$/.exec(heading[1])?.[1] ?? heading[1];
      found.push({ heading: heading[1], version, lines: [] });
    } else found.at(-1)?.lines.push(line);
  }
  return found.map(({ heading, version, lines }) => ({ heading, version, body: lines.join('\n').trim() }));
}

/** The pull request numbers a section links, sorted. */
export function pullRequests(body) {
  return [...new Set([...body.matchAll(PULL)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** The text under the heading of `version`, or '' when the changelog has no such heading or it is empty. */
export function releaseNotes(markdown, version) {
  return sections(markdown).find((s) => s.version === version)?.body ?? '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, version] = process.argv.slice(2);
  if (command !== 'notes' || !version) {
    console.error('usage: node scripts/changelog.mjs notes <version>');
    process.exit(2);
  }
  process.stdout.write(releaseNotes(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8'), version));
}
