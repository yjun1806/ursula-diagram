import { describe, expect, it } from 'vitest';
import { layout, pixelRuler } from '../src/index.ts';
import { c4Graph } from '../src/c4/graph.ts';
import { parseC4 } from '../src/c4/parse.ts';
import { crossingCount } from '../src/layout/check.ts';
import type { Box } from '../src/layout/global-route.ts';
import { routeGlobally } from '../src/layout/global-route.ts';
import type { Point } from '../src/types.ts';

const box = (id: string, x: number, y: number, w = 80, h = 40): Box & { id: string } => ({ id, x, y, w, h });
const bends = (p: Point[]): number => Math.max(0, p.length - 2);
const segs = (p: Point[]): Array<[Point, Point]> => p.slice(1).map((q, i) => [p[i] as Point, q]);
const crosses = ([a, b]: [Point, Point], r: Box): boolean =>
  Math.min(a.x, b.x) < r.x + r.w && Math.max(a.x, b.x) > r.x && Math.min(a.y, b.y) < r.y + r.h && Math.max(a.y, b.y) > r.y;
const edge = (from: string, to: string) => ({ from, to, current: [] as Point[] });

describe('routeGlobally', () => {
  it('draws a straight line when nothing stands between the ends', () => {
    const [p] = routeGlobally({ width: 400, height: 200, nodes: [box('a', 40, 80), box('b', 280, 80)], clusters: [], edges: [edge('a', 'b')] });
    expect(p).toEqual([{ x: 120, y: 100 }, { x: 280, y: 100 }]);
  });

  it('goes round one node in the way with two bends', () => {
    const wall = box('w', 160, 60, 40, 60);
    const [p] = routeGlobally({ width: 400, height: 260, nodes: [box('a', 20, 80), box('b', 300, 140), wall], clusters: [], edges: [edge('a', 'b')] });
    expect(p).toBeDefined();
    expect(bends(p as Point[])).toBeLessThanOrEqual(2);
    for (const s of segs(p as Point[])) expect(crosses(s, wall)).toBe(false);
  });

  it('brings two lines into one face without crossing, at least 8 apart', () => {
    const nodes = [box('a', 20, 20), box('b', 260, 20), box('t', 140, 160)];
    const found = routeGlobally({ width: 400, height: 260, nodes, clusters: [], edges: [edge('a', 't'), edge('b', 't')] }) as Point[][];
    const [one, two] = found as [Point[], Point[]];
    const ends = [one.at(-1) as Point, two.at(-1) as Point];
    expect(Math.hypot((ends[0] as Point).x - (ends[1] as Point).x, (ends[0] as Point).y - (ends[1] as Point).y)).toBeGreaterThanOrEqual(8);
    expect(crossingCount([{ points: one }, { points: two }] as never)).toBe(0);
  });

  it('never goes through the name of a cluster', () => {
    const name = { x: 150, y: 90, w: 100, h: 20 };
    const [p] = routeGlobally({
      width: 400,
      height: 220,
      nodes: [box('a', 20, 80), box('b', 300, 80)],
      clusters: [{ id: 'c', box: { x: 130, y: 70, w: 140, h: 100 }, name }],
      edges: [edge('a', 'b')],
    });
    expect(p).toBeDefined();
    for (const s of segs(p as Point[])) expect(crosses(s, name)).toBe(false);
  });

  it('leaves an edge that cannot be routed to the line it has', () => {
    const [p] = routeGlobally({ width: 400, height: 200, nodes: [box('a', 40, 80)], clusters: [], edges: [edge('a', 'a')] });
    expect(p).toBeUndefined();
  });
});

const C4_CONTAINER = `    C4Container
    title Container diagram for Internet Banking System

    System_Ext(email_system, "E-Mail System", "The internal Microsoft Exchange system", $tags="v1.0")
    Person(customer, Customer, "A customer of the bank, with personal bank accounts", $tags="v1.0")

    Container_Boundary(c1, "Internet Banking") {
        Container(spa, "Single-Page App", "JavaScript, Angular", "Provides all the Internet banking functionality to customers via their web browser")
        Container_Ext(mobile_app, "Mobile App", "C#, Xamarin", "Provides a limited subset of the Internet banking functionality to customers via their mobile device")
        Container(web_app, "Web Application", "Java, Spring MVC", "Delivers the static content and the Internet banking SPA")
        ContainerDb(database, "Database", "SQL Database", "Stores user registration information, hashed auth credentials, access logs, etc.")
        ContainerDb_Ext(backend_api, "API Application", "Java, Docker Container", "Provides Internet banking functionality via API")

    }

    System_Ext(banking_system, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")

    Rel(customer, web_app, "Uses", "HTTPS")
    UpdateRelStyle(customer, web_app, $offsetY="60", $offsetX="90")
    Rel(customer, spa, "Uses", "HTTPS")
    UpdateRelStyle(customer, spa, $offsetY="-40")
    Rel(customer, mobile_app, "Uses")
    UpdateRelStyle(customer, mobile_app, $offsetY="-30")

    Rel(web_app, spa, "Delivers")
    UpdateRelStyle(web_app, spa, $offsetX="130")
    Rel(spa, backend_api, "Uses", "async, JSON/HTTPS")
    Rel(mobile_app, backend_api, "Uses", "async, JSON/HTTPS")
    Rel_Back(database, backend_api, "Reads from and writes to", "sync, JDBC")

    Rel(email_system, customer, "Sends e-mails to")
    UpdateRelStyle(email_system, customer, $offsetX="-45")
    Rel(backend_api, email_system, "Sends e-mails using", "sync, SMTP")
    UpdateRelStyle(backend_api, email_system, $offsetY="-60")
    Rel(backend_api, banking_system, "Uses", "sync/async, XML/HTTPS")
    UpdateRelStyle(backend_api, banking_system, $offsetY="-50", $offsetX="-140")

`;

describe('C4 container diagram', () => {
  it('draws the line into the Single-Page App with at most two bends and no line along a border', () => {
    const r = pixelRuler();
    const l = layout(c4Graph(parseC4(C4_CONTAINER), r), r);
    const find = (a: string, b: string) => l.edges.find((e) => e.from === a && e.to === b) ?? l.edges.find((e) => e.from === b && e.to === a);
    const ids = l.nodes.map((n) => n.id);
    const pick = (re: RegExp) => ids.find((id) => re.test(id)) as string;
    const [customer, spa] = [pick(/customer/i), pick(/single|spa/i)];
    expect(bends((find(customer, spa) as { points: Point[] }).points)).toBeLessThanOrEqual(2);
    // No line runs along a cluster border closer than 12 (a line may touch it only to cross).
    for (const c of l.clusters ?? []) {
      for (const e of l.edges) {
        for (const [p, q] of segs(e.points)) {
          const horizontal = p.y === q.y;
          const [lo, hi] = horizontal ? [Math.min(p.x, q.x), Math.max(p.x, q.x)] : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
          const sides = horizontal ? [[c.y, c.x, c.x + c.w], [c.y + c.h, c.x, c.x + c.w]] : [[c.x, c.y, c.y + c.h], [c.x + c.w, c.y, c.y + c.h]];
          for (const [at, a0, a1] of sides as Array<[number, number, number]>) {
            const d = Math.abs((horizontal ? p.y : p.x) - at);
            if (Math.min(hi, a1) - Math.max(lo, a0) > 1e-6) expect(d === 0 || d >= 12 - 1e-6, `${e.from}->${e.to} beside ${c.id}`).toBe(true);
          }
        }
      }
    }
  });
});
