// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { cellWidth, render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';
import { layoutGantt } from '../src/gantt/layout.ts';
import { parseGantt } from '../src/gantt/parse.ts';
import { compileDateFormat, formatTime, fromDate, stretchOverExcluded } from '../src/gantt/time.ts';
import { pixelRuler } from '../src/metrics.ts';
import type { SceneBox, SceneItem, SceneText } from '../src/types.ts';

const examples: Record<string, string> = {
  note: `gantt
    title A Gantt Diagram
    dateFormat YYYY-MM-DD
    section Section
        A task          :a1, 2014-01-01, 30d
        Another task    :after a1, 20d
    section Another
        Task in Another :2014-01-12, 12d
        another task    :24d`,
  syntax: `gantt
    dateFormat  YYYY-MM-DD
    title       Adding GANTT diagram functionality to mermaid
    excludes    weekends
    %% (\`excludes\` accepts specific dates in YYYY-MM-DD format, days of the week ("sunday") or "weekends", but not the word "weekdays".)

    section A section
    Completed task            :done,    des1, 2014-01-06,2014-01-08
    Active task               :active,  des2, 2014-01-09, 3d
    Future task               :         des3, after des2, 5d
    Future task2              :         des4, after des3, 5d

    section Critical tasks
    Completed task in the critical line :crit, done, 2014-01-06,24h
    Implement parser and jison          :crit, done, after des1, 2d
    Create tests for parser             :crit, active, 3d
    Future task in critical line        :crit, 5d
    Create tests for renderer           :2d
    Add to mermaid                      :until isadded
    Functionality added                 :milestone, isadded, 2014-01-25, 0d

    section Documentation
    Describe gantt syntax               :active, a1, after des1, 3d
    Add gantt diagram to demo page      :after a1  , 20h
    Add another diagram to demo page    :doc1, after a1  , 48h

    section Last section
    Describe gantt syntax               :after doc1, 3d
    Add gantt diagram to demo page      :20h
    Add another diagram to demo page    :48h`,
  duration: `gantt
    apple :a, 2017-07-20, 1w
    banana :crit, b, 2017-07-23, 1d
    cherry :active, c, after b a, 1d
    kiwi   :d, 2017-07-20, until b c`,
  weekend: `gantt
    title A Gantt Diagram Excluding Fri - Sat weekends
    dateFormat YYYY-MM-DD
    excludes weekends
    weekend friday
    section Section
        A task          :a1, 2024-01-01, 30d
        Another task    :after a1, 20d`,
  milestones: `gantt
    dateFormat HH:mm
    axisFormat %H:%M
    Initial milestone : milestone, m1, 17:49, 2m
    Task A : 10m
    Task B : 5m
    Final milestone : milestone, m2, 18:08, 4m`,
  vert: `gantt
    dateFormat HH:mm
    axisFormat %H:%M
    Initial vert : vert, v1, 17:30, 2m
    Task A : 3m
    Task B : 8m
    Final vert : vert, v2, 17:58, 4m`,
  compact: `
gantt
    title A Gantt Diagram
    dateFormat  YYYY-MM-DD

    section Section
    A task           :a1, 2014-01-01, 30d
    Another task     :a2, 2014-01-20, 25d
    Another one      :a3, 2014-02-10, 20d`,
  comments: `gantt
    title A Gantt Diagram
    %% This is a comment
    dateFormat YYYY-MM-DD
    section Section
        A task          :a1, 2014-01-01, 30d
        Another task    :after a1, 20d
    section Another
        Task in Another :2014-01-12, 12d
        another task    :24d`,
  bars: `gantt
    title Git Issues - days since last update
    dateFormat X
    axisFormat %s
    section Issue19062
    71   : 0, 71
    section Issue19401
    36   : 0, 36
    section Issue193
    34   : 0, 34
    section Issue7441
    9    : 0, 9
    section Issue1300
    5    : 0, 5`,
  timeline: `

gantt
    title Timeline - Gantt Sampler
    dateFormat YYYY
    axisFormat %y
    %% this next line doesn't recognise 'decade' or 'year', but will silently ignore
    tickInterval 1decade

    section Issue19062
    71   :            item71, 1900, 1930
    section Issue19401
    36   :            item36, 1913, 1935
    section Issue1300
    94   :            item94, 1910, 1915
    5    :            item5,  1920, 1925
    0    : milestone, item0,  1918, 1s
    9    : vert,              1906, 1s   %% not yet official
    64   : workaround,        1923, 1s   %% custom CSS object https://github.com/mermaid-js/mermaid/issues/3250`,
};

const settingsOnly = `gantt
  tickInterval 1week
  weekday monday`;

const themes = ['solid', 'outline', 'card'] as const;

describe('gantt svg', () => {
  for (const [name, src] of Object.entries(examples)) {
    for (const theme of themes) {
      it(`${name} draws in ${theme}`, () => {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg).toContain('ursula-grid');
      });
    }
  }

  it('is picked by the header', () => {
    expect(selectFrontEnd(examples['note'] ?? '').name).toBe('gantt');
  });

  it('refuses a chart of settings only, because there is nothing to draw', () => {
    expect(() => render(settingsOnly)).toThrow(UrsulaError);
  });

  it('reads the front matter title and ignores accessibility lines', () => {
    const svg = render(`---\ntitle: From front matter\n---\ngantt\n accTitle: Plan\n accDescr: a plan\n dateFormat YYYY-MM-DD\n A :2024-01-01, 3d`);
    expect(svg).toContain('From front matter');
    expect(svg).toContain('<title>Plan</title>');
  });

  it('gives the same lines in every theme apart from what a theme changes', () => {
    const strip = (svg: string): string => svg.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/data-theme="\w+"/, '');
    const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? '');
    expect(texts(strip(render(examples['note'] ?? '', { theme: 'outline' })))).toEqual(texts(strip(render(examples['note'] ?? '', { theme: 'card' }))));
  });
});

describe('gantt parse', () => {
  const ymd = (t: number): string => formatTime('%Y-%m-%d', t);

  it('reads the dates of the first example', () => {
    const g = parseGantt(examples['note'] ?? '');
    expect(g.title).toBe('A Gantt Diagram');
    expect(g.sections).toEqual(['Section', 'Another']);
    expect(g.tasks.map((t) => [t.label, ymd(t.start), ymd(t.end), t.durationText])).toEqual([
      ['A task', '2014-01-01', '2014-01-31', '30d'],
      ['Another task', '2014-01-31', '2014-02-20', '20d'],
      ['Task in Another', '2014-01-12', '2014-01-24', '12d'],
      ['another task', '2014-01-24', '2014-02-17', '24d'],
    ]);
    expect(g.tasks[1]?.after).toEqual([0]);
  });

  it('stretches a task over excluded days and starts the next one on a working day', () => {
    const g = parseGantt(examples['syntax'] ?? '');
    const byLabel = (label: string, n = 0) => g.tasks.filter((t) => t.label === label)[n];
    // Thu 9th + 3 working days = Thu, Fri, Mon, so it ends at the start of Tue 14th.
    expect(ymd(byLabel('Active task')?.end ?? 0)).toBe('2014-01-14');
    expect(ymd(byLabel('Future task')?.end ?? 0)).toBe('2014-01-21');
    // An `after` that lands on Saturday waits for Monday.
    const demo = byLabel('Add gantt diagram to demo page', 0);
    expect(ymd(demo?.start ?? 0)).toBe('2014-01-13');
    expect(formatTime('%H:%M', demo?.end ?? 0)).toBe('20:00');
    expect(byLabel('Completed task in the critical line')).toMatchObject({ crit: true, done: true });
    expect(byLabel('Functionality added')).toMatchObject({ milestone: true });
    expect(ymd(byLabel('Add to mermaid')?.end ?? 0)).toBe('2014-01-25');
  });

  it('takes the latest end for after and the earliest start for until', () => {
    const g = parseGantt(examples['duration'] ?? '');
    const [apple, banana, cherry, kiwi] = g.tasks;
    expect(ymd(cherry?.start ?? 0)).toBe(ymd(apple?.end ?? 0));
    expect(cherry?.after).toEqual([1, 0]);
    expect(ymd(kiwi?.end ?? 0)).toBe(ymd(banana?.start ?? 0));
  });

  it('counts from the weekend that the weekend line names', () => {
    const g = parseGantt(examples['weekend'] ?? '');
    expect(g.excludes.weekdays).toEqual([5, 6]);
    expect(ymd(g.tasks[0]?.end ?? 0)).toBe('2024-02-12');
  });

  it('reads times to the minute and unix seconds', () => {
    const m = parseGantt(examples['milestones'] ?? '');
    expect(m.tasks.map((t) => formatTime('%H:%M', t.start))).toEqual(['17:49', '17:51', '18:01', '18:08']);
    const b = parseGantt(examples['bars'] ?? '');
    expect(b.tasks.map((t) => t.end - t.start)).toEqual([71_000, 36_000, 34_000, 9_000, 5_000]);
    expect(b.tasks[0]?.durationText).toBe('71s');
  });

  it('lets a vertical marker take no row but keep its place in the sequence', () => {
    const g = parseGantt(examples['vert'] ?? '');
    expect(g.tasks.filter((t) => t.vert).map((t) => t.label)).toEqual(['Initial vert', 'Final vert']);
    expect(formatTime('%H:%M', g.tasks[1]?.start ?? 0)).toBe('17:32');
  });

  it('reads a year-only format and ignores an unknown tick interval', () => {
    const g = parseGantt(examples['timeline'] ?? '');
    expect(g.tickInterval).toBeUndefined();
    expect(g.tasks[0]?.start).toBe(fromDate(1900, 1, 1));
    expect(g.tasks[0]?.durationText).toBe('30y');
  });

  it('parses date formats strictly', () => {
    const f = compileDateFormat('DD/MM/YYYY HH:mm');
    expect(f.parse('05/03/2024 09:30')).toBe(fromDate(2024, 3, 5) + 9.5 * 3_600_000);
    expect(f.parse('31/02/2024 09:30')).toBeUndefined();
    expect(compileDateFormat('X').parse('90')).toBe(90_000);
  });

  it('stretches over excluded days like the documented rule', () => {
    const ex = { weekdays: [6, 0], days: [] };
    const fri = fromDate(2014, 1, 3);
    expect(stretchOverExcluded(fri, fri + 2 * 86_400_000, ex)).toBe(fromDate(2014, 1, 7));
  });

  it('rejects a task it cannot read, with the line number', () => {
    for (const [src, line] of [
      ['gantt\n  A :2024-01-01, 3d\n  B : not-a-date, 3d', 3],
      ['gantt\n  A :2024-01-01, 3d\n  just words', 3],
      ['gantt\n  A :after missing, 3d', 2],
      ['gantt\n  A : 3d', 2],
    ] as const) {
      try {
        parseGantt(src);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(UrsulaError);
        expect((err as UrsulaError).line).toBe(line);
      }
    }
  });
});

const textRect = (t: SceneText, ruler = pixelRuler()): { x0: number; x1: number; y0: number; y1: number } => {
  const size = t.role?.includes('title') ? 15 : t.role?.includes('zone-name') ? 13 : t.role?.some((r) => ['tick', 'tag-text', 'axis-name'].includes(r)) ? (t.role.includes('axis-name') ? 12 : 11) : 12;
  const w = (ruler.textWidth(t.text, 'line') * size) / 12;
  const mid = t.role?.includes('tag-text');
  const x0 = mid ? t.x - w / 2 : t.x;
  return { x0, x1: x0 + w, y0: t.y - 7, y1: t.y + 7 };
};

describe('gantt layout', () => {
  const ruler = pixelRuler();
  for (const [name, src] of Object.entries(examples)) {
    const layout = layoutGantt(parseGantt(src), ruler);
    const texts = layout.scene.items.filter((i): i is SceneText => i.kind === 'text');

    it(`${name}: keeps bar length proportional to time`, () => {
      const g = parseGantt(src);
      for (const bar of layout.bars) {
        const t = g.tasks[bar.task];
        if (t === undefined || t.milestone) continue;
        const exact = (t.end - t.start) * layout.scale;
        if (exact >= 4) expect(Math.abs(bar.w - exact)).toBeLessThanOrEqual(1);
        const first = layout.bars[0];
        const head = first === undefined ? undefined : g.tasks[first.task];
        if (first !== undefined && head !== undefined && !head.milestone) expect(Math.abs(bar.x - first.x - (t.start - head.start) * layout.scale)).toBeLessThanOrEqual(1);
      }
    });

    it(`${name}: puts no text over another text and none outside the drawing`, () => {
      const rects = texts.map((t) => ({ ...textRect(t), text: t.text }));
      for (const r of rects) {
        expect(r.x0, r.text).toBeGreaterThanOrEqual(0);
        expect(r.x1, r.text).toBeLessThanOrEqual(layout.scene.width);
        expect(r.y1, r.text).toBeLessThanOrEqual(layout.scene.height);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          if (!a || !b) continue;
          expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, `${a.text} / ${b.text}`).toBe(false);
        }
      }
    });

    it(`${name}: puts the frame on the 4 grid`, () => {
      expect(layout.scene.width % 4).toBe(0);
      expect(layout.scene.height % 4).toBe(0);
      const boxes = layout.scene.items.filter((i): i is SceneBox => i.kind === 'box' && !(i.role ?? []).some((r) => ['band', 'zone', 'tag'].includes(r)));
      for (const b of boxes) for (const v of [b.x, b.y, b.w, b.h]) expect(v % 4).toBe(0);
      for (const bar of layout.bars) expect((bar.y - 8) % 4).toBe(0);
    });
  }

  it('lays the first example like the reference rules', () => {
    const src = `gantt
    title Product Launch Plan
    dateFormat YYYY-MM-DD
    section Planning
    Market research :done, research, 2024-03-01, 10d
    Define requirements :done, reqs, after research, 7d
    section Build
    Design prototype :active, proto, after reqs, 14d
    User testing :testing, after proto, 7d
    section Launch
    Release day :milestone, release, after testing, 0d
    Marketing campaign :market, after proto, 14d`;
    const layout = layoutGantt(parseGantt(src), ruler);
    expect(layout.scale * 86_400_000).toBe(16);
    expect(layout.origin).toBe(288);
    expect(layout.bars.map((b) => [b.x, b.w, b.h])).toEqual([
      [288, 160, 24],
      [448, 112, 24],
      [560, 224, 24],
      [784, 112, 24],
      [884, 24, 24],
      [784, 224, 24],
    ]);
    expect(layout.bars.map((b) => b.y)).toEqual([128, 168, 208, 248, 288, 328]);
    const lines = layout.scene.items.filter((i) => i.kind === 'line' && Array.isArray(i.role) && i.role.includes('edge--arrow'));
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  it('leaves out an after line that would pass over another bar and says so', () => {
    const src = `gantt
    dateFormat YYYY-MM-DD
    A :a, 2024-03-01, 10d
    B :b, 2024-03-01, 30d
    C :after a, 5d`;
    const layout = layoutGantt(parseGantt(src), ruler);
    expect(layout.omitted).toEqual([{ from: 0, to: 2, reason: 'crosses' }]);
  });

  it('draws excluded days as columns and a critical task with an accent border', () => {
    const items: SceneItem[] = layoutGantt(parseGantt(examples['syntax'] ?? ''), ruler).scene.items;
    expect(items.some((i) => i.kind === 'box' && i.data?.['excluded'] === 'true')).toBe(true);
    expect(items.some((i) => i.kind === 'path' && i.role.includes('edge--accent'))).toBe(true);
  });
});

describe('gantt compact mode', () => {
  const compact = `---
displayMode: compact
---
gantt
    dateFormat  YYYY-MM-DD
    section Section
    A task           :a1, 2014-01-01, 30d
    Another task     :a2, 2014-01-20, 25d
    Another one      :a3, 2014-02-10, 20d`;
  const blank = compact.replace(/^---[\s\S]*?---\n/, '\n\n\n\n');

  it('puts a task on the topmost row of its section that it does not overlap', () => {
    const rows = (src: string, config?: Record<string, never>) => layoutGantt(parseGantt(src, config === undefined ? {} : { config }), pixelRuler()).bars.map((b) => b.row);
    expect(rows(blank)).toEqual([0, 1, 2]);
    expect(layoutGantt(parseGantt(blank, { frontMatter: { displayMode: 'compact' } }), pixelRuler()).bars.map((b) => b.row)).toEqual([0, 1, 0]);
    expect(layoutGantt(parseGantt(blank, { config: { gantt: { displayMode: 'compact' } } }), pixelRuler()).bars.map((b) => b.row)).toEqual([0, 1, 0]);
  });

  it('reads the front matter through render and names a shared row\'s later task inside its band', () => {
    const svg = render(compact);
    expect(svg.match(/ursula-band/g)).toHaveLength(3);
    const layout = layoutGantt(parseGantt(blank, { frontMatter: { displayMode: 'compact' } }), pixelRuler());
    const inner = layout.scene.items.filter((i): i is SceneText => i.kind === 'text' && i.text === 'Another one');
    expect(inner).toHaveLength(1);
    expect(layout.scene.items.filter((i) => i.kind === 'text' && i.text === 'A task')).toHaveLength(1);
  });
});

describe('gantt text', () => {
  const text = (src: string, width: number): string[] => {
    const r = renderText(src, width);
    if ('error' in r) throw new Error(r.error);
    return r.lines;
  };

  it('draws names, an axis and bars within the width', () => {
    for (const [name, src] of Object.entries(examples)) {
      const lines = text(src, 80);
      expect(Math.max(...lines.map(cellWidth)), name).toBeLessThanOrEqual(80);
    }
    const lines = text(examples['note'] ?? '', 80);
    expect(lines.join('\n')).toContain('█');
    expect(lines[0]).toBe('A Gantt Diagram');
    expect(lines.find((l) => l.includes('A task'))).toContain('30d');
  });

  it('draws a milestone as a diamond', () => {
    expect(text(examples['syntax'] ?? '', 100).join('\n')).toContain('◆');
  });

  it('reports a width that is too small', () => {
    expect(renderText(examples['note'] ?? '', 20)).toHaveProperty('error');
  });
});
