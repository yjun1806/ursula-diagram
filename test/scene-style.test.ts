import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '../src/index.ts';
import { renderThemedScene, sceneStyleSheet } from '../src/render/scene-svg.ts';
import type { Scene } from '../src/types.ts';
import { EXAMPLES as RAILROAD } from './railroad-examples.ts';

interface Rule {
  selectors: string[];
  body: string;
}

/** The rules of a style sheet, for the light scheme and for the dark one. */
function schemes(sheet: string): [Rule[], Rule[]] {
  const [light = '', rest = ''] = sheet.split('\n@media (prefers-color-scheme: dark){\n');
  const rules = (text: string): Rule[] =>
    text
      .split('\n')
      .filter((line) => line.includes('{'))
      .map((line) => ({ selectors: line.slice(0, line.indexOf('{')).split(','), body: line.slice(line.indexOf('{')) }));
  return [rules(light), rules(rest.replace(/\n\}$/, ''))];
}

const sheetOf = (svg: string): string => /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';

/** The class list of the root element and of every element after the style sheet. */
function elements(svg: string): string[][] {
  const body = svg.slice(svg.indexOf('</style>'));
  return [['ursula'], ...[...body.matchAll(/<[a-zA-Z]+ class="([^"]*)"/g)].map((m) => (m[1] ?? '').split(' '))];
}

/** Whether one element carries every class of `selector`, a run of classes such as `.a.b`. */
const reaches = (selector: string, all: string[][]): boolean => {
  const names = selector.slice(1).split('.');
  return all.some((classes) => names.every((name) => classes.includes(name)));
};

/**
 * What is wrong with the style sheet written into `svg`, against the whole sheet: a rule that reaches an
 * element but was left out or cut, a rule that is not of the whole sheet, rules out of order, a class left without
 * the rules it had.
 */
function faults(svg: string): string[] {
  const whole = schemes(sceneStyleSheet());
  const written = schemes(sheetOf(svg));
  const all = elements(svg);
  const out: string[] = [];
  for (const mode of [0, 1] as const) {
    const kept = written[mode];
    let at = -1;
    for (const rule of whole[mode]) {
      const needed = rule.selectors.filter((s) => reaches(s, all));
      const found = kept.findIndex((k, i) => i > at && k.body === rule.body && k.selectors.every((s) => rule.selectors.includes(s)) && needed.every((s) => k.selectors.includes(s)));
      if (needed.length > 0 && found < 0) out.push(`${mode} missing or out of order: ${needed.join(',')}`);
      if (found >= 0) at = found;
    }
    for (const k of kept) {
      if (!whole[mode].some((rule) => rule.body === k.body && k.selectors.every((s) => rule.selectors.includes(s)))) out.push(`${mode} unknown: ${k.selectors.join(',')}`);
    }
    // Each class of the drawing is named by as many rules as reach it in the whole sheet.
    for (const name of new Set(all.flat())) {
      const count = (rules: Rule[]): number => rules.filter((rule) => rule.selectors.some((s) => s.slice(1).split('.').includes(name) && reaches(s, all))).length;
      if (count(kept) !== count(whole[mode])) out.push(`${mode} ${name}: ${count(kept)} of ${count(whole[mode])} rules`);
    }
  }
  if (written[0].map((r) => r.selectors.join(',')).join('\n') !== written[1].map((r) => r.selectors.join(',')).join('\n')) out.push('schemes differ');
  return out;
}

const sample: Scene = {
  width: 400,
  height: 200,
  title: 'Sample',
  items: [
    { kind: 'box', style: 'box', x: 10, y: 10, w: 100, h: 48, role: ['box', 'box--start'] },
    { kind: 'path', d: 'M10 100L60 100L60 150Z', role: ['series-2', 'tint'] },
    { kind: 'path', d: 'M70 100L120 100L120 150Z', role: ['series-3--tint'] },
    { kind: 'circle', cx: 200, cy: 130, r: 12, role: ['series-1'] },
    { kind: 'circle', cx: 240, cy: 130, r: 12, role: ['dot'] },
    { kind: 'line', points: [{ x: 60, y: 58 }, { x: 160, y: 90 }], role: ['edge', 'edge--msg', 'edge--arrow', 'edge--pending'] },
    { kind: 'text', x: 60, y: 34, text: 'a', role: ['value', 'value--bare'], anchor: 'end' },
  ],
};

/** One small drawing of each kind drawn from a scene. */
const KINDS: Record<string, string> = {
  architecture: 'architecture-beta\n  group api(cloud)[API]\n  service db(database)[Store] in api\n  service app(server)[App] in api\n  db:L -- R:app',
  block: 'block\n  columns 3\n  a["One"] b(("Two")) c{"Three"}\n  a --> b\n  b -- "next" --> c',
  cynefin: 'cynefin-beta\n  title Sorting\n  complex\n    "Probe"\n  complicated\n    "Analyse"\n  clear\n    "Apply"\n  chaotic\n    "Act"',
  eventmodeling: 'eventmodeling\n\ntf 01 ui Basket\ntf 02 cmd AddLine\ntf 03 evt LineAdded',
  gantt: 'gantt\n  title Plan\n  dateFormat YYYY-MM-DD\n  section Build\n  Draft :a1, 2024-01-01, 10d\n  Review :crit, after a1, 5d\n  Ship :milestone, 2024-01-20, 0d',
  git: 'gitGraph\n  commit\n  branch topic\n  commit\n  checkout main\n  merge topic tag: "v1"',
  ishikawa: 'ishikawa-beta\n  Late parcel\n  People\n    New staff\n  Tools\n    Old scanner\n      Flat battery',
  journey: 'journey\n  title A morning\n  section Leave\n    Pack: 4: Me\n    Walk: 2: Me, Dog\n  section Arrive\n    Sit: 5: Me',
  kanban: 'kanban\n  todo[To do]\n    t1[Write]\n  doing[Doing]\n    t2[Check]@{ assigned: "kim", priority: "High" }',
  mindmap: 'mindmap\n  root((Centre))\n    One\n      Leaf\n    Two[Square]\n    Three)Cloud(',
  packet: 'packet\ntitle Header\n+8: "Kind"\n+8: "Flags"\n16-31: "Length"',
  pie: 'pie showData title Fruit\n  "Apple" : 40\n  "Pear" : 35\n  "Plum" : 25',
  quadrant: 'quadrantChart\n  title Reach\n  x-axis Low --> High\n  y-axis Few --> Many\n  quadrant-1 Grow\n  quadrant-2 Watch\n  quadrant-3 Drop\n  quadrant-4 Keep\n  One: [0.3, 0.6]\n  Two: [0.7, 0.2]',
  radar: 'radar-beta\n  axis a["Speed"], b["Reach"], c["Cost"]\n  curve x["First"]{80, 60, 40}\n  curve y["Second"]{50, 90, 70}\n  max 100\n  min 0',
  sankey: 'sankey\n\nSource,Left,30\nSource,Right,70\nRight,End,50',
  sequence: 'sequenceDiagram\n  actor U as User\n  participant S as Shop\n  U->>+S: Order\n  Note right of S: Checked\n  alt paid\n    S-->>-U: Done\n  else refused\n    S-xU: Failed\n  end',
  timeline: 'timeline\n  title Releases\n  section Early\n    2019 : First\n    2020 : Second : Third\n  section Late\n    2023 : Fourth',
  treeView: 'treeView-beta\n  "src"\n    "render"\n      "svg.ts"\n    "index.ts"',
  treemap: 'treemap-beta\n"North"\n  "One": 10\n  "Two": 20\n"South"\n  "Three": 15',
  venn: 'venn-beta\n  set A["Alpha"]\n  set B["Beta"]\n  union A,B["Both"]',
  wardley: 'wardley-beta\ntitle Tea\nanchor Customer [0.95, 0.6]\ncomponent Cup [0.8, 0.7]\ncomponent Kettle [0.4, 0.5]\nCustomer -> Cup\nCup -> Kettle',
  xychart: 'xychart\n  title "Sales"\n  x-axis [Q1, Q2, Q3]\n  y-axis "Amount" 0 --> 100\n  bar [30, 80, 55]\n  line [20, 60, 90]',
  zenuml: 'zenuml\n  title Order\n  @Actor User\n  Shop\n  User->Shop.order() {\n    return ok\n  }',
};

function fileSources(dir: string): Record<string, string> {
  const root = join(import.meta.dirname, dir);
  return Object.fromEntries(
    readdirSync(root)
      .filter((f) => f.endsWith('.mmd'))
      .sort()
      .map((f) => [`${dir}/${f}`, readFileSync(join(root, f), 'utf8')]),
  );
}

describe('style sheet of a scene', () => {
  it('writes every selector of the whole sheet as a run of classes', () => {
    for (const rules of schemes(sceneStyleSheet())) {
      expect(rules.length).toBeGreaterThan(100);
      for (const rule of rules) for (const s of rule.selectors) expect(s).toMatch(/^(\.[A-Za-z][A-Za-z0-9_-]*)+$/);
    }
  });

  it('keeps the rules of the classes a drawing carries, in both schemes, and leaves the others out', () => {
    const svg = renderThemedScene(sample);
    const [light, dark] = schemes(sheetOf(svg));
    const selectors = light.map((r) => r.selectors.join(','));
    expect(dark.map((r) => r.selectors.join(','))).toEqual(selectors);
    // The font of the root, which no element below names.
    expect(selectors[0]).toBe('.ursula');
    expect(selectors).toContain('.ursula-bg');
    expect(selectors).toContain('.ursula-box');
    expect(selectors).toContain('.ursula-box--start');
    expect(selectors).toContain('.ursula-end');
    // A rule that needs two classes, a later rule that undoes an earlier one, and the head inside a marker.
    expect(selectors).toContain('.ursula-edge--msg.ursula-edge--pending');
    expect(selectors.indexOf('.ursula-value--bare')).toBeGreaterThan(selectors.indexOf('.ursula-value'));
    expect(selectors).toContain('.ursula-head');
    expect(selectors).toContain('.ursula-head--msg');
    // A series mark in each of its two spellings keeps the selector that reaches it.
    expect(selectors).toContain('.ursula-series-2.ursula-tint');
    expect(selectors).toContain('.ursula-series-3--tint');
    expect(selectors).toContain('.ursula-series-1');
    expect(selectors).toContain('.ursula-dot');
    for (const absent of ['.ursula-zone', '.ursula-note', '.ursula-series-4', '.ursula-head--accent', '.ursula-box--decision', '.ursula-start']) expect(selectors, absent).not.toContain(absent);
    expect(selectors.some((s) => s.includes('series-5'))).toBe(false);
    expect(faults(svg)).toEqual([]);
  });

  it('keeps the rule of the title of a drawing that has a heading', () => {
    const svg = renderThemedScene(sample, { drawTitle: 'Heading' });
    expect(schemes(sheetOf(svg))[0].map((r) => r.selectors.join(','))).toContain('.ursula-title');
    expect(faults(svg)).toEqual([]);
  });

  it('finds a rule that was left out', () => {
    const svg = renderThemedScene(sample);
    expect(faults(svg.replace(/\.ursula-box--start\{[^}]*\}\n/, ''))).not.toEqual([]);
    expect(faults(svg.replace(/\.ursula-edge--msg\.ursula-edge--pending\{[^}]*\}\n/g, ''))).not.toEqual([]);
  });

  const sources = { ...KINDS, ...Object.fromEntries(Object.entries(RAILROAD).map(([k, v]) => [`railroad ${k}`, v])), ...fileSources('sequence-official'), ...fileSources('../examples') };

  it('leaves each class of a drawing every rule that reaches it, for every kind of scene', () => {
    const kinds = new Set<string>();
    let scenes = 0;
    for (const [name, src] of Object.entries(sources)) {
      const svg = render(src);
      // A drawing that is not made from a scene has no page rectangle of this class.
      if (!svg.includes('<rect class="ursula-bg"')) continue;
      scenes++;
      if (name in KINDS) kinds.add(name);
      expect(faults(svg), name).toEqual([]);
      expect(schemes(sheetOf(svg))[0].length, name).toBeLessThan(80);
    }
    expect([...kinds].sort()).toEqual(Object.keys(KINDS).sort());
    expect(scenes).toBeGreaterThan(50);
  });
});
