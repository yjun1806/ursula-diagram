// CHANGELOG.md has a heading for the version in package.json, so a release pull request cannot merge without its
// notes, and CHANGELOG.ko.md lists the same versions with the same pull request links, so the Korean page keeps up.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript shared with the Release workflow
import { ROOT, UNRELEASED, pullRequests, releaseNotes, sections } from '../scripts/changelog.mjs';

type Section = { heading: string; version: string; body: string };
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const en: Section[] = sections(read('CHANGELOG.md'));
const ko: Section[] = sections(read('CHANGELOG.ko.md'));
const { version } = JSON.parse(read('package.json')) as { version: string };

describe('the changelog', () => {
  it('starts with Unreleased, then the versions newest first', () => {
    expect(en[0]?.version).toBe(UNRELEASED);
    const versions = en.slice(1).map((s) => s.version);
    for (const v of versions) expect(v, `"## ${v}" is not "## <version> (<yyyy-mm-dd>)"`).toMatch(/^\d+\.\d+\.\d+/);
    const newestFirst = [...versions].sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
    expect(versions).toEqual(newestFirst);
  });

  it(`has a section for ${version}, the version in package.json`, () => {
    expect(
      releaseNotes(read('CHANGELOG.md'), version),
      `CHANGELOG.md has no "## ${version} (<date>)" with notes: rename "## ${UNRELEASED}" in the release pull request`,
    ).not.toBe('');
  });

  it('CHANGELOG.ko.md has the same headings as CHANGELOG.md', () => {
    expect(ko.map((s) => s.heading)).toEqual(en.map((s) => s.heading));
  });

  it('CHANGELOG.ko.md links the same pull requests under each version', () => {
    for (const [i, section] of en.entries()) {
      expect(pullRequests(ko[i]?.body ?? ''), `## ${section.heading}`).toEqual(pullRequests(section.body));
    }
  });
});

describe('releaseNotes', () => {
  const markdown = '# Changelog\n\n## Unreleased\n\n## 1.2.0 (2026-01-02)\n\n### Fixed\n\n- A.\n\n## 1.1.0 (2026-01-01)\n\n- B.\n';

  it('returns the text under the heading of a version', () => {
    expect(releaseNotes(markdown, '1.2.0')).toBe('### Fixed\n\n- A.');
    expect(releaseNotes(markdown, '1.1.0')).toBe('- B.');
  });

  it('returns nothing for an empty section or a missing version', () => {
    expect(releaseNotes(markdown, UNRELEASED)).toBe('');
    expect(releaseNotes(markdown, '1.3.0')).toBe('');
  });
});
