// Examples adapted from the Mermaid documentation (MIT).
import { describe, expect, it } from 'vitest';
import { layout, render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';
import { cellRuler, pixelRuler } from '../src/metrics.ts';
import { blankFrontMatter } from '../src/registry.ts';
import { parseUsecase } from '../src/usecase/parse.ts';
import { faults, worse } from '../src/usecase/faults.ts';
import { emptySpec } from '../src/c4/grid-rows.ts';
import { geometryViolations } from './helpers.ts';
import type { Graph, Layout, Point } from '../src/types.ts';

const EXAMPLES: string[] = [
  `usecase-beta
direction LR
actor Customer("Customer")
systemBoundary "Order system"
  Checkout("Place order")
end
Customer --> Checkout`,
  `usecase-beta
direction LR
actor Customer
actor Support
systemBoundary Storefront
  Browse("Browse catalogue")
  Checkout("Checkout")
end
systemBoundary Fulfilment
  Track("Track delivery")
end
Customer --> Browse
Customer --> Checkout
Customer --> Track
Support --> Track
Checkout ..> : include Browse`,
  `---
config:
  theme: default
  look: classic
  layout: dagre
---
usecase-beta
direction LR
actor Customer
actor Support
systemBoundary Storefront
  Browse("Browse catalogue")
  Checkout("Checkout")
end
systemBoundary Fulfilment
  Track("Track delivery")
end
Customer --> Browse
Customer --> Checkout
Customer --> Track
Support --> Track
Checkout ..> : include Browse`,
  `usecase-beta
Customer --> Login
actor Customer
actor Admin("Main administrator")
Login("Sign in")
Report[Generate report]
"Reset password"
Admin --> Report`,
  `usecase-beta
actor Normal("Normal actor")
actor Hollow("Hollow actor")@{ type: hollow }
actor Awesome("Awesome actor")@{ type: awesome }
actor Icon("Registered icon")@{ icon: "fa:user" }
actor Fallback("Missing icon fallback")@{ icon: "not-registered:user" }
Normal --> Manage
Hollow --> Manage
Awesome --> Manage
Icon --> Manage
Fallback --> Manage`,
  `usecase-beta
actor SalesAgent("Sales agent")@{ business: true } <<Employee>>
actor Broker@{ type: hollow, business: true }
Quote("Prepare quote")@{ business: true } <<Core>>
Archive[Archive quote] <<Record>>
SalesAgent --> Quote
Broker --> Quote
Quote --> Archive`,
  `usecase-beta
actor Analyst(*Analyst*)
Literal(**Literal markers**)
Priced[Costs 19.95 EUR — VAT included!]
Analyst -- files R&D report --> Literal
Analyst --> Priced`,
  `usecase-beta
actor Reviewer("\`*Reviewer*\`")
Literal("**Literal markers**")
Formatted("\`**Formatted label**
with a physical line break\`")
Quoted("Show #quot;quoted#quot; text")
Reviewer -- "\`opens **form**\`" --> Formatted
Reviewer --> Literal
Reviewer --> Quoted`,
  `usecase-beta
%% Actors are declared explicitly.
actor User

%% Each relationship is a separate statement.
User --> Login
Login --> Dashboard`,
  `usecase-beta
systemBoundary sb1["Payment service"]@{ type: package }:::system
  actor Clerk("Payment clerk")
  Authorize("Authorize payment")
  Receipt[Create receipt]
end
Clerk --> Authorize
Authorize --> Receipt
classDef system stroke:#4b4b7a`,
  `usecase-beta
systemBoundary "Payment service"
  actor Clerk("Payment clerk")
  Authorize("Authorize payment")
end
Payment_service@{ type: package }
Clerk --> Authorize`,
  `usecase-beta
actor User
actor Support
Start
Finish
User --> Start
Start <-- Support
Start -- Finish
User --o Start
Start o-- Support
User --x Finish
Finish x-- Support`,
  `usecase-beta
actor User
Login
User -- "include account details" --> Login`,
  `usecase-beta
actor Admin
actor Person
Checkout
Payment
ApplyCoupon
Admin --|> Person
Checkout ..> : include Payment
ApplyCoupon ..> : extend Checkout
ApplyCoupon --|> Checkout`,
  `usecase-beta
actor Customer
Checkout
Payment
Customer opens@-- "starts checkout" ---> Checkout
Checkout payment@..> : include Payment
classDef emphasized stroke:#d33,stroke-width:3px
class opens,payment emphasized
style opens stroke:#06c,stroke-width:4px
opens@{ animation: fast }
payment@{ animate: false }`,
  `usecase-beta
note for Login "\`Requires an **active session**\`"
note for User "Starts the workflow"
actor User
Login("Sign in")
User --> Login`,
  `usecase-beta
Inspect("Inspect payload")
json Payload@{
  "2": "second in source",
  "1": "first after 2",
  "enabled": true,
  "count": 3,
  "missing": null,
  "colors": ["Red", "Green"],
  "address": { "city": "Oslo" },
  "items": [{ "name": "Book" }],
  "emptyObject": {},
  "emptyArray": []
}:::data
Inspect --> Payload
classDef data stroke:#3572a5
style Payload stroke-width:2px`,
  `usecase-beta
actor Customer:::external
Checkout("Checkout"):::critical
systemBoundary Account
  Profile[Edit profile]
end
json Session@{ "active": true }:::data
Customer --> Checkout
Checkout --> Profile
Profile --> Session
classDef default stroke:#7f8ea3
classDef external,critical stroke-width:3px
class Customer,Checkout external,critical
class Account,Session data
style Checkout stroke:#c33,stroke-width:4px
style Account stroke:#536878`,
  `---
config:
  theme: redux-color
---
usecase-beta
direction LR
actor Customer
systemBoundary Catalogue
  Browse("Browse catalogue")
end
systemBoundary Payment
  Checkout("Checkout")
end
Customer --> Browse
Browse --> Checkout
Checkout ..> : include Browse`,
  `---
config:
  theme: redux-color
  usecase:
    colorScheme: rotate
---
usecase-beta
direction LR
actor Customer
actor Auditor
Browse("Browse catalogue")
Checkout("Checkout")
Customer --> Browse
Browse --> Checkout
Auditor --> Checkout`,
  `---
config:
  usecase:
    actorFontSize: 16
    actorFontFamily: Arial
    actorFontWeight: bold
    usecaseFontSize: 14
    usecaseFontFamily: Georgia
    usecaseFontWeight: normal
    nodeSpacing: 60
    rankSpacing: 70
    diagramPadding: 24
    colorScheme: role
    useMaxWidth: false
---
usecase-beta
direction LR
actor Customer
Browse("Browse catalog")
Customer --> Browse`,
  `usecase-beta
accTitle: Account access use cases
accDescr {
  A customer signs in and can reset a password.
  The diagram names the actor, use cases, and associations.
}
actor Customer
SignIn("Sign in")
Reset("Reset password")
Customer --> SignIn
Customer --> Reset`,
  `usecase-beta
direction LR
accTitle: Online ordering use cases
accDescr {
  A customer places an order through the storefront.
  Staff review the order and inspect its data.
}
actor Customer("Customer")
actor Staff("Order staff")@{ type: hollow, business: true } <<Employee>>
systemBoundary ordering["Ordering System"]@{ type: package }:::system
  Browse("Browse products")
  Checkout("Checkout") <<Core>>:::critical
  Payment("Process payment")
  Review[Review order]
end
json OrderData@{
  "status": "pending",
  "items": [{ "name": "Book", "quantity": 1 }],
  "total": 29.95
}:::data
note for Checkout "\`Validates the **cart** before payment\`"
Customer starts@-- "places order" ---> Checkout
Customer --> Browse
Checkout pays@..> : include Payment
Staff --> Review
Review --> OrderData
classDef system stroke:#c8a02a,stroke-width:2px
classDef critical stroke:#c33,stroke-width:3px
classDef data stroke:#3572a5
starts@{ animation: fast }
style pays stroke:#6b46c1,stroke-width:2px`,
  `usecase-beta
actor Customer
Reset("\`Reset
password\`")
Refund("Refund #40;partial#41;")
Customer --> Reset
Customer --> Refund`
];

const NAMES = [
  '01-use-case-diagrams',
  '02-with-the-defaults',
  '03-the-previous-appearance',
  '04-actors-and-use-cases',
  '05-actor-variants',
  '06-business-elements-and-stereotypes',
  '07-labels',
  '08-labels-2',
  '09-lines-and-comments',
  '10-system-boundaries',
  '11-system-boundaries-2',
  '12-associations',
  '13-associations-2',
  '14-include-extend-and-generalization',
  '15-edge-ids-styles-animation-and-length',
  '16-notes',
  '17-json-tables',
  '18-styling',
  '19-colors',
  '20-per-element-colour-rotation',
  '21-configuration',
  '22-accessibility',
  '23-complete-example',
  '24-constructs-that-parse-but-mean-something-else'
];
const example = (n: number): string => EXAMPLES[n - 1] as string;

const read = (n: number) => parseUsecase(blankFrontMatter(example(n)));
const node = (m: ReturnType<typeof parseUsecase>, id: string) => m.graph.nodes.find((x) => x.id === id);
const edge = (m: ReturnType<typeof parseUsecase>, from: string, to: string) => m.graph.edges.find((e) => e.from === from && e.to === to);
const drawn = (src: string): Layout => (selectFrontEnd(src).json(src, 'svg', {}) as { layout: Layout }).layout;

describe('usecase: official examples', () => {
  it('has all 24 examples', () => {
    expect(EXAMPLES).toHaveLength(24);
    expect(NAMES).toHaveLength(24);
  });

  EXAMPLES.forEach((src, i) => {
    it(`draws ${NAMES[i]} in every theme`, () => {
      for (const theme of ['solid', 'outline', 'card'] as const) {
        const svg = render(src, { theme });
        expect(svg).toContain(`data-theme="${theme}"`);
        expect(svg.startsWith('<svg')).toBe(true);
      }
    });

    it(`draws ${NAMES[i]} as text`, () => {
      const r = renderText(src, 120);
      expect('error' in r ? r.error : '').toBe('');
    });

    it(`keeps boxes apart and labels off boxes in ${NAMES[i]}`, () => {
      const l = drawn(src);
      const bad = geometryViolations(l).filter((v) => /^(node|label)/.test(v));
      expect(bad).toEqual([]);
    });
  });
});

describe('usecase: reading', () => {
  it('reads identifiers, labels and shapes (example 4)', () => {
    const m = read(4);
    expect(node(m, 'Customer')?.shape).toBe('actor');
    expect(node(m, 'Admin')?.title).toBe('Main administrator');
    expect(node(m, 'Login')).toMatchObject({ shape: 'ellipse', title: 'Sign in' });
    expect(node(m, 'Report')).toMatchObject({ shape: 'rect', title: 'Generate report' });
    expect(node(m, 'Reset_password')).toMatchObject({ shape: 'ellipse', title: 'Reset password' });
    expect(m.graph.nodes.map((n) => n.id)).toEqual(['Customer', 'Login', 'Admin', 'Report', 'Reset_password']);
  });

  it('makes an undeclared endpoint a use case and never an actor (example 5)', () => {
    const m = read(5);
    expect(node(m, 'Manage')?.shape).toBe('ellipse');
    expect(m.meta.get('Hollow')).toMatchObject({ kind: 'actor', variant: 'hollow' });
    expect(m.meta.get('Awesome')).toMatchObject({ variant: 'awesome' });
    expect(m.meta.get('Icon')).toMatchObject({ variant: 'icon', icon: 'fa:user' });
  });

  it('reads business flags and stereotypes (example 6)', () => {
    const m = read(6);
    expect(m.meta.get('SalesAgent')).toMatchObject({ business: true, stereotype: 'Employee' });
    expect(m.meta.get('Broker')).toMatchObject({ variant: 'hollow', business: true });
    expect(node(m, 'Quote')).toMatchObject({ title: '«Core»', lines: ['Prepare quote'] });
    expect(node(m, 'Archive')).toMatchObject({ shape: 'rect', title: '«Record»', lines: ['Archive quote'] });
  });

  it('keeps unquoted and plain labels literal and unmarks Markdown strings (examples 7, 8)', () => {
    const a = read(7);
    expect(node(a, 'Analyst')?.title).toBe('*Analyst*');
    expect(node(a, 'Literal')?.title).toBe('**Literal markers**');
    expect(node(a, 'Priced')?.title).toBe('Costs 19.95 EUR — VAT included!');
    expect(edge(a, 'Analyst', 'Literal')?.label).toBe('files R&D report');
    const b = read(8);
    expect(node(b, 'Reviewer')?.title).toBe('Reviewer');
    expect(node(b, 'Literal')?.title).toBe('**Literal markers**');
    expect(node(b, 'Formatted')).toMatchObject({ title: 'Formatted label', lines: ['with a physical line break'] });
    expect(node(b, 'Quoted')?.title).toBe('Show "quoted" text');
    expect(edge(b, 'Reviewer', 'Formatted')?.label).toBe('opens form');
  });

  it('keeps a backslash and decodes entity codes (example 24)', () => {
    const m = read(24);
    expect(node(m, 'Reset')).toMatchObject({ title: 'Reset', lines: ['password'] });
    expect(node(m, 'Refund')?.title).toBe('Refund (partial)');
    expect(read(1).graph.nodes.map((n) => n.id)).toEqual(['Customer', 'Checkout']);
    const slash = parseUsecase('usecase-beta\nA("Line1\\nLine2")');
    expect(node(slash, 'A')?.title).toBe('Line1\\nLine2');
  });

  it('puts the contents of a boundary in a cluster (examples 2, 10, 11)', () => {
    const m = read(2);
    expect(m.graph.clusters?.map((c) => c.id)).toEqual(['Storefront', 'Fulfilment']);
    expect(node(m, 'Browse')?.cluster).toBe('Storefront');
    expect(node(m, 'Track')?.cluster).toBe('Fulfilment');
    expect(node(m, 'Customer')?.cluster).toBeUndefined();
    const p = read(10);
    expect(p.graph.clusters).toEqual([{ id: 'sb1', label: 'Payment service' }]);
    expect(node(p, 'Clerk')).toMatchObject({ shape: 'actor', cluster: 'sb1' });
    expect(p.packages.has('sb1')).toBe(true);
    const q = read(11);
    expect(q.graph.clusters).toEqual([{ id: 'Payment_service', label: 'Payment service' }]);
    expect(q.packages.has('Payment_service')).toBe(true);
  });

  it('reads the seven association marks (example 12)', () => {
    const m = read(12);
    expect(edge(m, 'User', 'Start')).toMatchObject({ end: 'arrow' });
    // `Start <-- Support` points at Start, so the line runs from Support.
    expect(edge(m, 'Support', 'Start')).toMatchObject({ end: 'arrow' });
    expect(edge(m, 'Start', 'Finish')).toMatchObject({ end: 'none' });
    expect(m.graph.edges.filter((e) => e.end === 'circle' || e.startEnd === 'circle')).toHaveLength(2);
    expect(m.graph.edges.filter((e) => e.end === 'cross' || e.startEnd === 'cross')).toHaveLength(2);
    expect(read(13).graph.edges[0]).toMatchObject({ label: 'include account details', style: 'normal', end: 'arrow' });
  });

  it('reads include, extend and generalization (example 14)', () => {
    const m = read(14);
    expect(edge(m, 'Admin', 'Person')).toMatchObject({ end: 'triangle-open', style: 'normal' });
    expect(edge(m, 'Checkout', 'Payment')).toMatchObject({ end: 'arrow-open', style: 'dotted', label: '«include»' });
    expect(edge(m, 'ApplyCoupon', 'Checkout')).toBeDefined();
    expect(m.graph.edges.filter((e) => e.label === '«extend»')).toHaveLength(1);
    expect(m.graph.edges.filter((e) => e.end === 'triangle-open')).toHaveLength(2);
  });

  it('reads edge ids, minimum length and ignored styling (example 15)', () => {
    const m = read(15);
    expect(edge(m, 'Customer', 'Checkout')).toMatchObject({ id: 'opens', label: 'starts checkout', minLength: 2 });
    expect(edge(m, 'Checkout', 'Payment')).toMatchObject({ id: 'payment', label: '«include»' });
    expect(m.graph.ignored).toEqual(expect.arrayContaining(['classDef', 'class', 'style']));
  });

  it('attaches a note to its target with a dotted line (example 16)', () => {
    const m = read(16);
    const note = m.graph.nodes.find((n) => n.shape === 'note');
    expect(note?.title).toBe('Requires an active session');
    expect(m.graph.edges.filter((e) => e.style === 'dotted' && e.end === 'none').map((e) => e.to).sort()).toEqual(['Login', 'User']);
    expect(m.graph.nodes.filter((n) => n.shape === 'note')).toHaveLength(2);
  });

  it('turns a JSON declaration into a table in source order (example 17)', () => {
    const m = read(17);
    const t = node(m, 'Payload');
    expect(t?.compartments?.[0]?.lines).toEqual(['Payload']);
    expect(t?.compartments?.[1]?.lines).toEqual([
      '2: second in source',
      '1: first after 2',
      'enabled: true',
      'count: 3',
      'missing: null',
      'colors[0]: Red',
      'colors[1]: Green',
      'address.city: Oslo',
      'items[0].name: Book',
      'emptyObject: {}',
      'emptyArray: []',
    ]);
  });

  it('reads direction, accessibility and every part of the complete example (examples 22, 23)', () => {
    const m = read(23);
    expect(m.graph.direction).toBe('LR');
    expect(m.accTitle).toBe('Online ordering use cases');
    expect(m.accDescr).toContain('Staff review the order');
    expect(m.meta.get('Staff')).toMatchObject({ variant: 'hollow', business: true, stereotype: 'Employee' });
    expect(node(m, 'Checkout')).toMatchObject({ title: '«Core»', lines: ['Checkout'], cluster: 'ordering' });
    expect(node(m, 'OrderData')?.compartments).toHaveLength(2);
    expect(read(22).accTitle).toBe('Account access use cases');
    const svg = render(example(22));
    expect(svg).toContain('<title>Account access use cases</title>');
    expect(svg).toContain('<desc>A customer signs in and can reset a password. The diagram names the actor, use cases, and associations.</desc>');
  });

  it('mirrors a right-to-left diagram', () => {
    const m = parseUsecase('usecase-beta\ndirection RL\nactor A\nA --> B');
    expect(m.graph.mirror).toBe('RL');
    expect(m.graph.direction).toBe('LR');
  });
});

describe('usecase: drawing', () => {
  const px = pixelRuler();

  it('draws actors as figures and use cases as ellipses', () => {
    const l = layout(read(2).graph, px, { legend: false });
    expect(l.nodes.find((n) => n.id === 'Customer')?.shape).toBe('actor');
    const browse = l.nodes.find((n) => n.id === 'Browse');
    expect(browse?.shape).toBe('ellipse');
    expect(browse?.h).toBe(48);
    // An ellipse is at least 48 wider than its widest text.
    expect(browse?.w).toBeGreaterThanOrEqual(px.textWidth('Browse catalogue', 'title') + 48 - 0.5);
  });

  it('draws a boundary box around its use cases', () => {
    const l = layout(read(2).graph, px, { legend: false });
    const box = l.clusters?.find((c) => c.id === 'Storefront');
    expect(box).toBeDefined();
    for (const id of ['Browse', 'Checkout']) {
      const n = l.nodes.find((x) => x.id === id);
      expect(n && box && n.x >= box.x && n.y >= box.y && n.x + n.w <= box.x + box.w && n.y + n.h <= box.y + box.h).toBe(true);
    }
    const outside = l.nodes.find((n) => n.id === 'Customer');
    expect(outside && box && outside.x + outside.w <= box.x).toBe(true);
  });

  it('writes the include label between the lines', () => {
    const svg = render(example(14));
    expect(svg).toContain('«include»');
    expect(svg).toContain('«extend»');
    expect(svg).toContain('stroke-dasharray');
  });

  it('marks a business use case and the variant of an actor in the drawing', () => {
    const svg = render(example(6));
    expect(svg).toContain('data-business="true"');
    expect(render(example(5))).toContain('data-variant="hollow"');
  });

  it('keeps every drawing inside its canvas and every table row visible', () => {
    const svg = render(example(17));
    for (const row of ['2: second in source', 'items[0].name: Book', 'emptyArray: []']) expect(svg).toContain(row);
    const l = drawn(example(23));
    for (const n of l.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w).toBeLessThanOrEqual(l.width);
      expect(n.y + n.h).toBeLessThanOrEqual(l.height);
    }
  });

  it('draws in a terminal cell grid', () => {
    const r = renderText(example(14), 100);
    expect('lines' in r).toBe(true);
    if ('lines' in r) expect(r.lines.join('\n')).toContain('«include»');
    expect(layout(read(14).graph, cellRuler(), { legend: false }).nodes).toHaveLength(5);
  });
});

describe('usecase: errors', () => {
  const lineOf = (src: string): number | undefined => {
    try {
      render(src);
    } catch (e) {
      if (e instanceof UrsulaError) return e.line;
    }
    return undefined;
  };

  it('reports an unknown relationship with its line', () => {
    expect(() => render('usecase-beta\nactor A\nA ==> B')).toThrow(UrsulaError);
    expect(lineOf('usecase-beta\nactor A\nA ==> B')).toBe(3);
  });

  it('reports include between an actor and a use case', () => {
    expect(lineOf('usecase-beta\nactor A\nB\nA ..> : include B')).toBe(4);
  });

  it('reports generalization between an actor and a use case', () => {
    expect(lineOf('usecase-beta\nactor A\nB\nA --|> B')).toBe(4);
  });

  it('reports a boundary that is not closed', () => {
    expect(() => render('usecase-beta\nsystemBoundary S\n  A')).toThrow(UrsulaError);
  });

  it('reports a relationship inside a boundary', () => {
    expect(lineOf('usecase-beta\nsystemBoundary S\n  A --> B\nend')).toBe(3);
  });

  it('reports invalid JSON in a table with its line', () => {
    expect(lineOf('usecase-beta\njson T@{ "a": }')).toBe(2);
  });

  it('reports a note for something that is not declared', () => {
    expect(lineOf('usecase-beta\nnote for Nope "x"')).toBe(2);
  });

  it('reports a source that is not a usecase diagram', () => {
    expect(() => parseUsecase('actor A')).toThrow(UrsulaError);
  });
});

describe('usecase actor column', () => {
  const drawn = (src: string): Layout => (selectFrontEnd(src).json(src, 'svg', {}) as { layout: Layout }).layout;
  const centre = (l: Layout, id: string): number => {
    const n = l.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`no node ${id}`);
    return n.x + n.w / 2;
  };

  it('keeps the actors in the first column when a line joins two use cases', () => {
    const l = drawn('usecase-beta\nactor Customer\nactor Auditor\nBrowse\nCheckout\nCustomer --> Browse\nAuditor --> Checkout\nBrowse --> Checkout');
    expect(centre(l, 'Customer')).toBe(centre(l, 'Auditor'));
    expect(centre(l, 'Browse')).toBe(centre(l, 'Checkout'));
    expect(centre(l, 'Customer')).toBeLessThan(centre(l, 'Browse'));
    expect(geometryViolations(l)).toEqual([]);
  });

  it('stands every actor to the left of what it is joined to, even where another drawing bends less', () => {
    const src = 'usecase-beta\nactor SalesAgent("Sales agent")@{ business: true } <<Employee>>\nactor Broker@{ type: hollow, business: true }\nQuote("Prepare quote")@{ business: true } <<Core>>\nArchive[Archive quote] <<Record>>\nSalesAgent --> Quote\nBroker --> Quote\nQuote --> Archive';
    const l = drawn(src);
    expect(centre(l, 'SalesAgent')).toBe(centre(l, 'Broker'));
    expect(centre(l, 'Broker')).toBeLessThan(centre(l, 'Quote'));
    expect(centre(l, 'Quote')).toBeLessThan(centre(l, 'Archive'));
    expect(geometryViolations(l)).toEqual([]);
  });

  it('keeps the actors in the first column of a drawing with boundaries, each boundary around its own use cases', () => {
    const src = 'usecase-beta\ndirection LR\nactor Customer\nactor Support\nsystemBoundary Storefront\n  Browse("Browse catalogue")\n  Checkout("Checkout")\nend\nsystemBoundary Fulfilment\n  Track("Track delivery")\nend\nCustomer --> Browse\nCustomer --> Checkout\nCustomer --> Track\nSupport --> Track\nCheckout ..> : include Browse';
    const l = drawn(src);
    expect(centre(l, 'Customer')).toBe(centre(l, 'Support'));
    expect(centre(l, 'Customer')).toBeLessThan(centre(l, 'Browse'));
    expect(centre(l, 'Browse')).toBe(centre(l, 'Track'));
    const box = (label: string) => l.clusters?.find((c) => c.label === label);
    const [a, b] = [box('Storefront'), box('Fulfilment')];
    if (!a || !b) throw new Error('no boundary');
    expect(a.y + a.h).toBeLessThanOrEqual(b.y);
    for (const id of ['Customer', 'Support']) expect(centre(l, id)).toBeLessThan(Math.min(a.x, b.x));
    // The lines of Customer share a trunk on purpose; no other line may share a run with them.
    expect(geometryViolations(l).filter((v) => /Support/.test(v))).toEqual([]);
  });

  const line = (l: Layout, from: string, to: string) => {
    const e = l.edges.find((x) => (x.from === from && x.to === to) || (x.from === to && x.to === from));
    if (!e) throw new Error(`no line ${from} ${to}`);
    return e.points;
  };
  const nameOf = (l: Layout, id: string) => {
    const n = l.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`no node ${id}`);
    const w = pixelRuler().textWidth(n.title, 'line');
    return { x: n.x + n.w / 2 - w / 2, y: n.y + n.h, w, h: 30 };
  };
  const overName = (l: Layout): string[] =>
    l.nodes
      .filter((n) => n.shape === 'actor')
      .flatMap((n) => {
        const r = nameOf(l, n.id);
        return l.edges.filter((e) => e.points.slice(1).some((q, i) => {
          const p = e.points[i] as { x: number; y: number };
          return Math.max(p.x, q.x) > r.x + 1 && Math.min(p.x, q.x) < r.x + r.w - 1 && Math.max(p.y, q.y) > r.y + 1 && Math.min(p.y, q.y) < r.y + r.h - 1;
        })).map((e) => `${e.from}-${e.to} over ${n.id}`);
      });

  it('stands an actor with no use case of its own level with the one it shares, its line straight beside the branch', () => {
    const src = 'usecase-beta\ndirection LR\nactor Customer\nactor Support\nsystemBoundary Storefront\n  Browse("Browse catalogue")\n  Checkout("Checkout")\nend\nsystemBoundary Fulfilment\n  Track("Track delivery")\nend\nCustomer --> Browse\nCustomer --> Checkout\nCustomer --> Track\nSupport --> Track\nCheckout ..> : include Browse';
    const l = drawn(src);
    const straight = line(l, 'Support', 'Track');
    expect(straight).toHaveLength(2);
    expect(line(l, 'Customer', 'Checkout')).toHaveLength(2);
    const branch = line(l, 'Customer', 'Track');
    expect(Math.abs((branch.at(-1)?.y ?? 0) - (straight[1]?.y ?? 0))).toBeGreaterThanOrEqual(12);
  });

  it('leaves an actor by a side and keeps every line off the names under the actors', () => {
    const many = drawn('usecase-beta\nactor Normal("Normal actor")\nactor Hollow("Hollow actor")\nactor Awesome("Awesome actor")\nNormal --> Manage\nHollow --> Manage\nAwesome --> Manage');
    expect(overName(many)).toEqual([]);
    for (const id of ['Hollow', 'Awesome']) expect(line(many, id, 'Manage')).toHaveLength(3);
    const marks = drawn('usecase-beta\nactor User\nactor Support\nStart\nFinish\nUser --> Start\nStart <-- Support\nStart -- Finish\nUser --o Start\nStart o-- Support\nUser --x Finish\nFinish x-- Support');
    expect(overName(marks)).toEqual([]);
    for (const e of marks.edges) for (const [id, p] of [[e.from, e.points[0]], [e.to, e.points.at(-1)]] as const) {
      const n = marks.nodes.find((x) => x.id === id);
      if (n?.shape === 'actor' && e.trunk === undefined) expect(p?.y).toBeGreaterThan(n.y);
    }
  });

  it('stands an actor whose lines do not fork level with one of its use cases, and one whose lines fork in their middle', () => {
    const marks = drawn('usecase-beta\nactor User\nStart\nFinish\nUser --o Start\nUser --x Finish');
    expect(line(marks, 'User', 'Start')).toHaveLength(2);
    const fork = drawn('usecase-beta\nactor User\nStart\nFinish\nUser --> Start\nUser --> Finish');
    const y = (id: string): number => { const n = fork.nodes.find((x) => x.id === id); return n ? n.y + n.h / 2 : NaN; };
    expect(y('User')).toBe((y('Start') + y('Finish')) / 2);
  });

  it('stands an actor level with the middle one of its use cases whatever the heights of the rows', () => {
    const l = drawn('usecase-beta\nactor A\nOne\nTwo\nBig[A box with a tag] <<Record>>\nFour\nFive\nA --> One\nA --> Two\nA --> Big\nA --> Four\nA --> Five');
    expect(line(l, 'A', 'Big')).toHaveLength(2);
  });

  it('leaves a drawing with a note or an actor inside a boundary to the layered engine', () => {
    const noted = drawn('usecase-beta\nnote for Login "Needs a session"\nactor User\nLogin("Sign in")\nUser --> Login');
    expect(noted.edges.reduce((sum, e) => sum + Math.max(0, e.points.length - 2), 0)).toBe(0);
  });

  // Pairs of runs of two lines side by side for more than 8 and closer than `gap`: one on the other counts, unless both are of one trunk.
  const sideBySide = (l: Layout, gap: number): string[] => {
    const runs = l.edges.map((e) => e.points.slice(1).map((q, i) => [e.points[i] as Point, q] as const));
    const out: string[] = [];
    runs.forEach((a, i) => runs.slice(i + 1).forEach((b, k) => {
      const [e, o] = [l.edges[i], l.edges[i + 1 + k]];
      if (e?.trunk !== undefined && e.trunk.id === o?.trunk?.id) return;
      for (const [p, q] of a) for (const [r, t] of b) for (const [at, along] of [[(v: Point) => v.y, (v: Point) => v.x], [(v: Point) => v.x, (v: Point) => v.y]] as const) {
        if (at(p) !== at(q) || at(r) !== at(t) || Math.abs(at(p) - at(r)) >= gap) continue;
        if (Math.min(Math.max(along(p), along(q)), Math.max(along(r), along(t))) - Math.max(Math.min(along(p), along(q)), Math.min(along(r), along(t))) > 8) out.push(`${e?.from}-${e?.to} beside ${o?.from}-${o?.to}`);
      }
    }));
    return out;
  };
  const middle = (l: Layout, id: string): number => {
    const n = l.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`no node ${id}`);
    return n.y + n.h / 2;
  };
  // Where the branch of a trunk ends on the use case `id`.
  const branchInto = (l: Layout, id: string): number | undefined => {
    const e = l.edges.find((x) => x.trunk !== undefined && (x.from === id || x.to === id));
    return (e?.from === id ? e.points[0] : e?.points.at(-1))?.y;
  };
  const count = (l: Layout): number[] => faults(l, (name) => pixelRuler().textWidth(name, 'line'));
  const MARKS = 'usecase-beta\nactor User\nactor Support\nStart\nFinish\nUser --> Start\nStart <-- Support\nStart -- Finish\nUser --o Start\nStart o-- Support\nUser --x Finish\nFinish x-- Support';
  const BOUNDARIES = 'usecase-beta\ndirection LR\nactor Customer\nactor Support\nsystemBoundary Storefront\n  Browse("Browse catalogue")\n  Checkout("Checkout")\nend\nsystemBoundary Fulfilment\n  Track("Track delivery")\nend\nCustomer --> Browse\nCustomer --> Checkout\nCustomer --> Track\nSupport --> Track\nCheckout ..> : include Browse';
  // Drawings found by trying inputs at random: one actor with four lines to two use cases, and three actors on two.
  const FOUR_LINES = 'usecase-beta\nactor A0("Al")\nU0("Use 0")\nU1("Use 1")\nA0 --> U1\nA0 -- U1\nA0 --x U0\nA0 --x U1';
  const THREE_ACTORS = 'usecase-beta\nactor A0("Al")\nactor A1("Bartholomew Q")\nactor A2("Cy")\nU0("Use 0")\nU1("Use 1")\nA0 --> U1\nA2 -- U0\nA1 --> U0\nA2 -- U1\nA2 --> U1';

  it('keeps two lines a line apart where they run side by side, and never one on the other', () => {
    for (const src of [MARKS, BOUNDARIES, THREE_ACTORS]) expect(sideBySide(drawn(src), 12)).toEqual([]);
  });

  it('ends a branch in the middle of its use case where the lines beside it keep their distance', () => {
    const l = drawn(MARKS);
    // Start: the branch from Support between the two straight lines of User, each a line apart from it.
    expect(branchInto(l, 'Start')).toBe(middle(l, 'Start'));
    const beside = [line(l, 'User', 'Start').at(-1)?.y, l.edges.filter((e) => e.from === 'User' && e.to === 'Start')[1]?.points.at(-1)?.y];
    for (const y of beside) expect(Math.abs((y ?? 0) - middle(l, 'Start'))).toBeGreaterThanOrEqual(12);
    // Finish: the line of User ends a mark's width off the middle, so the branch keeps the middle.
    expect(branchInto(l, 'Finish')).toBe(middle(l, 'Finish'));
    expect(Math.abs((line(l, 'User', 'Finish').at(-1)?.y ?? 0) - middle(l, 'Finish'))).toBeGreaterThanOrEqual(16);
  });

  it('moves a branch off the middle only for a straight line into it, to the side of its dot and within a third of the ellipse', () => {
    const l = drawn(BOUNDARIES);
    const track = l.nodes.find((n) => n.id === 'Track');
    if (!track) throw new Error('no Track');
    expect(line(l, 'Support', 'Track').map((p) => p.y)).toEqual([middle(l, 'Track'), middle(l, 'Track')]);
    // The dot of Customer stands above Track: the branch ends above the middle.
    expect(line(l, 'Customer', 'Track').at(-1)?.y).toBe(middle(l, 'Track') - 16);
    for (const src of [MARKS, BOUNDARIES, FOUR_LINES, THREE_ACTORS]) {
      const d = drawn(src);
      for (const e of d.edges.filter((x) => x.trunk !== undefined)) for (const [id, p] of [[e.from, e.points[0]], [e.to, e.points.at(-1)]] as const) {
        const n = d.nodes.find((x) => x.id === id);
        if (n?.shape === 'ellipse') expect(Math.abs((p?.y ?? 0) - (n.y + n.h / 2))).toBeLessThanOrEqual(n.h / 3);
      }
    }
  });

  it('leaves an actor by the side toward its use cases, a third line at the corner of the figure', () => {
    const l = drawn(MARKS);
    const user = l.nodes.find((n) => n.id === 'User');
    if (!user) throw new Error('no User');
    const starts = l.edges.filter((e) => e.from === 'User').map((e) => e.points[0] as Point);
    expect(starts.map((p) => p.x)).toEqual([user.x + user.w, user.x + user.w, user.x + user.w]);
    expect(starts.map((p) => p.y - user.y).sort((a, b) => a - b)).toEqual([12, 36, 48]);
    expect(count(l).slice(1, 7)).toEqual([2, 0, 0, 0, 0, 0]);
    expect(line(l, 'User', 'Start')).toHaveLength(2);
  });

  it('keeps the drawing with the actor in the middle where the other one bends or crosses more', () => {
    const l = drawn(FOUR_LINES);
    const actor = l.nodes.find((n) => n.id === 'A0');
    if (!actor) throw new Error('no actor');
    // No line leaves the actor by its left and goes round it.
    for (const e of l.edges) expect((e.points[1]?.x ?? 0) >= (e.points[0]?.x ?? 0)).toBe(true);
    const [turns, crossings] = count(l);
    expect(turns).toBeLessThanOrEqual(6);
    expect(crossings).toBe(0);
    expect(middle(l, 'A0')).toBe((middle(l, 'U0') + middle(l, 'U1')) / 2);
  });

  it('draws three actors on two use cases with no line over a name and none beside another', () => {
    const l = drawn(THREE_ACTORS);
    expect(overName(l)).toEqual([]);
    const [turns, crossings, near, touching, covered, named, away] = count(l);
    expect([near, touching, covered, named, away]).toEqual([0, 0, 0, 0, 0]);
    expect(turns).toBeLessThanOrEqual(6);
    expect(crossings).toBeLessThanOrEqual(1);
  });

  // Drawings found by trying inputs at random, where standing each actor beside a use case drew lines closer, marks on
  // each other or a line over a label. With each: the pairs of runs closer than a line apart, the pairs of lines drawn
  // so for a stretch, the pairs of marks on each other and the pieces over a label that the drawing with each actor in
  // the middle of its use cases has.
  const CLOSER: [string, number[]][] = [
    // Marks of two actors on one place of the ellipse.
    ['usecase-beta\nactor A0("Al")\nactor A1("Bartholomew Quincy III")\nactor A2("Cy")\nactor A3("Dee Dee")\nU0("Pay 0")\nA3 --> U0\nA0 -- U0\nU0 o-- A2\nA1 --> U0\nA0 --x U0\nU0 x-- A1\nA2 --> U0\nU0 x-- A3', [0, 0, 0, 0]],
    // Two arrowheads on one place under the ellipse.
    ['usecase-beta\nactor A0("User")\nactor A1("Back office clerk")\nU0\nU0 x-- A0\nA1 --> U0\nA1 --> U0\nU0 x-- A1\nU0 x-- A1\nU0 <-- A0', [0, 0, 0, 0]],
    // Upright lines into the bottom of a box closer than a line apart.
    ['usecase-beta\nactor A0("User")\nactor A1("Back office clerk")\nactor A2("Op")\nU0[Box 0]\nU0 -- A2\nU0 <-- A0\nU0 <-- A2\nA0 --> U0\nA2 --o U0\nA2 --> U0\nU0 x-- A1\nU0 o-- A0\nA2 --> U0', [0, 0, 1, 0]],
    // The same with three actors on the box.
    ['usecase-beta\nactor A0("User")\nactor A1("Back office clerk")\nactor A2("Op")\nU0[Box 0]\nU0 o-- A2\nA0 --x U0\nU0 <-- A2\nU0 <-- A1\nU0 -- A1\nA2 -- U0\nA0 --> U0\nA2 --> U0\nU0 o-- A0', [0, 0, 1, 0]],
    // One more pair of lines side by side into an ellipse.
    ['usecase-beta\nactor A0("User")\nactor A1("Back office clerk")\nactor A2("Op")\nU0\nU0 x-- A1\nA0 --x U0\nA1 --> U0\nU0 -- A1\nA2 -- U0\nA1 --x U0\nU0 o-- A1\nA2 --> U0', [6, 4, 3, 0]],
    // One more pair among six actors.
    ['usecase-beta\nactor A0("Al")\nactor A1("Bartholomew Quincy III")\nactor A2("Cy")\nactor A3("Dee Dee")\nactor A4("Operations manager")\nactor A5("X")\nU0("Review the monthly order report 0")\nU1("Pay 1")\nU1 -- A0\nA2 --> U0\nU1 <-- A5\nU1 o-- A0\nU0 x-- A0\nU1 x-- A0\nA5 --o U0\nA2 --x U0\nU1 <-- A0\nA4 --> U1\nA5 --> U0\nA1 --x U1\nU1 o-- A4\nA3 --> U0\nA1 -- U1\nA1 --o U1\nU0 -- A1\nU1 x-- A3\nU0 ..> : include U1', [12, 11, 13, 0]],
    // A line through the label of an include.
    ['usecase-beta\nactor A0("Al")\nactor A1("Bartholomew Quincy III")\nactor A2("Cy")\nsystemBoundary S["First"]\n  U0("Use 0")\nend\nsystemBoundary T["Second"]\n  U1("Use 1")\n  U2("Pay 2")\n  U3("Pay 3")\nend\nA0 -- "does it" --> U0\nA1 --x U3\nA1 -- U2\nA1 -- U3\nA2 --x U0\nA0 --o U2\nA1 --> U2\nU3 -- A0\nA1 --x U2\nU3 ..> : include U3\nU2 ..> : extend U1\nU1 --|> U2', [0, 0, 1, 0]],
    // A bend on the corner of a label.
    ['usecase-beta\nactor A0("Al")\nactor A1("Bartholomew Quincy III")\nactor A2("Cy")\nactor A3("Dee Dee")\nactor A4("Operations manager")\nactor A5("X")\nU0("Track parcel 0")\nU1("Track parcel 1")\nU2("Use 2")\nU3("Use 3")\nU4("Pay 4")\nU5("Track parcel 5")\nU6("Use 6")\nU7("Pay 7")\nU1 o-- A3\nA5 --> U6\nA2 --> U7\nA4 --x U1\nA1 --> U3\nA4 -- "does it" --> U2\nU1 <-- A4\nA2 -- U3\nA0 -- "does it" --> U1\nA5 --o U2\nU0 <-- A3\nU5 x-- A4\nA4 --x U3\nA0 -- "does it" --> U5\nU1 x-- A4\nU7 ..> : include U0\nU0 --> U7', [5, 5, 8, 0]],
    // The same inside a boundary.
    ['usecase-beta\nactor A0("Al")\nactor A1("Bartholomew Quincy III")\nactor A2("Cy")\nactor A3("Dee Dee")\nsystemBoundary S\n  U0("Use 0")\n  U1("Review the monthly order report 1")\nend\nA3 -- "does it" --> U1\nA3 -- U1\nA0 -- "does it" --> U0\nU0 o-- A3\nU1 <-- A1\nA2 --> U1\nA3 --> U0\nU1 o-- A3\nA3 --x U1\nA0 -- U0\nA0 --> U1\nU1 -- A0\nA0 --o U1', [0, 0, 9, 0]],
  ];

  it('keeps the drawing with the actor in the middle where the other one has lines closer, marks on each other or a line over a label', () => {
    for (const [src, most] of CLOSER) {
      const [, , near, , , , , beside, crowded, labelled] = count(drawn(src));
      [near, beside, crowded, labelled].forEach((n, i) => expect(n).toBeLessThanOrEqual(most[i] as number));
    }
  });

  it('counts what makes a drawing harder to read', () => {
    const node = (id: string, shape: 'actor' | 'ellipse', x: number, y: number, w: number, h: number) => ({ id, lane: '_', rank: 0, span: 1, row: 0, x, y, w, h, title: id, lines: [], shape });
    const edge = (from: string, to: string, points: Point[]) => ({ from, to, style: 'normal' as const, points });
    const l: Layout = {
      width: 400,
      height: 300,
      direction: 'LR',
      laneAxis: 'across',
      lanes: [],
      nodes: [node('A', 'actor', 100, 100, 24, 48), node('U', 'ellipse', 300, 100, 80, 48), node('V', 'ellipse', 300, 200, 80, 48)],
      edges: [
        // Straight; then out of the left of the figure, under it over its name and on; then a run 4 beside the first that crosses the second twice.
        edge('A', 'U', [{ x: 124, y: 124 }, { x: 300, y: 124 }]),
        edge('A', 'V', [{ x: 100, y: 124 }, { x: 80, y: 124 }, { x: 80, y: 160 }, { x: 200, y: 160 }, { x: 200, y: 224 }, { x: 300, y: 224 }]),
        edge('A', 'U', [{ x: 124, y: 128 }, { x: 150, y: 128 }, { x: 150, y: 180 }, { x: 294, y: 180 }, { x: 294, y: 128 }, { x: 300, y: 128 }]),
      ],
      diagnostics: [],
    };
    // Turns, crossings, runs closer than 12, runs at 6 or closer, runs one on the other, runs over a name, lines leaving away,
    // lines drawn side by side for more than 24, marks on each other, pieces over a label, area. The two lines into U end 4 apart.
    expect(faults(l, () => 40)).toEqual([8, 2, 1, 1, 0, 1, 1, 0, 1, 0, 400 * 300]);
    // A line 10 under the straight one for 68, to another use case, and its label on the straight one.
    const under = { ...edge('A', 'V', [{ x: 124, y: 134 }, { x: 200, y: 134 }, { x: 200, y: 224 }, { x: 300, y: 224 }]), label: { text: 'x', x: 220, y: 114, w: 40, h: 24 } };
    expect(faults({ ...l, edges: [l.edges[0] as Layout['edges'][number], under] }, () => 40)).toEqual([2, 0, 1, 0, 0, 0, 0, 1, 0, 1, 400 * 300]);
    expect(worse([1, 0, 0], [0, 5, 5])).toBe(true);
    expect(worse([1, 2, 3], [1, 2, 3])).toBe(false);
  });

  it('makes room for a straight line into a top face the same way', () => {
    const box = (id: string): Graph['nodes'][number] => ({ id, title: id, lines: [], shape: 'rect', lane: '_' });
    const arrow = (from: string, to: string, trunk: boolean): Graph['edges'][number] => ({ from, to, style: 'normal', ...(trunk ? { trunk: { end: 'from' as const, kind: 'k' } } : {}) });
    const graph: Graph = { direction: 'TD', lanes: [{ id: '_', label: '' }], nodes: ['Over', 'Top', 'Left', 'Right'].map(box), edges: [arrow('Top', 'Left', true), arrow('Top', 'Right', true), arrow('Over', 'Left', false)] };
    const cells = { Over: { r: 0, c: 0 }, Top: { r: 0, c: 1 }, Left: { r: 1, c: 0 }, Right: { r: 1, c: 2 } };
    const lay = (figureSides: boolean): Layout => layout({ ...graph, placer: 'c4-grid', grid: { ...emptySpec(graph), cells, ...(figureSides ? { figureSides } : {}) } }, pixelRuler(), { legend: false });
    const into = (l: Layout): { branch: number; straight: number; mid: number } => {
      const left = l.nodes.find((n) => n.id === 'Left');
      if (!left) throw new Error('no Left');
      return { branch: line(l, 'Top', 'Left').at(-1)?.x ?? NaN, straight: line(l, 'Over', 'Left').at(-1)?.x ?? NaN, mid: left.x + left.w / 2 };
    };
    const apart = into(lay(true));
    expect(apart.straight).toBe(apart.mid);
    expect(apart.branch).toBe(apart.mid + 16);
    const plain = into(lay(false));
    expect(plain.branch).toBe(plain.mid);
  });
});
