// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { pixelRuler, render, renderText, UrsulaError } from '../src/index.ts';
import { layoutTimeline } from '../src/timeline/layout.ts';
import { parseTimeline } from '../src/timeline/parse.ts';
import type { SceneItem, SceneText } from '../src/types.ts';

const EXAMPLES: Record<string, string> = {
  '01-an-example-of-a-timeline': "timeline\n    title History of Social Media Platform\n    2002 : LinkedIn\n    2004 : Facebook\n         : Google\n    2005 : YouTube\n    2006 : Twitter",
  '02-syntax': "timeline\n    title History of Social Media Platform\n    2002 : LinkedIn\n    2004 : Facebook : Google\n    2005 : YouTube\n    2006 : Twitter",
  '03-grouping-of-time-periods-in-sections-ages': "timeline\n    title Timeline of Industrial Revolution\n    section 17th-20th century\n        Industry 1.0 : Machinery, Water power, Steam <br>power\n        Industry 2.0 : Electricity, Internal combustion engine, Mass production\n        Industry 3.0 : Electronics, Computers, Automation\n    section 21st century\n        Industry 4.0 : Internet, Robotics, Internet of Things\n        Industry 5.0 : Artificial intelligence, Big data, 3D printing",
  '04-wrapping-of-text-for-long-time-periods-or-events': "timeline\n        title England's History Timeline\n        section Stone Age\n          7600 BC : Britain's oldest known house was built in Orkney, Scotland\n          6000 BC : Sea levels rise and Britain becomes an island.<br> The people who live here are hunter-gatherers.\n        section Bronze Age\n          2300 BC : People arrive from Europe and settle in Britain. <br>They bring farming and metalworking.\n                  : New styles of pottery and ways of burying the dead appear.\n          2200 BC : The last major building works are completed at Stonehenge.<br> People now bury their dead in stone circles.\n                  : The first metal objects are made in Britain.Some other nice things happen. it is a good time to be alive.",
  '05-wrapping-of-text-for-long-time-periods-or-events': "timeline\n        title MermaidChart 2023 Timeline\n        section 2023 Q1 <br> Release Personal Tier\n          Bullet 1 : sub-point 1a : sub-point 1b\n               : sub-point 1c\n          Bullet 2 : sub-point 2a : sub-point 2b\n        section 2023 Q2 <br> Release XYZ Tier\n          Bullet 3 : sub-point <br> 3a : sub-point 3b\n               : sub-point 3c\n          Bullet 4 : sub-point 4a : sub-point 4b",
  '06-direction-v11-14-0': "timeline TD\n  title MermaidChart 2023 Timeline\n    section 2023 Q1 <br> Release Personal Tier\n      Bullet 1 : sub-point 1a : sub-point 1b\n      Bullet 2 : sub-point 2a : sub-point 2b\n    section 2023 Q2 <br> Release XYZ Tier\n      Bullet 3 : sub-point <br> 3a : sub-point 3b\n      Bullet 4 : sub-point 4a : sub-point 4b",
  '07-styling-of-time-periods-and-events': "    timeline\n        title History of Social Media Platform\n          2002 : LinkedIn\n          2004 : Facebook : Google\n          2005 : YouTube\n          2006 : Twitter",
  '08-styling-of-time-periods-and-events': "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n  timeline:\n    disableMulticolor: true\n---\n    timeline\n        title History of Social Media Platform\n          2002 : LinkedIn\n          2004 : Facebook : Google\n          2005 : YouTube\n          2006 : Twitter",
  '09-customizing-color-scheme': "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n  themeVariables:\n    cScale0: '#ff0000'\n    cScaleLabel0: '#ffffff'\n    cScale1: '#00ff00'\n    cScale2: '#0000ff'\n    cScaleLabel2: '#ffffff'\n---\n       timeline\n        title History of Social Media Platform\n          2002 : LinkedIn\n          2004 : Facebook : Google\n          2005 : YouTube\n          2006 : Twitter\n          2007 : Tumblr\n          2008 : Instagram\n          2010 : Pinterest",
  '10-base-theme': "---\nconfig:\n  logLevel: 'debug'\n  theme: 'base'\n---\n    timeline\n        title History of Social Media Platform\n          2002 : LinkedIn\n          2004 : Facebook : Google\n          2005 : YouTube\n          2006 : Twitter\n          2007 : Tumblr\n          2008 : Instagram\n          2010 : Pinterest",
  '11-forest-theme': "---\nconfig:\n  logLevel: 'debug'\n  theme: 'forest'\n---\n    timeline\n        title History of Social Media Platform\n          2002 : LinkedIn\n          2004 : Facebook : Google\n          2005 : YouTube\n          2006 : Twitter\n          2007 : Tumblr\n          2008 : Instagram\n          2010 : Pinterest",
  '12-dark-theme': "---\nconfig:\n  logLevel: 'debug'\n  theme: 'dark'\n---\n    timeline\n        title History of Social Media Platform\n          2002 : LinkedIn\n          2004 : Facebook : Google\n          2005 : YouTube\n          2006 : Twitter\n          2007 : Tumblr\n          2008 : Instagram\n          2010 : Pinterest",
  '13-the-default-theme': "---\nconfig:\n  logLevel: 'debug'\n  theme: 'default'\n---\n    timeline\n        title History of Social Media Platform\n          2002 : LinkedIn\n          2004 : Facebook : Google\n          2005 : YouTube\n          2006 : Twitter\n          2007 : Tumblr\n          2008 : Instagram\n          2010 : Pinterest",
  '14-neutral-theme': "---\nconfig:\n  logLevel: 'debug'\n  theme: 'neutral'\n---\n    timeline\n        title History of Social Media Platform\n          2002 : LinkedIn\n          2004 : Facebook : Google\n          2005 : YouTube\n          2006 : Twitter\n          2007 : Tumblr\n          2008 : Instagram\n          2010 : Pinterest",
};

const names = Object.keys(EXAMPLES);
/** The source as the front-end receives it: a front-matter block is already blanked out by the registry. */
const src = (name: string): string => (EXAMPLES[name] ?? '').replace(/^---\n[\s\S]*?\n---\n/, (m) => m.replace(/[^\n]/g, ''));
const renderSrc = (name: string): string => EXAMPLES[name] ?? '';
const ruler = pixelRuler();

function textBox(t: SceneText): { l: number; r: number; top: number; bottom: number } {
  const size = t.role?.includes('title') ? 15 / 13 : 1;
  const w = ruler.textWidth(t.text, 'title') * size;
  const l = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return { l, r: l + w, top: t.y - 8, bottom: t.y + 8 };
}

const texts = (items: SceneItem[]): SceneText[] => items.filter((i): i is SceneText => i.kind === 'text');

describe('timeline render', () => {
  for (const name of names) {
    it(`draws ${name}`, () => {
      expect(render(renderSrc(name))).toContain('data-theme="band"');
    });
  }
});

describe('timeline parse', () => {
  it('reads periods, continuation lines and the title of the basic example', () => {
    const m = parseTimeline(src('01-an-example-of-a-timeline'));
    expect(m.title).toBe('History of Social Media Platform');
    expect(m.groups).toHaveLength(1);
    const periods = m.groups[0]?.periods ?? [];
    expect(periods.map((p) => p.label[0])).toEqual(['2002', '2004', '2005', '2006']);
    expect(periods[1]?.events).toEqual([['Facebook'], ['Google']]);
  });

  it('reads several events on one line the same as continuation lines', () => {
    const a = parseTimeline(src('01-an-example-of-a-timeline'));
    const b = parseTimeline(src('02-syntax'));
    expect(b.groups).toEqual(a.groups);
  });

  it('reads sections, <br> lines and the vertical direction', () => {
    const m = parseTimeline(src('05-wrapping-of-text-for-long-time-periods-or-events'));
    expect(m.groups.map((g) => g.name)).toEqual([['2023 Q1', 'Release Personal Tier'], ['2023 Q2', 'Release XYZ Tier']]);
    expect(m.groups[1]?.periods[0]?.events).toEqual([['sub-point', '3a'], ['sub-point 3b'], ['sub-point 3c']]);
    expect(m.direction).toBe('LR');
    expect(parseTimeline(src('06-direction-v11-14-0')).direction).toBe('TD');
  });

  it('keeps the text of every event', () => {
    const m = parseTimeline(src('03-grouping-of-time-periods-in-sections-ages'));
    expect(m.groups[0]?.periods[0]?.events[0]).toEqual(['Machinery, Water power, Steam', 'power']);
  });

  it('takes the title from the front matter when the body has none, and the body wins otherwise', () => {
    expect(parseTimeline('timeline\n  2002 : a', 'From heading').title).toBe('From heading');
    expect(parseTimeline('timeline\n  title Body\n  2002 : a', 'From heading').title).toBe('Body');
  });

  it('ignores the config block', () => {
    const m = parseTimeline(src('09-customizing-color-scheme'));
    expect(m.groups[0]?.periods).toHaveLength(7);
  });

  it('reports a wrong header with its line number', () => {
    expect(() => parseTimeline('timeline\n  title x\n  2002 : a')).not.toThrow();
    try {
      parseTimeline('\n\ntimelin\n  2002 : a');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(3);
    }
  });

  it('reports an event line that has no period before it', () => {
    try {
      parseTimeline('timeline\n  title x\n  : orphan');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(3);
    }
  });
});

describe('timeline layout', () => {
  it('puts the basic example on 200 steps with 152x48 boxes stacked at 8', () => {
    const l = layoutTimeline(parseTimeline(src('01-an-example-of-a-timeline')), ruler);
    expect([l.width, l.height]).toEqual([800, 252]);
    expect(l.periods.map((p) => p.dot.x)).toEqual([100, 300, 500, 700]);
    expect(l.periods.every((p) => p.dot.y === 100)).toBe(true);
    const fb = l.periods[1]?.boxes ?? [];
    expect(fb.map((b) => [b.x, b.y, b.w, b.h])).toEqual([[224, 124, 152, 48], [224, 180, 152, 48]]);
  });

  it('puts the dot at the axis and joins only the first box with a stem', () => {
    const l = layoutTimeline(parseTimeline(src('01-an-example-of-a-timeline')), ruler);
    const stems = l.scene.items.filter((i) => i.kind === 'line' && Array.isArray(i.role) && !i.role.includes('edge--arrow'));
    expect(stems).toHaveLength(4);
  });

  it('wraps long event text and keeps boxes at most 200 wide', () => {
    const l = layoutTimeline(parseTimeline(src('04-wrapping-of-text-for-long-time-periods-or-events')), ruler);
    for (const p of l.periods) for (const b of p.boxes) expect(b.w).toBeLessThanOrEqual(200);
    const tallest = Math.max(...l.periods.flatMap((p) => p.boxes.map((b) => b.h)));
    expect(tallest).toBeGreaterThan(48);
  });

  it('gives all boxes of a column the width of the widest one', () => {
    const l = layoutTimeline(parseTimeline(src('04-wrapping-of-text-for-long-time-periods-or-events')), ruler);
    for (const p of l.periods) expect(new Set(p.boxes.map((b) => b.w)).size).toBeLessThanOrEqual(1);
  });

  it('draws a zone with its name for each section', () => {
    const l = layoutTimeline(parseTimeline(src('03-grouping-of-time-periods-in-sections-ages')), ruler);
    expect(l.zones.map((z) => z.name)).toEqual([['17th-20th century'], ['21st century']]);
    for (const p of l.periods) for (const b of p.boxes) {
      expect(l.zones.some((z) => b.x >= z.x && b.x + b.w <= z.x + z.w && b.y >= z.y && b.y + b.h <= z.y + z.h)).toBe(true);
    }
  });

  it('folds a drawing wider than the limit into rows no wider than it', () => {
    const l = layoutTimeline(parseTimeline(src('10-base-theme')), ruler);
    expect(l.periods.map((p) => p.row)).toEqual([0, 0, 0, 0, 1, 1, 1]);
    expect(l.width).toBeLessThanOrEqual(1280);
    const narrow = layoutTimeline(parseTimeline(src('10-base-theme')), ruler, { maxWidth: 480 });
    expect(narrow.width).toBeLessThanOrEqual(480);
    expect(Math.max(...narrow.periods.map((p) => p.row))).toBeGreaterThan(1);
  });

  it('stacks periods downward in the vertical direction', () => {
    const l = layoutTimeline(parseTimeline(src('06-direction-v11-14-0')), ruler);
    expect(l.direction).toBe('TD');
    const ys = l.periods.map((p) => p.dot.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(new Set(l.periods.map((p) => p.dot.x)).size).toBe(1);
  });

  it('keeps coordinates on the 4 grid for boxes', () => {
    for (const name of names) {
      const l = layoutTimeline(parseTimeline(src(name)), ruler);
      for (const p of l.periods) for (const b of p.boxes) for (const v of [b.x, b.y, b.w, b.h]) expect(v % 4).toBe(0);
    }
  });

  for (const name of names) {
    it(`${name}: texts stay inside the drawing and never overlap`, () => {
      const l = layoutTimeline(parseTimeline(src(name)), ruler);
      const boxes = texts(l.scene.items).map(textBox);
      for (const b of boxes) {
        expect(b.l).toBeGreaterThanOrEqual(0);
        expect(b.r).toBeLessThanOrEqual(l.width);
        expect(b.top).toBeGreaterThanOrEqual(0);
        expect(b.bottom).toBeLessThanOrEqual(l.height);
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (a === undefined || b === undefined) continue;
          const apart = a.r <= b.l || b.r <= a.l || a.bottom <= b.top || b.bottom <= a.top;
          expect(apart).toBe(true);
        }
    });

    it(`${name}: event text fits its box`, () => {
      const l = layoutTimeline(parseTimeline(src(name)), ruler);
      for (const p of l.periods) for (const b of p.boxes) for (const t of b.lines) expect(ruler.textWidth(t, 'title')).toBeLessThanOrEqual(b.w - 32);
    });
  }
});

describe('timeline text', () => {
  it('lists periods on the left and events on the right', () => {
    const r = renderText(src('01-an-example-of-a-timeline'), 80);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines).toEqual(['History of Social Media Platform', '', '2002  LinkedIn', '2004  Facebook', '      Google', '2005  YouTube', '2006  Twitter']);
  });

  it('marks sections on a line of their own and fits the width', () => {
    const r = renderText(src('04-wrapping-of-text-for-long-time-periods-or-events'), 60);
    if ('error' in r) throw new Error(r.error);
    expect(r.lines).toContain('Stone Age');
    expect(r.lines).toContain('Bronze Age');
    expect(Math.max(...r.lines.map((s) => s.length))).toBeLessThanOrEqual(60);
  });
});

describe('timeline colour scheme', () => {
  it('draws plain boxes and neutral dots, with or without sections and whatever disableMulticolor says', () => {
    for (const name of ['07-styling-of-time-periods-and-events', '08-styling-of-time-periods-and-events', '03-grouping-of-time-periods-in-sections-ages']) {
      const svg = render(renderSrc(name));
      expect(svg).not.toMatch(/class="ursula-(box|dot) ursula-series-/);
      expect(svg).toMatch(/<rect class="ursula-box[ "]/);
    }
  });
});

describe('timeline box sizes', () => {
  for (const name of ['03-grouping-of-time-periods-in-sections-ages', '04-wrapping-of-text-for-long-time-periods-or-events', '06-direction-v11-14-0']) {
    it(`${name}: every event box has one width and the n-th boxes of a row one height`, () => {
      const l = layoutTimeline(parseTimeline(src(name)), ruler);
      expect(new Set(l.periods.flatMap((p) => p.boxes.map((b) => b.w))).size).toBe(1);
      const depth = Math.max(...l.periods.map((p) => p.boxes.length));
      for (let k = 0; k < depth; k++) {
        const hs = l.periods.filter((p) => p.boxes[k] !== undefined && l.direction === 'LR').map((p) => p.boxes[k]?.h);
        expect(new Set(hs).size).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('timeline event text', () => {
  it('centres the lines of an event in a box taller than they need, each standing on a baseline 5 below the middle of its line', () => {
    const l = layoutTimeline(parseTimeline(src('04-wrapping-of-text-for-long-time-periods-or-events')), ruler);
    for (const p of l.periods)
      for (const b of p.boxes) {
        const ys = texts(l.scene.items).filter((t) => b.lines.includes(t.text) && t.x === b.x + b.w / 2 && t.y > b.y && t.y < b.y + b.h).map((t) => t.y);
        const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
        expect(mid).toBe(b.y + b.h / 2 + 5);
      }
  });

  it('puts a ring at the start of the time axis', () => {
    const l = layoutTimeline(parseTimeline('timeline\n    2002 : LinkedIn\n    2004 : Facebook'), ruler);
    const axis = l.scene.items.find((i) => i.kind === 'line' && Array.isArray(i.role) && i.role.includes('edge--arrow'));
    const rings = l.scene.items.filter((i) => i.kind === 'circle' && i.role.includes('port'));
    expect(rings).toHaveLength(1);
    expect(axis?.kind === 'line' ? axis.points[0] : undefined).toEqual(rings[0]?.kind === 'circle' ? { x: rings[0].cx, y: rings[0].cy } : undefined);
  });
});
