// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { layout, render, UrsulaError } from '../src/index.ts';
import { cellRuler, pixelRuler } from '../src/metrics.ts';
import { c4Graph } from '../src/c4/graph.ts';
import { parseC4 } from '../src/c4/parse.ts';
import { recordHeight, recordWidth } from '../src/layout/records.ts';
import { CLUSTER_NAME_INSET, CLUSTER_NAME_LINE, CLUSTER_NAME_ROW, CLUSTER_PAD } from '../src/layout/clusters.ts';
import { crossesInterior, segmentsOf } from './helpers.ts';

const EXAMPLES: string[] = [
  // 01-c4-diagrams
  `    C4Context
      title System Context diagram for Internet Banking System
      Enterprise_Boundary(b0, "BankBoundary0") {
        Person(customerA, "Banking Customer A", "A customer of the bank, with personal bank accounts.")
        Person(customerB, "Banking Customer B")
        Person_Ext(customerC, "Banking Customer C", "desc")

        Person(customerD, "Banking Customer D", "A customer of the bank, <br/> with personal bank accounts.")

        System(SystemAA, "Internet Banking System", "Allows customers to view information about their bank accounts, and make payments.")

        Enterprise_Boundary(b1, "BankBoundary") {

          SystemDb_Ext(SystemE, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")

          System_Boundary(b2, "BankBoundary2") {
            System(SystemA, "Banking System A")
            System(SystemB, "Banking System B", "A system of the bank, with personal bank accounts. next line.")
          }

          System_Ext(SystemC, "E-mail system", "The internal Microsoft Exchange e-mail system.")
          SystemDb(SystemD, "Banking System D Database", "A system of the bank, with personal bank accounts.")

          Boundary(b3, "BankBoundary3", "boundary") {
            SystemQueue(SystemF, "Banking System F Queue", "A system of the bank.")
            SystemQueue_Ext(SystemG, "Banking System G Queue", "A system of the bank, with personal bank accounts.")
          }
        }
      }

      BiRel(customerA, SystemAA, "Uses")
      BiRel(SystemAA, SystemE, "Uses")
      Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")
      Rel(SystemC, customerA, "Sends e-mails to")

      UpdateElementStyle(customerA, $fontColor="red", $bgColor="grey", $borderColor="red")
      UpdateRelStyle(customerA, SystemAA, $textColor="blue", $lineColor="blue", $offsetX="5")
      UpdateRelStyle(SystemAA, SystemE, $textColor="blue", $lineColor="blue", $offsetY="-10")
      UpdateRelStyle(SystemAA, SystemC, $textColor="blue", $lineColor="blue", $offsetY="-40", $offsetX="-50")
      UpdateRelStyle(SystemC, customerA, $textColor="red", $lineColor="red", $offsetX="-50", $offsetY="20")

      UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")`,
  // 02-c4-system-context-diagram
  `    C4Context
      title System Context diagram for Internet Banking System
      Enterprise_Boundary(b0, "BankBoundary0") {
        Person(customerA, "Banking Customer A", "A customer of the bank, with personal bank accounts.")
        Person(customerB, "Banking Customer B")
        Person_Ext(customerC, "Banking Customer C", "desc")

        Person(customerD, "Banking Customer D", "A customer of the bank, <br/> with personal bank accounts.")

        System(SystemAA, "Internet Banking System", "Allows customers to view information about their bank accounts, and make payments.")

        Enterprise_Boundary(b1, "BankBoundary") {

          SystemDb_Ext(SystemE, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")

          System_Boundary(b2, "BankBoundary2") {
            System(SystemA, "Banking System A")
            System(SystemB, "Banking System B", "A system of the bank, with personal bank accounts. next line.")
          }

          System_Ext(SystemC, "E-mail system", "The internal Microsoft Exchange e-mail system.")
          SystemDb(SystemD, "Banking System D Database", "A system of the bank, with personal bank accounts.")

          Boundary(b3, "BankBoundary3", "boundary") {
            SystemQueue(SystemF, "Banking System F Queue", "A system of the bank.")
            SystemQueue_Ext(SystemG, "Banking System G Queue", "A system of the bank, with personal bank accounts.")
          }
        }
      }

      BiRel(customerA, SystemAA, "Uses")
      BiRel(SystemAA, SystemE, "Uses")
      Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")
      Rel(SystemC, customerA, "Sends e-mails to")

      UpdateElementStyle(customerA, $fontColor="red", $bgColor="grey", $borderColor="red")
      UpdateRelStyle(customerA, SystemAA, $textColor="blue", $lineColor="blue", $offsetX="5")
      UpdateRelStyle(SystemAA, SystemE, $textColor="blue", $lineColor="blue", $offsetY="-10")
      UpdateRelStyle(SystemAA, SystemC, $textColor="blue", $lineColor="blue", $offsetY="-40", $offsetX="-50")
      UpdateRelStyle(SystemC, customerA, $textColor="red", $lineColor="red", $offsetX="-50", $offsetY="20")

      UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")`,
  // 03-c4-container-diagram
  `    C4Container
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
    UpdateRelStyle(backend_api, banking_system, $offsetY="-50", $offsetX="-140")`,
  // 04-c4-component-diagram
  `    C4Component
    title Component diagram for Internet Banking System - API Application

    Container(spa, "Single Page Application", "javascript and angular", "Provides all the internet banking functionality to customers via their web browser.")
    Container(ma, "Mobile App", "Xamarin", "Provides a limited subset to the internet banking functionality to customers via their mobile device.")
    ContainerDb(db, "Database", "Relational Database Schema", "Stores user registration information, hashed authentication credentials, access logs, etc.")
    System_Ext(mbs, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")

    Container_Boundary(api, "API Application") {
        Component(sign, "Sign In Controller", "MVC Rest Controller", "Allows users to sign in to the internet banking system")
        Component(accounts, "Accounts Summary Controller", "MVC Rest Controller", "Provides customers with a summary of their bank accounts")
        Component(security, "Security Component", "Spring Bean", "Provides functionality related to singing in, changing passwords, etc.")
        Component(mbsfacade, "Mainframe Banking System Facade", "Spring Bean", "A facade onto the mainframe banking system.")

        Rel(sign, security, "Uses")
        Rel(accounts, mbsfacade, "Uses")
        Rel(security, db, "Read & write to", "JDBC")
        Rel(mbsfacade, mbs, "Uses", "XML/HTTPS")
    }

    Rel_Back(spa, sign, "Uses", "JSON/HTTPS")
    Rel(spa, accounts, "Uses", "JSON/HTTPS")

    Rel(ma, sign, "Uses", "JSON/HTTPS")
    Rel(ma, accounts, "Uses", "JSON/HTTPS")

    UpdateRelStyle(spa, sign, $offsetY="-40")
    UpdateRelStyle(spa, accounts, $offsetX="40", $offsetY="40")

    UpdateRelStyle(ma, sign, $offsetX="-90", $offsetY="40")
    UpdateRelStyle(ma, accounts, $offsetY="-40")

        UpdateRelStyle(sign, security, $offsetX="-160", $offsetY="10")
        UpdateRelStyle(accounts, mbsfacade, $offsetX="140", $offsetY="10")
        UpdateRelStyle(security, db, $offsetY="-40")
        UpdateRelStyle(mbsfacade, mbs, $offsetY="-40")`,
  // 05-c4-dynamic-diagram
  `    C4Dynamic
    title Dynamic diagram for Internet Banking System - API Application

    ContainerDb(c4, "Database", "Relational Database Schema", "Stores user registration information, hashed authentication credentials, access logs, etc.")
    Container(c1, "Single-Page Application", "JavaScript and Angular", "Provides all of the Internet banking functionality to customers via their web browser.")
    Container_Boundary(b, "API Application") {
      Component(c3, "Security Component", "Spring Bean", "Provides functionality Related to signing in, changing passwords, etc.")
      Component(c2, "Sign In Controller", "Spring MVC Rest Controller", "Allows users to sign in to the Internet Banking System.")
    }
    Rel(c1, c2, "Submits credentials to", "JSON/HTTPS")
    Rel(c2, c3, "Calls isAuthenticated() on")
    Rel(c3, c4, "select * from users where username = ?", "JDBC")

    UpdateRelStyle(c1, c2, $textColor="red", $offsetY="-40")
    UpdateRelStyle(c2, c3, $textColor="red", $offsetX="-40", $offsetY="60")
    UpdateRelStyle(c3, c4, $textColor="red", $offsetY="-40", $offsetX="10")`,
  // 06-c4-deployment-diagram
  `    C4Deployment
    title Deployment Diagram for Internet Banking System - Live

    Deployment_Node(mob, "Customer's mobile device", "Apple IOS or Android"){
        Container(mobile, "Mobile App", "Xamarin", "Provides a limited subset of the Internet Banking functionality to customers via their mobile device.")
    }

    Deployment_Node(comp, "Customer's computer", "Microsoft Windows or Apple macOS"){
        Deployment_Node(browser, "Web Browser", "Google Chrome, Mozilla Firefox,<br/> Apple Safari or Microsoft Edge"){
            Container(spa, "Single Page Application", "JavaScript and Angular", "Provides all of the Internet Banking functionality to customers via their web browser.")
        }
    }

    Deployment_Node(plc, "Big Bank plc", "Big Bank plc data center"){
        Deployment_Node(dn, "bigbank-api*** x8", "Ubuntu 16.04 LTS"){
            Deployment_Node(apache, "Apache Tomcat", "Apache Tomcat 8.x"){
                Container(api, "API Application", "Java and Spring MVC", "Provides Internet Banking functionality via a JSON/HTTPS API.")
            }
        }
        Deployment_Node(bb2, "bigbank-web*** x4", "Ubuntu 16.04 LTS"){
            Deployment_Node(apache2, "Apache Tomcat", "Apache Tomcat 8.x"){
                Container(web, "Web Application", "Java and Spring MVC", "Delivers the static content and the Internet Banking single page application.")
            }
        }
        Deployment_Node(bigbankdb01, "bigbank-db01", "Ubuntu 16.04 LTS"){
            Deployment_Node(oracle, "Oracle - Primary", "Oracle 12c"){
                ContainerDb(db, "Database", "Relational Database Schema", "Stores user registration information, hashed authentication credentials, access logs, etc.")
            }
        }
        Deployment_Node(bigbankdb02, "bigbank-db02", "Ubuntu 16.04 LTS") {
            Deployment_Node(oracle2, "Oracle - Secondary", "Oracle 12c") {
                ContainerDb(db2, "Database", "Relational Database Schema", "Stores user registration information, hashed authentication credentials, access logs, etc.")
            }
        }
    }

    Rel(mobile, api, "Makes API calls to", "json/HTTPS")
    Rel(spa, api, "Makes API calls to", "json/HTTPS")
    Rel_U(web, spa, "Delivers to the customer's web browser")
    Rel(api, db, "Reads from and writes to", "JDBC")
    Rel(api, db2, "Reads from and writes to", "JDBC")
    Rel_R(db, db2, "Replicates data to")

    UpdateRelStyle(spa, api, $offsetY="-40")
    UpdateRelStyle(web, spa, $offsetY="-40")
    UpdateRelStyle(api, db, $offsetY="-20", $offsetX="5")
    UpdateRelStyle(api, db2, $offsetX="-40", $offsetY="-20")
    UpdateRelStyle(db, db2, $offsetY="-10")`,
];

describe('c4 examples', () => {
  it('has the six documented examples', () => expect(EXAMPLES).toHaveLength(6));
  EXAMPLES.forEach((src, i) => {
    it(`example ${i + 1} draws`, () => {
      expect(render(src)).toContain('data-theme="band"');
    });
  });
});

describe('c4 reading', () => {
  it('reads elements, boundaries and relations of the context example', () => {
    const m = parseC4(EXAMPLES[0] as string);
    expect(m.type).toBe('context');
    expect(m.title).toBe('System Context diagram for Internet Banking System');
    expect(m.elements).toHaveLength(12);
    expect(m.boundaries.map((b) => b.alias)).toEqual(['b0', 'b1', 'b2', 'b3']);
    expect(m.boundaries.find((b) => b.alias === 'b2')?.parent).toBe('b1');
    const e = m.elements.find((x) => x.alias === 'SystemE');
    expect(e).toMatchObject({ role: 'system', store: 'db', external: true, boundary: 'b1' });
    expect(m.rels.map((r) => [r.from, r.to, r.heads])).toEqual([
      ['customerA', 'SystemAA', 'both'],
      ['SystemAA', 'SystemE', 'both'],
      ['SystemAA', 'SystemC', 'end'],
      ['SystemC', 'customerA', 'end'],
    ]);
    expect(m.rels[2]?.tech).toBe('SMTP');
    expect(m.config).toEqual({ shapeInRow: 3, boundaryInRow: 1 });
    expect(m.ignored).not.toContain('UpdateLayoutConfig');
  });

  it('keeps the direction hints of relations and the places asked for without a line', () => {
    const m = parseC4('C4Context\n  System(a, "A")\n  System(b, "B")\n  System(c, "C")\n  Rel_U(a, b, "x")\n  Rel_Neighbor(b, c, "y")\n  BiRel_Left(a, c, "z")\n  Rel(c, a, "w")\n  Lay_D(a, c)');
    expect(m.rels.map((r) => r.hint)).toEqual(['up', 'right', 'left', undefined]);
    expect(m.lays).toEqual([{ from: 'a', to: 'c', hint: 'down', line: 9 }]);
    expect(m.ignored).toEqual([]);
    expect(m.config).toEqual({ shapeInRow: 4, boundaryInRow: 2 });
  });

  it('turns the hint and the first-written end with a line it lays out from the other end', () => {
    const g = c4Graph(parseC4('C4Context\n  Person(p, "P")\n  System(s, "S")\n  System(t, "T")\n  Rel_D(s, p, "x")\n  Rel_Back(s, t, "y")\n  BiRel(t, s, "z")'), pixelRuler());
    expect(g.placer).toBe('c4-grid');
    expect(g.edges.map((e) => [e.from, e.to])).toEqual([['p', 's'], ['t', 's'], ['t', 's']]);
    expect(g.grid?.hints).toEqual(['up', undefined, undefined]);
    expect(g.grid?.upper).toEqual([undefined, 'to', 'from']);
    expect(g.grid?.starts).toEqual(['p']);
    expect(g.grid?.order).toEqual(['p', 's', 't']);
  });

  it('reads technology and description of a container and the back relation', () => {
    const m = parseC4(EXAMPLES[2] as string);
    const api = m.elements.find((x) => x.alias === 'backend_api');
    expect(api).toMatchObject({ role: 'container', store: 'db', external: true, tech: 'Java, Docker Container' });
    const back = m.rels.find((r) => r.heads === 'start');
    expect(back).toMatchObject({ from: 'database', to: 'backend_api', tech: 'sync, JDBC' });
    expect(m.elements.find((x) => x.alias === 'customer')?.label).toBe('Customer');
  });

  it('reads deployment nodes as boundaries with their type', () => {
    const m = parseC4(EXAMPLES[5] as string);
    const node = m.boundaries.find((b) => b.alias === 'browser');
    expect(node).toMatchObject({ deployment: true, parent: 'comp' });
    expect(node?.kind).toContain('Google Chrome');
  });

  it('builds one face with no rules for each element: the kind in a pill, the name, then the description', () => {
    const g = c4Graph(parseC4(EXAMPLES[0] as string), pixelRuler());
    const node = g.nodes.find((n) => n.id === 'SystemE');
    expect(node?.compartments).toHaveLength(1);
    expect(node?.compartments?.[0]?.face).toBe(true);
    expect(node?.compartments?.[0]?.lines.slice(0, 2)).toEqual(['Database · external', 'Mainframe Banking System']);
    expect(node?.compartments?.[0]?.lineEmphasis?.slice(0, 3)).toEqual(['tag', 'title', 'body']);
    expect(g.clusters?.find((c) => c.id === 'b0')?.label).toBe('BankBoundary0 · Enterprise boundary');
  });

  it('writes the technology of a relation after an em space, without brackets, and every boundary as name and subtitle', () => {
    const g = c4Graph(parseC4(EXAMPLES[0] as string), pixelRuler());
    expect(g.edges.find((e) => e.label?.startsWith('Sends e-mails'))?.label).toBe('Sends e-mails\u2003SMTP');
    expect(g.clusters?.every((c) => c.subtitled === true)).toBe(true);
  });

  it('draws the kind on a head band, the technology of a relation in a span of its own and the type of a boundary under its name', () => {
    const svg = render(EXAMPLES[0] as string);
    expect(svg).toContain('class="ursula-head-band"');
    expect(svg).not.toContain('ursula-cell-pill');
    expect(svg).toContain('<tspan class="ursula-edge-label-tech" role="note">');
    expect(svg).toContain('ursula-zone-name ursula-zone-sub');
  });

  it('starts the title at the outermost boundary and sets a subtitle 18 under its name', () => {
    const svg = render(EXAMPLES[1] as string);
    const outer = /<g class="ursula-cluster" data-cluster="b0"><rect[^>]* x="([\d.]+)"/.exec(svg);
    expect(/<text class="ursula-title ursula-diagram-title" x="([\d.]+)"/.exec(svg)?.[1]).toBe(outer?.[1]);
    const ys = [...svg.matchAll(/data-cluster="b0">.*?<text class="ursula-zone-name" x="[\d.]+" y="([\d.]+)">.*?<text class="ursula-zone-name ursula-zone-sub" x="[\d.]+" y="([\d.]+)">/g)][0];
    expect(Number(ys?.[2]) - Number(ys?.[1])).toBe(18);
  });

  it('sets a boundary name in ink over a muted subtitle and a description muted under its name', () => {
    const svg = render(EXAMPLES[1] as string);
    expect(svg).toMatch(/\.ursula-zone-name\{fill:var\(--ursula-fg[^}]*font-size:13px\}/);
    expect(svg).toMatch(/\.ursula-zone-sub\{fill:var\(--ursula-muted[^}]*font-size:12px;font-weight:500;opacity:1\}/);
    expect(svg).toMatch(/\.ursula-cell-body\{fill:var\(--ursula-muted/);
  });

  it('sets the label of a line in the middle of the free gap it crosses, not of one cut short by a label moved later', () => {
    const l = layout(c4Graph(parseC4(EXAMPLES[1] as string), pixelRuler()), pixelRuler());
    const e = l.edges.find((x) => x.label?.text.startsWith('Sends e-mails '));
    const b1 = l.clusters?.find((c) => c.id === 'b1');
    const [first, corner] = [e?.points[0], e?.points[1]];
    expect(e && b1 && first && corner).toBeTruthy();
    const mid = (e?.label?.y ?? 0) + (e?.label?.h ?? 0) / 2;
    expect(mid).toBe(((corner?.y ?? 0) + (b1?.y ?? 0)) / 2);
  });

  it('draws a back relation along its arrow', () => {
    const g = c4Graph(parseC4(EXAMPLES[2] as string), pixelRuler());
    const e = g.edges.find((x) => x.label?.startsWith('Reads from'));
    expect(e).toMatchObject({ from: 'backend_api', to: 'database', end: 'arrow' });
  });
});

describe('c4 layout', () => {
  EXAMPLES.forEach((src, i) => {
    it(`example ${i + 1}: boxes stay inside the drawing, wrapped text fits 200px`, () => {
      const ruler = pixelRuler();
      const g = c4Graph(parseC4(src), ruler);
      for (const n of g.nodes) for (const c of n.compartments ?? []) c.lines.forEach((l, k) => { if (c.lineEmphasis?.[k] === 'body') expect(ruler.textWidth(l, 'line')).toBeLessThanOrEqual(200); });
      const laid = layout(g, ruler);
      for (const n of laid.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x + n.w).toBeLessThanOrEqual(laid.width);
        expect(n.y + n.h).toBeLessThanOrEqual(laid.height);
      }
      expect(laid.nodes).toHaveLength(g.nodes.length);
      expect(laid.edges).toHaveLength(g.edges.length);
    });
  });

  it('draws every example for a terminal', () => {
    for (const src of EXAMPLES) {
      const laid = layout(c4Graph(parseC4(src), cellRuler()), cellRuler());
      expect(laid.nodes.length).toBeGreaterThan(0);
    }
  });
});

describe('c4 shapes, boundaries and sizes', () => {
  const shapeOf = (src: string, id: string): string | undefined => c4Graph(parseC4(src), pixelRuler()).nodes.find((n) => n.id === id)?.shape;

  it('draws a database as a cylinder, a person as a rounded box, and a queue and a system as boxes', () => {
    const src = EXAMPLES[0] as string;
    expect(shapeOf(src, 'SystemE')).toBe('cylinder');
    expect(shapeOf(src, 'SystemD')).toBe('cylinder');
    expect(shapeOf(src, 'customerA')).toBe('round');
    expect(shapeOf(src, 'customerC')).toBe('round');
    expect(shapeOf(src, 'SystemF')).toBe('rect');
    expect(shapeOf(src, 'SystemAA')).toBe('rect');
    expect(shapeOf(EXAMPLES[2] as string, 'database')).toBe('cylinder');
    expect(shapeOf(EXAMPLES[3] as string, 'db')).toBe('cylinder');
  });

  it('writes the kind of an element in words, not the macro name', () => {
    const src = [
      'C4Container',
      'Person(p, "P")',
      'Person_Ext(pe, "PE")',
      'System(s, "S")',
      'System_Ext(se, "SE")',
      'SystemDb(sd, "SD")',
      'SystemQueue(sq, "SQ")',
      'Container_Boundary(cb, "CB") {',
      'Container(c, "C")',
      'ContainerDb_Ext(cde, "CDE")',
      'ContainerQueue(cq, "CQ")',
      'Component(k, "K")',
      'ComponentDb(kd, "KD")',
      '}',
      'System_Boundary(sb, "SB") {',
      '}',
      'Boundary(b, "B") {',
      '}',
      'Boundary(bt, "BT", "Team") {',
      '}',
    ].join('\n');
    const g = c4Graph(parseC4(src), pixelRuler());
    const tags = Object.fromEntries(g.nodes.map((n) => [n.id, n.compartments?.[0]?.lines[0]]));
    expect(tags).toEqual({
      p: 'Person',
      pe: 'Person · external',
      s: 'System',
      se: 'System · external',
      sd: 'Database',
      sq: 'Queue',
      c: 'Container',
      cde: 'Database · external',
      cq: 'Queue',
      k: 'Component',
      kd: 'Database',
    });
    expect(Object.fromEntries((g.clusters ?? []).map((c) => [c.id, c.label]))).toEqual({
      cb: 'CB · Container boundary',
      sb: 'SB · System boundary',
      b: 'B · Boundary',
      bt: 'BT · Team',
    });
  });

  it('marks every boundary and deployment node as a dashed zone', () => {
    for (const src of EXAMPLES) {
      const clusters = c4Graph(parseC4(src), pixelRuler()).clusters ?? [];
      for (const c of clusters) expect(c.style).toBe('dashed');
    }
  });

  it('draws a dashed zone with a fill a step deeper each level, and the boxes in it on the page face', () => {
    const svg = render(EXAMPLES[0] as string);
    expect(svg.match(/class="ursula-zone ursula-zone--dashed ursula-zone--tint-[a-z]+"/g)).toHaveLength(4);
    for (const t of ['outer', 'mid']) expect(svg).toMatch(new RegExp(`\\.ursula-zone--dashed\\.ursula-zone--tint-${t}\\{fill:var\\(`));
    expect(svg).toMatch(/\.ursula-zone--dashed\{fill:none;stroke:[^;]+;stroke-width:[\d.]+;stroke-dasharray:[\d. ]+;stroke-linecap:round\}/);
    expect(svg).not.toContain('class="ursula-node ursula-node--on-lane');
  });

  it('leaves the clusters of a flowchart as they were', () => {
    const svg = render('flowchart TD\n  subgraph one[One]\n    direction LR\n    a --> b\n  end');
    expect(svg).toContain('class="ursula-zone"');
    expect(svg).not.toContain('ursula-zone--dashed');
    expect(svg).toContain('class="ursula-node ursula-node--on-lane');
  });

  it('puts a person above the element that sends it something, with the arrow still pointing at the person', () => {
    const g = c4Graph(parseC4(EXAMPLES[2] as string), pixelRuler());
    const e = g.edges.find((x) => x.label === 'Sends e-mails to');
    expect(e).toMatchObject({ from: 'customer', to: 'email_system', startEnd: 'arrow', end: 'none' });
    const laid = layout(g, pixelRuler());
    const at = (id: string) => laid.nodes.find((n) => n.id === id) as { y: number; h: number };
    expect(at('customer').y + at('customer').h).toBeLessThanOrEqual(at('email_system').y);
  });

  it('keeps a relation between two persons as written', () => {
    const g = c4Graph(parseC4('C4Context\n  Person(a, "A")\n  Person(b, "B")\n  Rel(a, b, "Asks")'), pixelRuler());
    expect(g.edges[0]).toMatchObject({ from: 'a', to: 'b', end: 'arrow' });
  });

  EXAMPLES.forEach((src, i) => {
    it(`example ${i + 1}: every element asks for one box, at least as large as the largest element`, () => {
      const ruler = pixelRuler();
      const g = c4Graph(parseC4(src), ruler);
      const box = g.nodes[0]?.box as { w: number; h: number };
      for (const n of g.nodes) expect(n.box).toEqual(box);
      for (const n of g.nodes) {
        expect(box.w).toBeGreaterThanOrEqual(recordWidth(n.compartments ?? [], ruler));
        expect(box.h).toBeGreaterThanOrEqual(recordHeight(n.compartments ?? [], ruler));
      }
    });

    it(`example ${i + 1}: every element box is drawn with one height${i === 3 ? '' : ' and one width'}`, () => {
      const laid = layout(c4Graph(parseC4(src), pixelRuler()), pixelRuler());
      expect(new Set(laid.nodes.map((n) => n.h)).size).toBe(1);
      // Example 4: the layered engine widens the boxes beside the boundary to its shared width, which counts the boundary's name.
      if (i !== 3) expect(new Set(laid.nodes.map((n) => n.w)).size).toBe(1);
    });
  });
});

describe('c4 errors', () => {
  it('reports an unknown statement with its line', () => {
    const run = (): string => render('C4Context\n  Person(a, "A")\n  Frobnicate(a)');
    expect(run).toThrow(UrsulaError);
    try {
      run();
    } catch (e) {
      expect((e as UrsulaError).line).toBe(3);
    }
  });

  it('reports a relation to an undefined element with its line', () => {
    try {
      render('C4Context\n  Person(a, "A")\n  Rel(a, z, "x")');
      throw new Error('no error');
    } catch (e) {
      expect(e).toBeInstanceOf(UrsulaError);
      expect((e as UrsulaError).line).toBe(3);
    }
  });

  it('reports a boundary that is never closed', () => {
    expect(() => render('C4Context\n  Boundary(b, "B") {\n  Person(a, "A")')).toThrow(UrsulaError);
  });

  it('reads accTitle as the title of the drawing', () => {
    const svg = render('C4Context\n  accTitle: My C4\n  Person(a, "A")');
    expect(svg).toContain('<title>My C4</title>');
  });
});

describe('c4 boundaries without lines inside are grids', () => {
  const laid = layout(c4Graph(parseC4(EXAMPLES[1] as string), pixelRuler()), pixelRuler());
  const node = (id: string) => laid.nodes.find((n) => n.id === id) as (typeof laid.nodes)[number];
  const box = (id: string) => (laid.clusters ?? []).find((c) => c.id === id) as NonNullable<typeof laid.clusters>[number];

  it('puts the loose customers in the row of the connected one, and the two-way relations in one column', () => {
    const row = ['customerA', 'customerB', 'customerC', 'customerD'].map(node);
    for (const n of row) expect(n.y).toBe(row[0]?.y);
    expect(node('SystemAA').y).toBeGreaterThan(node('customerA').y);
    expect(node('SystemAA').x).toBe(node('customerA').x);
    expect(node('SystemE').x).toBe(node('SystemAA').x);
  });

  it('puts the plain node of a boundary under its first row and stacks its boundaries in the same columns beside it', () => {
    expect(node('SystemE').y).toBe(node('SystemC').y);
    expect(node('SystemD').y).toBeGreaterThan(node('SystemE').y);
    expect(box('b2').x).toBe(box('b3').x);
    expect(box('b2').w).toBe(box('b3').w);
    expect(box('b3').y).toBeGreaterThan(box('b2').y);
    expect(box('b2').x).toBeGreaterThan(Math.max(node('SystemC').x + node('SystemC').w, node('SystemE').x + node('SystemE').w));
  });

  it('puts the two systems of a boundary side by side', () => {
    expect(node('SystemA').y).toBe(node('SystemB').y);
    expect(node('SystemF').y).toBe(node('SystemG').y);
  });
});

describe('c4 boundaries keep their size and lines keep off their names', () => {
  const ruler = pixelRuler();
  const laid = layout(c4Graph(parseC4(EXAMPLES[1] as string), ruler), ruler);
  const node = (id: string) => laid.nodes.find((n) => n.id === id) as (typeof laid.nodes)[number];
  const box = (id: string) => (laid.clusters ?? []).find((c) => c.id === id) as NonNullable<typeof laid.clusters>[number];

  it('does not stretch a boundary for the line ends on its sides', () => {
    const inside = [...laid.nodes.filter((n) => ['SystemE', 'SystemC', 'SystemD'].includes(n.id)), box('b2'), box('b3')];
    const top = Math.min(...inside.map((r) => r.y));
    const bottom = Math.max(...inside.map((r) => r.y + r.h));
    expect(box('b1').h).toBeLessThanOrEqual(bottom - top + 2 * CLUSTER_PAD + CLUSTER_NAME_ROW + CLUSTER_NAME_LINE);
  });

  it('keeps every line off the name of every boundary, which stands in a gap of the top row', () => {
    for (const c of laid.clusters ?? []) {
      const name = c.name as NonNullable<typeof c.name>;
      expect(name.knockout, c.id).toBeFalsy();
      expect(name.lines.join(' \u00b7 ')).toBe(c.label);
      for (const e of laid.edges) for (const s of segmentsOf(e)) expect(crossesInterior(s, name), `${e.from} -> ${e.to} through the name of ${c.id}`).toBe(false);
    }
  });

  it('puts the name of BankBoundary right of the lines that cross its top row when it has no room at the left', () => {
    const c = box('b1');
    const name = c.name as NonNullable<typeof c.name>;
    expect(name.x).toBeGreaterThanOrEqual(c.x + CLUSTER_NAME_INSET);
    expect(name.y).toBe(c.y + 12);
  });

  it('lets a line leave a node inside a boundary on the side that faces the node outside', () => {
    // The e-mail system is below and to the right of the customer: its line goes up first.
    const e = laid.edges.find((v) => [v.from, v.to].sort().join() === ['SystemC', 'customerA'].sort().join()) as (typeof laid.edges)[number];
    const points = e.from === 'SystemC' ? e.points : [...e.points].reverse();
    const [start, next] = points as [{ x: number; y: number }, { x: number; y: number }];
    expect(start.y).toBeCloseTo(node('SystemC').y, 4);
    expect(next.y).toBeLessThan(start.y);
  });
});

describe('c4 boundary names in a narrow boundary', () => {
  const ruler = pixelRuler();
  const laid = layout(c4Graph(parseC4(EXAMPLES[5] as string), ruler), ruler);
  const rect = (c: NonNullable<typeof laid.clusters>[number]) => c.name as NonNullable<typeof c.name>;

  it('writes a name that does not fit on one line as the name and its type on two, and makes the row one line taller', () => {
    const two = (laid.clusters ?? []).filter((c) => rect(c).lines.length === 2);
    expect(two.length).toBeGreaterThan(0);
    for (const c of two) {
      expect(rect(c).lines.join(' \u00b7 ')).toBe(c.label);
      expect(rect(c).h).toBe(2 * CLUSTER_NAME_LINE);
      const inside = [...laid.nodes.filter((n) => n.cluster === c.id)];
      for (const n of inside) expect(n.y).toBeGreaterThanOrEqual(c.y + CLUSTER_NAME_ROW + CLUSTER_NAME_LINE);
    }
  });

  it('draws a name over a knockout only where a line has to pass behind it, and nowhere else crosses a name', () => {
    for (const c of laid.clusters ?? []) {
      const name = rect(c);
      const hits = laid.edges.flatMap((e) => segmentsOf(e)).filter((s) => crossesInterior(s, name)).length;
      if (name.knockout) expect(hits, c.id).toBeGreaterThan(0);
      else expect(hits, c.id).toBe(0);
    }
  });

  it('writes the knockout name into the svg after the lines', () => {
    const svg = render(EXAMPLES[5] as string);
    const knocked = (laid.clusters ?? []).filter((c) => rect(c).knockout);
    if (knocked.length > 0) expect(svg.indexOf('ursula-zone-knock')).toBeGreaterThan(svg.indexOf('ursula-edge'));
  });
});
