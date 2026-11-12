// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { layoutArchitecture } from '../src/architecture/layout.ts';
import { parseArchitecture } from '../src/architecture/parse.ts';
import { placeCells } from '../src/architecture/place.ts';
import { pixelRuler } from '../src/metrics.ts';
import { render, renderText, UrsulaError } from '../src/index.ts';
import type { SceneBox, SceneText } from '../src/types.ts';

const BASIC = `architecture-beta
    group api(cloud)[API]

    service db(database)[Database] in api
    service disk1(disk)[Storage] in api
    service disk2(disk)[Storage] in api
    service server(server)[Server] in api

    db:L -- R:server
    disk1:T -- B:server
    disk2:T -- B:db`;

const COLUMN = `architecture-beta
    group api(cloud)[API]
    service db1(database)[DB1] in api
    service db2(database)[DB2] in api
    service db3(database)[DB3] in api
    service mcp(server)[MCP] in api
    db1:R --> L:mcp
    db2:R --> L:mcp
    db3:R --> L:mcp
    align column db1 db2 db3`;

const ROW = `architecture-beta
    service src1(server)[Source 1]
    service src2(server)[Source 2]
    service src3(server)[Source 3]
    service proc(server)[Processor]
    src1:B --> T:proc
    src2:B --> T:proc
    src3:B --> T:proc
    align row src1 src2 src3`;

const GRID = `architecture-beta
    group sources(cloud)[Sources]
        service src_a(server)[Source A] in sources
        service src_b(server)[Source B] in sources
        service src_c(server)[Source C] in sources

    group storage(database)[Storage]
        service db_one(database)[DB One] in storage
        service db_two(database)[DB Two] in storage
        service db_three(database)[DB Three] in storage

    group output(disk)[Output]
        service brief(disk)[Brief] in output
        service analyst(server)[Analyst] in output
        service delivery(cloud)[Delivery] in output

    src_a:B --> T:db_one
    src_b:B --> T:db_two
    src_c:B --> T:db_three
    db_two:B --> T:brief
    brief:R --> L:analyst
    analyst:R --> L:delivery

    align row src_a src_b src_c
    align row db_one db_two db_three
    align row brief analyst delivery

    align column src_a db_one
    align column src_b db_two brief
    align column src_c db_three`;

const JUNCTIONS = `architecture-beta
    service left_disk(disk)[Disk]
    service top_disk(disk)[Disk]
    service bottom_disk(disk)[Disk]
    service top_gateway(internet)[Gateway]
    service bottom_gateway(internet)[Gateway]
    junction junctionCenter
    junction junctionRight

    left_disk:R -- L:junctionCenter
    top_disk:B -- T:junctionCenter
    bottom_disk:T -- B:junctionCenter
    junctionCenter:R -- L:junctionRight
    top_gateway:B -- T:junctionRight
    bottom_gateway:T -- B:junctionRight`;

const ICONS = `architecture-beta
    group api(logos:aws-lambda)[API]

    service db(logos:aws-aurora)[Database] in api
    service disk1(logos:aws-glacier)[Storage] in api
    service disk2(logos:aws-s3)[Storage] in api
    service server(logos:aws-ec2)[Server] in api

    db:L -- R:server
    disk1:T -- B:server
    disk2:T -- B:db`;

const EXAMPLES = { BASIC, COLUMN, ROW, GRID, JUNCTIONS, ICONS };
const THEMES = ['solid', 'outline', 'card'] as const;
const ruler = pixelRuler();

const WIDTH_ROLE: Record<string, 'title' | 'line'> = { name: 'title', 'zone-name': 'title', title: 'title', 'tag-text': 'line', 'zone-sub': 'line' };

/** The rectangle a scene text covers, from the ruler's width of its text. */
function textRect(t: SceneText): { x: number; y: number; w: number; h: number } {
  const role = (t.role ?? []).map((r) => WIDTH_ROLE[r]).find((r) => r !== undefined) ?? 'line';
  const w = ruler.textWidth(t.text, role);
  const x = t.anchor === 'middle' || (t.role ?? []).some((r) => r === 'name' || r === 'tag-text') ? t.x - w / 2 : t.x;
  return { x, y: t.y - 7, w, h: 14 };
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('architecture render', () => {
  for (const [name, src] of Object.entries(EXAMPLES)) {
    it(`draws ${name} in three themes`, () => {
      for (const theme of THEMES) expect(render(src, { theme })).toContain(`data-theme="${theme}"`);
      expect(render(src)).toContain('data-theme="solid"');
    });
  }
});

describe('architecture parse', () => {
  it('reads groups, services, edges and sides', () => {
    const m = parseArchitecture(BASIC);
    expect(m.groups).toEqual([{ id: 'api', icon: 'cloud', label: 'API', line: 2 }]);
    expect(m.nodes.map((n) => [n.id, n.icon, n.label, n.parent])).toEqual([
      ['db', 'database', 'Database', 'api'],
      ['disk1', 'disk', 'Storage', 'api'],
      ['disk2', 'disk', 'Storage', 'api'],
      ['server', 'server', 'Server', 'api'],
    ]);
    expect(m.edges.map((e) => [e.from, e.fromSide, e.toSide, e.to, e.startArrow, e.endArrow])).toEqual([
      ['db', 'L', 'R', 'server', false, false],
      ['disk1', 'T', 'B', 'server', false, false],
      ['disk2', 'T', 'B', 'db', false, false],
    ]);
  });

  it('reads arrows, align lines, junctions and group edges', () => {
    const m = parseArchitecture(COLUMN);
    expect(m.edges.every((e) => e.endArrow && !e.startArrow)).toBe(true);
    expect(m.aligns).toEqual([{ axis: 'column', members: ['db1', 'db2', 'db3'], line: 10 }]);
    const j = parseArchitecture(JUNCTIONS);
    expect(j.nodes.filter((n) => n.kind === 'junction').map((n) => n.id)).toEqual(['junctionCenter', 'junctionRight']);
    const g = parseArchitecture(`architecture-beta
  group one(cloud)[One]
  group two(cloud)[Two] in one
  service a[A] in one
  service b[B] in two
  a{group}:R <--> L:b{group}`);
    expect(g.groups[1]?.parent).toBe('one');
    expect(g.edges[0]).toMatchObject({ fromGroup: true, toGroup: true, startArrow: true, endArrow: true });
    expect(g.nodes[0]?.icon).toBeUndefined();
  });

  it('ignores config, comments and accessibility lines', () => {
    const m = parseArchitecture(`
%% a comment
architecture-beta
  accTitle: Two services
  accDescr: A and B
  service a(server)[A]
  service b(server)[B]
  a:R -- L:b`);
    expect(m.accTitle).toBe('Two services');
    expect(m.nodes).toHaveLength(2);
  });

  it('reports a wrong line with its number', () => {
    const bad = `architecture-beta
  service a(server)[A]
  a:X -- L:b`;
    try {
      parseArchitecture(bad);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UrsulaError);
      expect((err as UrsulaError).line).toBe(3);
    }
    expect(() => parseArchitecture('architecture-beta\n service a[A]\n a:R -- L:z')).toThrow(/line 3/);
    expect(renderText(bad, 60)).toHaveProperty('error');
  });
});

describe('architecture cells', () => {
  const cellsOf = (src: string): Record<string, string> => Object.fromEntries([...placeCells(parseArchitecture(src))].map(([id, c]) => [id, `${c.col},${c.row}`]));

  it('puts the far end of an edge in the cell its sides name', () => {
    const c = cellsOf(BASIC);
    expect(c['server']).toBe('0,0');
    expect(c['db']).toBe('1,0');
    expect(c['disk1']).toBe('0,1');
    expect(c['disk2']).toBe('1,1');
  });

  it('pushes a newcomer on when the cell is taken, along the align line when there is one', () => {
    const col = cellsOf(COLUMN);
    expect([col['db1'], col['db2'], col['db3']]).toEqual(['0,0', '0,1', '0,2']);
    expect(col['mcp']).toBe('1,1');
    const row = cellsOf(ROW);
    expect([row['src1'], row['src2'], row['src3']]).toEqual(['0,0', '1,0', '2,0']);
    expect(row['proc']).toBe('1,1');
  });

  it('packs unconnected pieces side by side and keeps rows aligned', () => {
    const c = cellsOf(GRID);
    expect([c['src_a'], c['src_b'], c['src_c']]).toEqual(['0,0', '1,0', '2,0']);
    expect([c['db_one'], c['db_two'], c['db_three']]).toEqual(['0,1', '1,1', '2,1']);
    expect([c['brief'], c['analyst'], c['delivery']]).toEqual(['1,2', '2,2', '3,2']);
  });

  it('turns a perpendicular pair of sides into a diagonal step', () => {
    const c = cellsOf(`architecture-beta
  service a[A]
  service b[B]
  a:T -- L:b`);
    expect([c['a'], c['b']]).toEqual(['0,1', '1,0']);
  });
});

describe('architecture layout', () => {
  for (const [name, src] of Object.entries(EXAMPLES)) {
    const layout = layoutArchitecture(parseArchitecture(src), ruler);
    const { scene } = layout;
    const boxes = scene.items.filter((i): i is SceneBox => i.kind === 'box');
    const texts = scene.items.filter((i): i is SceneText => i.kind === 'text');

    it(`${name}: no two texts overlap and none leaves the drawing`, () => {
      const rects = texts.map(textRect);
      rects.forEach((r, i) => {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(scene.width);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.y + r.h).toBeLessThanOrEqual(scene.height);
        rects.slice(i + 1).forEach((o) => expect(overlap(r, o)).toBe(false));
      });
    });

    it(`${name}: a service's texts stay inside its box and its box inside its group`, () => {
      for (const n of layout.nodes.filter((x) => x.kind === 'service')) {
        const mine = texts.filter((t) => t.data?.['service'] === n.id).map(textRect);
        for (const r of mine) {
          expect(r.x).toBeGreaterThanOrEqual(n.x);
          expect(r.x + r.w).toBeLessThanOrEqual(n.x + n.w);
          expect(r.y).toBeGreaterThanOrEqual(n.y);
          expect(r.y + r.h).toBeLessThanOrEqual(n.y + n.h);
        }
      }
      const parent = new Map(parseArchitecture(src).nodes.map((n) => [n.id, n.parent]));
      for (const n of layout.nodes) {
        const g = layout.groups.find((x) => x.id === parent.get(n.id));
        if (g === undefined) continue;
        expect(n.x).toBeGreaterThanOrEqual(g.x + 24);
        expect(n.x + n.w).toBeLessThanOrEqual(g.x + g.w - 24);
        expect(n.y).toBeGreaterThanOrEqual(g.y + 72);
        expect(n.y + n.h).toBeLessThanOrEqual(g.y + g.h - 24);
      }
      expect(boxes.length).toBeGreaterThan(0);
    });

    it(`${name}: service boxes do not overlap and sit on the 4 grid`, () => {
      const services = layout.nodes.filter((n) => n.kind === 'service');
      services.forEach((n, i) => {
        for (const v of [n.x, n.y, n.w, n.h]) expect(v % 4).toBe(0);
        services.slice(i + 1).forEach((o) => expect(overlap(n, o)).toBe(false));
      });
    });

    it(`${name}: every line is a run of right angles`, () => {
      for (const e of layout.edges) {
        e.points.slice(1).forEach((p, i) => {
          const q = e.points[i];
          expect(q !== undefined && (q.x === p.x || q.y === p.y)).toBe(true);
        });
      }
    });
  }

  it('draws every group name, icon name, service name and icon name', () => {
    const texts = layoutArchitecture(parseArchitecture(ICONS), ruler).scene.items.filter((i): i is SceneText => i.kind === 'text').map((t) => t.text);
    for (const want of ['API', 'logos:aws-lambda', 'Database', 'logos:aws-aurora', 'Storage', 'logos:aws-glacier', 'logos:aws-s3', 'Server', 'logos:aws-ec2']) {
      expect(texts).toContain(want);
    }
  });

  it('puts a straight line between aligned neighbours and stops an arrowhead 3 short of the box', () => {
    const l = layoutArchitecture(parseArchitecture(GRID), ruler);
    const first = l.edges[0];
    const src = l.nodes.find((n) => n.id === 'src_a');
    const dst = l.nodes.find((n) => n.id === 'db_one');
    expect(first?.points).toHaveLength(2);
    expect(first?.points[0]).toEqual({ x: (src?.x ?? 0) + (src?.w ?? 0) / 2, y: (src?.y ?? 0) + (src?.h ?? 0) });
    expect(first?.points[1]?.y).toBe((dst?.y ?? 0) - 3);
  });

  it('marks the kind of every service by its icon name, and draws a junction as a dot', () => {
    const items = layoutArchitecture(parseArchitecture(JUNCTIONS), ruler).scene.items;
    expect(items.filter((i) => i.kind === 'circle')).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'text' && i.role?.includes('tag-text')).map((t) => (t as SceneText).text).sort()).toEqual(['disk', 'disk', 'disk', 'internet', 'internet']);
  });

  it('makes room for a nested group and a group with no member', () => {
    const l = layoutArchitecture(
      parseArchitecture(`architecture-beta
  group one(cloud)[Outer group with a long name]
  group two(server)[Inner] in one
  group empty(disk)[Nothing yet]
  service a(server)[A] in two
  service b(server)[B] in one
  a:R -- L:b`),
      ruler,
    );
    const [one, two, empty] = ['one', 'two', 'empty'].map((id) => l.groups.find((g) => g.id === id));
    expect(one?.depth).toBe(1);
    expect(two?.depth).toBe(2);
    expect(empty).toBeDefined();
    expect(two !== undefined && one !== undefined && two.x > one.x && two.x + two.w < one.x + one.w).toBe(true);
    expect(two !== undefined && empty !== undefined && overlap(two, empty)).toBe(false);
  });

  it('draws an edge that leaves a group at the group border', () => {
    const l = layoutArchitecture(
      parseArchitecture(`architecture-beta
  group left(cloud)[Left]
  group right(cloud)[Right]
  service a(server)[A] in left
  service b(server)[B] in right
  a{group}:R --> L:b{group}`),
      ruler,
    );
    const g = l.groups.find((x) => x.id === 'left');
    expect(l.edges[0]?.points[0]?.x).toBe((g?.x ?? 0) + (g?.w ?? 0));
  });

  it('draws the title above the drawing when the source has one', () => {
    const svg = render('architecture-beta\n  title Shop\n  service a(server)[A]');
    expect(svg).toContain('>Shop<');
  });
});

describe('architecture terminal output', () => {
  it('lists the groups with their services and then the connections', () => {
    const out = renderText(BASIC, 60);
    expect('lines' in out).toBe(true);
    if (!('lines' in out)) return;
    expect(out.lines[0]).toContain('API');
    expect(out.lines.join('\n')).toContain('Connections');
    expect(out.lines.join('\n')).toContain('Storage (disk1):T -- B:Server');
    for (const line of out.lines) expect(line.length).toBeLessThanOrEqual(60);
  });
});
