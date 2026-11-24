// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler } from '../src/metrics.ts';
import { render, renderText, UrsulaError } from '../src/index.ts';
import { layoutGit, monoWidth } from '../src/git/layout.ts';
import { parseGit as parseRaw } from '../src/git/parse.ts';
import { readFrontMatter } from '../src/front-matter.ts';
import { displayOrder } from '../src/git/model.ts';
import type { FrontValue } from '../src/front-matter.ts';
import type { GitGraph } from '../src/git/model.ts';
import type { SceneText } from '../src/types.ts';

const EXAMPLES: string[] = [
 "---\ntitle: Example Git diagram\n---\ngitGraph\n   commit\n   commit\n   branch develop\n   checkout develop\n   commit\n   commit\n   checkout main\n   merge develop\n   commit\n   commit",
 "    gitGraph\n       commit\n       commit\n       commit",
 "    gitGraph\n       commit id: \"Alpha\"\n       commit id: \"Beta\"\n       commit id: \"Gamma\"",
 "    gitGraph\n       commit id: \"Normal\"\n       commit\n       commit id: \"Reverse\" type: REVERSE\n       commit\n       commit id: \"Highlight\" type: HIGHLIGHT\n       commit",
 "    gitGraph\n       commit\n       commit id: \"Normal\" tag: \"v1.0.0\"\n       commit\n       commit id: \"Reverse\" type: REVERSE tag: \"RC_1\"\n       commit\n       commit id: \"Highlight\" type: HIGHLIGHT tag: \"8.8.4\"\n       commit",
 "    gitGraph\n       commit\n       commit\n       branch develop\n       commit\n       commit\n       commit",
 "    gitGraph\n       commit\n       commit\n       branch develop\n       commit\n       commit\n       commit\n       checkout main\n       commit\n       commit",
 "    gitGraph\n       commit\n       commit\n       branch develop\n       commit\n       commit\n       commit\n       checkout main\n       commit\n       commit\n       merge develop\n       commit\n       commit",
 "    gitGraph\n       commit id: \"1\"\n       commit id: \"2\"\n       branch nice_feature\n       checkout nice_feature\n       commit id: \"3\"\n       checkout main\n       commit id: \"4\"\n       checkout nice_feature\n       branch very_nice_feature\n       checkout very_nice_feature\n       commit id: \"5\"\n       checkout main\n       commit id: \"6\"\n       checkout nice_feature\n       commit id: \"7\"\n       checkout main\n       merge nice_feature id: \"customID\" tag: \"customTag\" type: REVERSE\n       checkout very_nice_feature\n       commit id: \"8\"\n       checkout main\n       commit id: \"9\"",
 "    gitGraph\n        commit id: \"ZERO\"\n        branch develop\n        branch release\n        commit id:\"A\"\n        checkout main\n        commit id:\"ONE\"\n        checkout develop\n        commit id:\"B\"\n        checkout main\n        merge develop id:\"MERGE\"\n        commit id:\"TWO\"\n        checkout release\n        cherry-pick id:\"MERGE\" parent:\"B\"\n        commit id:\"THREE\"\n        checkout develop\n        commit id:\"C\"",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n  gitGraph:\n    showBranches: false\n---\n      gitGraph\n        commit\n        branch hotfix\n        checkout hotfix\n        commit\n        branch develop\n        checkout develop\n        commit id:\"ash\" tag:\"abc\"\n        branch featureB\n        checkout featureB\n        commit type:HIGHLIGHT\n        checkout main\n        checkout hotfix\n        commit type:NORMAL\n        checkout develop\n        commit type:REVERSE\n        checkout featureB\n        commit\n        checkout main\n        merge hotfix\n        checkout featureB\n        commit\n        checkout develop\n        branch featureA\n        commit\n        checkout develop\n        merge hotfix\n        checkout featureA\n        commit\n        checkout featureB\n        commit\n        checkout develop\n        merge featureA\n        branch release\n        checkout release\n        commit\n        checkout main\n        commit\n        checkout release\n        merge main\n        checkout develop\n        merge release",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n  gitGraph:\n    rotateCommitLabel: true\n---\ngitGraph\n  commit id: \"feat(api): ...\"\n  commit id: \"a\"\n  commit id: \"b\"\n  commit id: \"fix(client): .extra long label..\"\n  branch c2\n  commit id: \"feat(modules): ...\"\n  commit id: \"test(client): ...\"\n  checkout main\n  commit id: \"fix(api): ...\"\n  commit id: \"ci: ...\"\n  branch b1\n  commit\n  branch b2\n  commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n  gitGraph:\n    rotateCommitLabel: false\n---\ngitGraph\n  commit id: \"feat(api): ...\"\n  commit id: \"a\"\n  commit id: \"b\"\n  commit id: \"fix(client): .extra long label..\"\n  branch c2\n  commit id: \"feat(modules): ...\"\n  commit id: \"test(client): ...\"\n  checkout main\n  commit id: \"fix(api): ...\"\n  commit id: \"ci: ...\"\n  branch b1\n  commit\n  branch b2\n  commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n  gitGraph:\n    showBranches: false\n    showCommitLabel: false\n---\n      gitGraph\n        commit\n        branch hotfix\n        checkout hotfix\n        commit\n        branch develop\n        checkout develop\n        commit id:\"ash\"\n        branch featureB\n        checkout featureB\n        commit type:HIGHLIGHT\n        checkout main\n        checkout hotfix\n        commit type:NORMAL\n        checkout develop\n        commit type:REVERSE\n        checkout featureB\n        commit\n        checkout main\n        merge hotfix\n        checkout featureB\n        commit\n        checkout develop\n        branch featureA\n        commit\n        checkout develop\n        merge hotfix\n        checkout featureA\n        commit\n        checkout featureB\n        commit\n        checkout develop\n        merge featureA\n        branch release\n        checkout release\n        commit\n        checkout main\n        commit\n        checkout release\n        merge main\n        checkout develop\n        merge release",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n  gitGraph:\n    showBranches: true\n    showCommitLabel: true\n    mainBranchName: 'MetroLine1'\n---\n      gitGraph\n        commit id:\"NewYork\"\n        commit id:\"Dallas\"\n        branch MetroLine2\n        commit id:\"LosAngeles\"\n        commit id:\"Chicago\"\n        commit id:\"Houston\"\n        branch MetroLine3\n        commit id:\"Phoenix\"\n        commit type: HIGHLIGHT id:\"Denver\"\n        commit id:\"Boston\"\n        checkout MetroLine1\n        commit id:\"Atlanta\"\n        merge MetroLine3\n        commit id:\"Miami\"\n        commit id:\"Washington\"\n        merge MetroLine2 tag:\"MY JUNCTION\"\n        commit id:\"Boston\"\n        commit id:\"Detroit\"\n        commit type:REVERSE id:\"SanFrancisco\"",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n  gitGraph:\n    showBranches: true\n    showCommitLabel: true\n---\n      gitGraph\n      commit\n      branch test1 order: 3\n      branch test2 order: 2\n      branch test3 order: 1",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n  gitGraph:\n    showBranches: true\n    showCommitLabel: true\n    mainBranchOrder: 2\n---\n      gitGraph\n      commit\n      branch test1 order: 3\n      branch test2\n      branch test3\n      branch test4 order: 1",
 "    gitGraph LR:\n       commit\n       commit\n       branch develop\n       commit\n       commit\n       checkout main\n       commit\n       commit\n       merge develop\n       commit\n       commit",
 "    gitGraph TB:\n       commit\n       commit\n       branch develop\n       commit\n       commit\n       checkout main\n       commit\n       commit\n       merge develop\n       commit\n       commit",
 "    gitGraph BT:\n       commit\n       commit\n       branch develop\n       commit\n       commit\n       checkout main\n       commit\n       commit\n       merge develop\n       commit\n       commit",
 "---\nconfig:\n  gitGraph:\n    parallelCommits: false\n---\ngitGraph:\n  commit\n  branch develop\n  commit\n  commit\n  checkout main\n  commit\n  commit",
 "---\nconfig:\n  gitGraph:\n    parallelCommits: true\n---\ngitGraph:\n  commit\n  branch develop\n  commit\n  commit\n  checkout main\n  commit\n  commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n---\n      gitGraph\n        commit\n        branch hotfix\n        checkout hotfix\n        commit\n        branch develop\n        checkout develop\n        commit id:\"ash\" tag:\"abc\"\n        branch featureB\n        checkout featureB\n        commit type:HIGHLIGHT\n        checkout main\n        checkout hotfix\n        commit type:NORMAL\n        checkout develop\n        commit type:REVERSE\n        checkout featureB\n        commit\n        checkout main\n        merge hotfix\n        checkout featureB\n        commit\n        checkout develop\n        branch featureA\n        commit\n        checkout develop\n        merge hotfix\n        checkout featureA\n        commit\n        checkout featureB\n        commit\n        checkout develop\n        merge featureA\n        branch release\n        checkout release\n        commit\n        checkout main\n        commit\n        checkout release\n        merge main\n        checkout develop\n        merge release",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'forest'\n---\n      gitGraph\n        commit\n        branch hotfix\n        checkout hotfix\n        commit\n        branch develop\n        checkout develop\n        commit id:\"ash\" tag:\"abc\"\n        branch featureB\n        checkout featureB\n        commit type:HIGHLIGHT\n        checkout main\n        checkout hotfix\n        commit type:NORMAL\n        checkout develop\n        commit type:REVERSE\n        checkout featureB\n        commit\n        checkout main\n        merge hotfix\n        checkout featureB\n        commit\n        checkout develop\n        branch featureA\n        commit\n        checkout develop\n        merge hotfix\n        checkout featureA\n        commit\n        checkout featureB\n        commit\n        checkout develop\n        merge featureA\n        branch release\n        checkout release\n        commit\n        checkout main\n        commit\n        checkout release\n        merge main\n        checkout develop\n        merge release",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n---\n      gitGraph\n        commit type:HIGHLIGHT\n        branch hotfix\n        checkout hotfix\n        commit\n        branch develop\n        checkout develop\n        commit id:\"ash\" tag:\"abc\"\n        branch featureB\n        checkout featureB\n        commit type:HIGHLIGHT\n        checkout main\n        checkout hotfix\n        commit type:NORMAL\n        checkout develop\n        commit type:REVERSE\n        checkout featureB\n        commit\n        checkout main\n        merge hotfix\n        checkout featureB\n        commit\n        checkout develop\n        branch featureA\n        commit\n        checkout develop\n        merge hotfix\n        checkout featureA\n        commit\n        checkout featureB\n        commit\n        checkout develop\n        merge featureA\n        branch release\n        checkout release\n        commit\n        checkout main\n        commit\n        checkout release\n        merge main\n        checkout develop\n        merge release",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'dark'\n---\n      gitGraph\n        commit\n        branch hotfix\n        checkout hotfix\n        commit\n        branch develop\n        checkout develop\n        commit id:\"ash\" tag:\"abc\"\n        branch featureB\n        checkout featureB\n        commit type:HIGHLIGHT\n        checkout main\n        checkout hotfix\n        commit type:NORMAL\n        checkout develop\n        commit type:REVERSE\n        checkout featureB\n        commit\n        checkout main\n        merge hotfix\n        checkout featureB\n        commit\n        checkout develop\n        branch featureA\n        commit\n        checkout develop\n        merge hotfix\n        checkout featureA\n        commit\n        checkout featureB\n        commit\n        checkout develop\n        merge featureA\n        branch release\n        checkout release\n        commit\n        checkout main\n        commit\n        checkout release\n        merge main\n        checkout develop\n        merge release",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'neutral'\n---\n      gitGraph\n        commit\n        branch hotfix\n        checkout hotfix\n        commit\n        branch develop\n        checkout develop\n        commit id:\"ash\" tag:\"abc\"\n        branch featureB\n        checkout featureB\n        commit type:HIGHLIGHT\n        checkout main\n        checkout hotfix\n        commit type:NORMAL\n        checkout develop\n        commit type:REVERSE\n        checkout featureB\n        commit\n        checkout main\n        merge hotfix\n        checkout featureB\n        commit\n        checkout develop\n        branch featureA\n        commit\n        checkout develop\n        merge hotfix\n        checkout featureA\n        commit\n        checkout featureB\n        commit\n        checkout develop\n        merge featureA\n        branch release\n        checkout release\n        commit\n        checkout main\n        commit\n        checkout release\n        merge main\n        checkout develop\n        merge release",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n---\n       gitGraph\n       commit\n       branch develop\n       commit tag:\"v1.0.0\"\n       commit\n       checkout main\n       commit type: HIGHLIGHT\n       commit\n       merge develop\n       commit\n       branch featureA\n       commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n  themeVariables:\n      'git0': '#ff0000'\n      'git1': '#00ff00'\n      'git2': '#0000ff'\n      'git3': '#ff00ff'\n      'git4': '#00ffff'\n      'git5': '#ffff00'\n      'git6': '#ff00ff'\n      'git7': '#00ffff'\n---\n       gitGraph\n       commit\n       branch develop\n       commit tag:\"v1.0.0\"\n       commit\n       checkout main\n       commit type: HIGHLIGHT\n       commit\n       merge develop\n       commit\n       branch featureA\n       commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n  themeVariables:\n    'gitBranchLabel0': '#ffffff'\n    'gitBranchLabel1': '#ffffff'\n    'gitBranchLabel2': '#ffffff'\n    'gitBranchLabel3': '#ffffff'\n    'gitBranchLabel4': '#ffffff'\n    'gitBranchLabel5': '#ffffff'\n    'gitBranchLabel6': '#ffffff'\n    'gitBranchLabel7': '#ffffff'\n    'gitBranchLabel8': '#ffffff'\n    'gitBranchLabel9': '#ffffff'\n---\n  gitGraph\n    checkout main\n    branch branch1\n    branch branch2\n    branch branch3\n    branch branch4\n    branch branch5\n    branch branch6\n    branch branch7\n    branch branch8\n    branch branch9\n    checkout branch1\n    commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n  themeVariables:\n    commitLabelColor: '#ff0000'\n    commitLabelBackground: '#00ff00'\n---\n       gitGraph\n       commit\n       branch develop\n       commit tag:\"v1.0.0\"\n       commit\n       checkout main\n       commit type: HIGHLIGHT\n       commit\n       merge develop\n       commit\n       branch featureA\n       commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n  themeVariables:\n    commitLabelColor: '#ff0000'\n    commitLabelBackground: '#00ff00'\n    commitLabelFontSize: '16px'\n---\n       gitGraph\n       commit\n       branch develop\n       commit tag:\"v1.0.0\"\n       commit\n       checkout main\n       commit type: HIGHLIGHT\n       commit\n       merge develop\n       commit\n       branch featureA\n       commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n  themeVariables:\n    commitLabelColor: '#ff0000'\n    commitLabelBackground: '#00ff00'\n    tagLabelFontSize: '16px'\n---\n       gitGraph\n       commit\n       branch develop\n       commit tag:\"v1.0.0\"\n       commit\n       checkout main\n       commit type: HIGHLIGHT\n       commit\n       merge develop\n       commit\n       branch featureA\n       commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n  themeVariables:\n    tagLabelColor: '#ff0000'\n    tagLabelBackground: '#00ff00'\n    tagLabelBorder: '#0000ff'\n---\n       gitGraph\n       commit\n       branch develop\n       commit tag:\"v1.0.0\"\n       commit\n       checkout main\n       commit type: HIGHLIGHT\n       commit\n       merge develop\n       commit\n       branch featureA\n       commit",
 "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n  themeVariables:\n    'gitInv0': '#ff0000'\n---\n       gitGraph\n       commit\n       branch develop\n       commit tag:\"v1.0.0\"\n       commit\n       checkout main\n       commit type: HIGHLIGHT\n       commit\n       merge develop\n       commit\n       branch featureA\n       commit"
];

/** What a front-end receives: the front-matter block turned into blank lines. */
const blank = (src: string): string => src.replace(/^\s*---[\s\S]*?\n---\n/, (m) => '\n'.repeat(m.split('\n').length - 1));
/** Parses like the front-end: the header block reaches the parser as a title and a config map. */
function parseGit(src: string, heading?: string, config?: Record<string, FrontValue>): GitGraph {
  const front = readFrontMatter(src);
  const title = front['title'];
  const own = front['config'];
  return parseRaw(blank(src), heading ?? (typeof title === 'string' ? title : undefined), config ?? (own !== null && typeof own === 'object' ? own : undefined));
}
const MERGES = EXAMPLES[8] ?? '';
const SHOWCASE = EXAMPLES[10] ?? '';

describe('git render', () => {
  it('draws every example', () => {
    expect(EXAMPLES).toHaveLength(35);
    for (const src of EXAMPLES) {
      expect(render(src)).toContain('data-theme="band"');
    }
  });

  it('draws every example as text', () => {
    for (const src of EXAMPLES) {
      const r = renderText(src, 80);
      expect('lines' in r).toBe(true);
    }
  });

  it('draws the header forms LR:, TB:, BT: and a trailing colon', () => {
    for (const head of ['gitGraph LR:', 'gitGraph TB:', 'gitGraph BT:', 'gitGraph:']) {
      expect(render(`${head}\n commit\n branch d\n commit`)).toContain('<svg');
    }
  });
});

describe('git parse', () => {
  it('reads commits, ids, types and tags', () => {
    const g = parseGit(EXAMPLES[4] ?? '');
    expect(g.commits.map((c) => [c.id.includes('-') ? '' : c.id, c.type, c.tag ?? ''])).toEqual([
      ['', 'NORMAL', ''],
      ['Normal', 'NORMAL', 'v1.0.0'],
      ['', 'NORMAL', ''],
      ['Reverse', 'REVERSE', 'RC_1'],
      ['', 'NORMAL', ''],
      ['Highlight', 'HIGHLIGHT', '8.8.4'],
      ['', 'NORMAL', ''],
    ]);
  });

  it('makes the same ids from the same text', () => {
    const a = parseGit('gitGraph\n commit\n commit').commits.map((c) => c.id);
    const b = parseGit('gitGraph\n commit\n commit').commits.map((c) => c.id);
    expect(a).toEqual(b);
    expect(a[0]).toMatch(/^0-[0-9a-f]{7}$/u);
    expect(a[1]).toMatch(/^1-[0-9a-f]{7}$/u);
  });

  it('reads branches, merges and the merged branch', () => {
    const g = parseGit(MERGES);
    expect(g.branches.map((b) => b.name)).toEqual(['main', 'nice_feature', 'very_nice_feature']);
    expect(g.commits.map((c) => c.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', 'customID', '8', '9']);
    const merge = g.commits[7];
    expect(merge?.kind).toBe('merge');
    expect(merge?.mergedFrom).toBe('nice_feature');
    expect(merge?.tag).toBe('customTag');
    expect(merge?.type).toBe('REVERSE');
    expect(merge?.branch).toBe('main');
  });

  it('reads a cherry-pick with its parent', () => {
    const g = parseGit(EXAMPLES[9] ?? '');
    const pick = g.commits.find((c) => c.kind === 'cherry-pick');
    expect(pick?.branch).toBe('release');
    expect(pick?.tag).toBe('cherry-pick:MERGE|parent:B');
    expect(g.commits[pick?.cherryOf ?? -1]?.id).toBe('MERGE');
  });

  it('reads orientation, config and the branch order', () => {
    expect(parseGit(EXAMPLES[19] ?? '').orientation).toBe('BT');
    expect(parseGit(EXAMPLES[18] ?? '').orientation).toBe('TB');
    const named = parseGit(EXAMPLES[14] ?? '');
    expect(named.branches[0]?.name).toBe('MetroLine1');
    const ordered = parseGit(EXAMPLES[16] ?? '', undefined, { gitGraph: { mainBranchOrder: 2 } });
    expect(displayOrder(ordered)).toEqual(['test2', 'test3', 'test4', 'main', 'test1']);
    expect(displayOrder(parseGit(EXAMPLES[15] ?? ''))).toEqual(['main', 'test3', 'test2', 'test1']);
  });

  it('lets the init directive win over the front matter', () => {
    const g = parseGit(`%%{init: {'gitGraph': {'showBranches': false}}}%%\ngitGraph\n commit`, undefined, { gitGraph: { showBranches: true } });
    expect(g.config.showBranches).toBe(false);
  });

  it('takes the front-matter title and accTitle', () => {
    expect(parseGit('gitGraph\n commit', 'From header').title).toBe('From header');
    expect(parseGit('gitGraph\n accTitle: Spoken\n commit').accTitle).toBe('Spoken');
    expect(render('gitGraph\n accTitle: Spoken\n commit')).toContain('<title>Spoken</title>');
  });

  it('rejects wrong input with the line number', () => {
    const cases: [string, number][] = [
      ['gitGraph\n commit\n checkout nowhere', 3],
      ['gitGraph\n commit\n merge main', 3],
      ['gitGraph\n commit\n branch a\n branch a', 4],
      ['gitGraph\n commit\n cherry-pick id: "zz"', 3],
      ['gitGraph\n commit\n frobnicate', 3],
      ['gitGraph\n commit id: x type: BOGUS', 2],
      ['graph\n commit', 1],
    ];
    for (const [src, line] of cases) {
      try {
        parseGit(src);
        throw new Error('no error');
      } catch (e) {
        expect(e).toBeInstanceOf(UrsulaError);
        expect((e as UrsulaError).line).toBe(line);
      }
    }
  });
});

interface Box {
  /** Corners in drawing order. */
  pts: { x: number; y: number }[];
  text: string;
}

const TEXT_HALF = 8;

/** Corners of an `x0..x1` × `y0..y1` box turned by `deg` around (ax, ay). */
function corners(x0: number, x1: number, y0: number, y1: number, deg = 0, ax = 0, ay = 0): { x: number; y: number }[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x = 0, y = 0]) => ({ x: ax + (x - ax) * c - (y - ay) * s, y: ay + (x - ax) * s + (y - ay) * c }));
}

/** Separating-axis test for two convex polygons. */
function polygonsOverlap(a: Box['pts'], b: Box['pts']): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      if (p === undefined || q === undefined) continue;
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const proj = (pts: Box['pts']): [number, number] => {
        const v = pts.map((t) => t.x * nx + t.y * ny);
        return [Math.min(...v), Math.max(...v)];
      };
      const [a0, a1] = proj(a);
      const [b0, b1] = proj(b);
      if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
    }
  }
  return true;
}

function insidePolygon(pt: { x: number; y: number }, poly: Box['pts']): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (p === undefined || q === undefined) continue;
    const cross = (q.x - p.x) * (pt.y - p.y) - (q.y - p.y) * (pt.x - p.x);
    const sg = Math.sign(cross);
    if (sg === 0) continue;
    if (sign === 0) sign = sg;
    else if (sg !== sign) return false;
  }
  return true;
}

function textBoxes(src: string): { boxes: Box[]; chips: Box[]; width: number; height: number; scene: ReturnType<typeof layoutGit>['scene'] } {
  const ruler = pixelRuler();
  const layout = layoutGit(parseGit(src), ruler);
  const boxes: Box[] = [];
  const chips: Box[] = [];
  for (const it of layout.scene.items) {
    if (it.kind === 'box' && (it.role ?? []).includes('tag')) {
      chips.push({ pts: corners(it.x, it.x + it.w, it.y, it.y + it.h), text: 'chip' });
      continue;
    }
    if (it.kind !== 'text') continue;
    const t: SceneText = it;
    const mono = (t.role ?? []).includes('mono');
    const w = mono ? monoWidth(t.text, ruler) : ruler.textWidth(t.text, 'line');
    const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
    const deg = t.rotate ?? 0;
    boxes.push({ pts: corners(x0, x0 + w, t.y - TEXT_HALF, t.y + TEXT_HALF, deg, t.x, t.y), text: t.text });
  }
  return { boxes, chips, width: layout.scene.width, height: layout.scene.height, scene: layout.scene };
}

/** Points along the curved parts of a path: each `C` piece sampled, straight pieces left out. */
function curvePoints(d: string): { x: number; y: number }[] {
  const nums = (s: string): number[] => s.trim().split(/[\s,]+/).filter((v) => v !== '').map(Number);
  const out: { x: number; y: number }[] = [];
  let cur = { x: 0, y: 0 };
  for (const m of d.matchAll(/([MLC])([^MLC]*)/g)) {
    const v = nums(m[2] ?? '');
    if (m[1] === 'C') {
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0] = v;
      for (let i = 1; i < 40; i++) {
        const s = i / 40;
        const u = 1 - s;
        out.push({
          x: u * u * u * cur.x + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * x3,
          y: u * u * u * cur.y + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * y3,
        });
      }
      cur = { x: x3, y: y3 };
    } else {
      cur = { x: v[v.length - 2] ?? 0, y: v[v.length - 1] ?? 0 };
    }
  }
  return out;
}

describe('git layout', () => {
  it('keeps text apart and inside the picture', () => {
    for (const src of EXAMPLES) {
      const { boxes, width, height } = textBoxes(src);
      for (const b of boxes) {
        for (const p of b.pts) {
          expect(p.x, b.text).toBeGreaterThanOrEqual(0);
          expect(p.x, b.text).toBeLessThanOrEqual(width);
          expect(p.y, b.text).toBeGreaterThanOrEqual(0);
          expect(p.y, b.text).toBeLessThanOrEqual(height);
        }
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (a === undefined || b === undefined) continue;
          expect(polygonsOverlap(a.pts, b.pts), `${a.text} / ${b.text}`).toBe(false);
        }
      }
    }
  });

  it('puts every commit on its branch line, one step apart in source order', () => {
    const g = parseGit(MERGES);
    const l = layoutGit(g, pixelRuler());
    const rows = new Map(displayOrder(g).map((n, i) => [n, i] as const));
    const first = l.commits[0];
    const second = l.commits[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const step = (second?.x ?? 0) - (first?.x ?? 0);
    expect(step).toBe(96);
    for (const p of l.commits) {
      expect(p.x).toBe((first?.x ?? 0) + p.seq * step);
      const branch = g.commits[p.seq]?.branch ?? '';
      expect(p.y).toBe((l.commits.find((q) => g.commits[q.seq]?.branch === branch)?.y ?? 0));
      expect(rows.has(branch)).toBe(true);
    }
    const ys = displayOrder(g).map((n) => l.branches.find((b) => b.name === n)?.y ?? 0);
    expect(ys[1]! - ys[0]!).toBe(64);
    expect(ys[2]! - ys[1]!).toBe(64);
  });

  it('runs commits down in TB, up in BT, with branches side by side', () => {
    const src = (h: string): string => `gitGraph ${h}\n commit\n commit\n branch d\n commit`;
    const tb = layoutGit(parseGit(src('TB:')), pixelRuler());
    const bt = layoutGit(parseGit(src('BT:')), pixelRuler());
    const ys = tb.commits.map((c) => c.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    const yb = bt.commits.map((c) => c.y);
    expect(yb).toEqual([...yb].sort((a, b) => b - a));
    expect(tb.commits[0]?.x).toBeLessThan(tb.commits[2]?.x ?? 0);
  });

  it('widens the step so long labels keep apart', () => {
    const l = layoutGit(parseGit('gitGraph\n commit id: "a-very-long-commit-label-text"\n commit id: "another-very-long-label-here"'), pixelRuler());
    const gap = (l.commits[1]?.x ?? 0) - (l.commits[0]?.x ?? 0);
    expect(gap).toBeGreaterThan(96);
    expect(gap % 4).toBe(0);
  });

  it('places commits level with their parents when parallelCommits is on', () => {
    const src = 'gitGraph\n commit\n branch d\n commit\n checkout main\n commit';
    const off = layoutGit(parseGit(src), pixelRuler());
    const on = layoutGit(parseGit(src, undefined, { gitGraph: { parallelCommits: true } }), pixelRuler());
    expect(off.commits[1]?.x).not.toBe(off.commits[2]?.x);
    expect(on.commits[1]?.x).toBe(on.commits[2]?.x);
  });

  it('draws the three commit shapes and a ring for a merge', () => {
    const svg = render(SHOWCASE);
    // HIGHLIGHT is a filled square in the colour of its branch, REVERSE a crossed ring.
    expect(svg).toMatch(/<rect class="ursula-series-4--dot"[^>]*data-id="3-/u);
    expect(svg).toContain('ursula-end-ring');
    expect(svg).toContain('ursula-series-1 ursula-line');
  });

  it('keeps branch curves off commit ids and tags', () => {
    for (const [i, src] of EXAMPLES.entries()) {
      const { boxes, chips, scene } = textBoxes(src);
      const pad = 2;
      const grown = [...boxes, ...chips].map((b) => {
        const cx = b.pts.reduce((a, p) => a + p.x, 0) / b.pts.length;
        const cy = b.pts.reduce((a, p) => a + p.y, 0) / b.pts.length;
        const pts = b.pts.map((p) => {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const len = Math.hypot(dx, dy) || 1;
          return { x: p.x + (dx / len) * pad * Math.SQRT2, y: p.y + (dy / len) * pad * Math.SQRT2 };
        });
        return { pts, text: b.text };
      });
      for (const it of scene.items) {
        if (it.kind !== 'path' || !(it.role ?? []).some((r) => r.endsWith('--line'))) continue;
        for (const pt of curvePoints(it.d)) {
          for (const b of grown) expect(insidePolygon(pt, b.pts), `example ${i + 1}: curve through ${b.text}`).toBe(false);
        }
      }
    }
  });

  it('starts a curve one step later when it would cross the label of the commit it leaves', () => {
    // Example 11: featureB leaves "ash", whose id sits under the commit on develop.
    const g = parseGit(EXAMPLES[10] ?? '');
    const l = layoutGit(g, pixelRuler());
    const ash = l.commits.find((c) => c.id === 'ash');
    const next = l.commits.find((c) => c.seq === (ash?.seq ?? 0) + 1);
    expect(ash).toBeDefined();
    expect((next?.x ?? 0) - (ash?.x ?? 0)).toBe(2 * 96);
    const fork = l.scene.items.find((it) => it.kind === 'path' && it.data?.['fork'] === 'featureB');
    expect(fork?.kind === 'path' ? fork.d : '').toMatch(new RegExp(`^M${ash?.x} ${ash?.y}L${(ash?.x ?? 0) + 96} ${ash?.y}C`, 'u'));
  });

  it('keeps every line of a branch without commits inside the picture', () => {
    for (const src of [EXAMPLES[15] ?? '', EXAMPLES[16] ?? '']) {
      const { scene } = textBoxes(src);
      for (const it of scene.items) {
        if (it.kind !== 'path') continue;
        const xs = [...it.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
        for (const x of xs) expect(x).toBeLessThanOrEqual(scene.width - 16);
      }
    }
  });

  it('turns commit ids 45 degrees only when rotateCommitLabel is true', () => {
    const rotated = textBoxes(EXAMPLES[11] ?? '').scene.items.filter((it) => it.kind === 'text' && (it.role ?? []).includes('mono'));
    const flat = textBoxes(EXAMPLES[12] ?? '').scene.items.filter((it) => it.kind === 'text' && (it.role ?? []).includes('mono'));
    expect(rotated.length).toBe(10);
    expect(rotated.every((it) => it.kind === 'text' && it.rotate === -45)).toBe(true);
    expect(flat.every((it) => it.kind === 'text' && it.rotate === undefined)).toBe(true);
    expect(render(EXAMPLES[11] ?? '')).toMatch(/<text class="ursula-mono ursula-end" x="([\d.]+)" y="([\d.]+)"[^>]*transform="rotate\(-45 \1 \2\)"/u);
    expect(render(EXAMPLES[1] ?? '')).not.toContain('rotate(');
  });
});

describe('git text', () => {
  it('draws one row per commit with a column per branch', () => {
    const r = renderText(EXAMPLES[0] ?? '', 60);
    if (!('lines' in r)) throw new Error(r.error);
    expect(r.lines[0]).toBe('Example Git diagram');
    expect(r.lines).toHaveLength(8);
    expect(r.lines[2]).toMatch(/^●─╮ /u);
    expect(r.lines[5]).toMatch(/^●─╯ /u);
    expect(r.lines[7]).toContain('(main)');
    expect(r.lines.join('\n')).toContain('(develop)');
  });

  it('shows tags next to the commit id', () => {
    const r = renderText(EXAMPLES[4] ?? '', 60);
    if (!('lines' in r)) throw new Error(r.error);
    expect(r.lines.join('\n')).toContain('Normal  [v1.0.0]');
  });
});
