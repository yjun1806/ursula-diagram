import { describe, expect, it } from 'vitest';
import { cellWidth, render, renderText, selectFrontEnd, UrsulaError } from '../src/index.ts';

const upload = `sequenceDiagram
  participant U as User
  participant S as Storage
  U->>S: Upload file
  S-->>U: 완료`;

const withFrame = `sequenceDiagram
  participant U as User
  participant S as Server
  U->>+S: Login
  alt Valid
    S-->>-U: Token
  else Invalid
    S-xU: Rejected
  end
  Note over U,S: Done
  S->>S: Audit`;

function text(src: string, width = 100): string {
  const r = renderText(src, width);
  if ('error' in r) throw new Error(r.error);
  return r.lines.join('\n');
}

describe('sequence svg', () => {
  const svg = render(`${upload}\nNote right of S: stored\nloop Retry\nU->>S: ping\nend`);

  it('follows the shared svg conventions', () => {
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title>Sequence diagram: 2 participants, 3 messages</title>');
    expect(svg).toContain('prefers-color-scheme: dark');
    expect(svg).toContain('--ursula-line');
    expect(svg).not.toMatch(/#[0-9a-f]{3,6}"/i);
  });

  it('marks participants, messages, notes and frames with data attributes', () => {
    expect(svg).toContain('data-participant="U"');
    expect(svg).toContain('data-participant="S"');
    expect(svg).toContain('data-message="0"');
    expect(svg).toContain('data-message="2"');
    expect(svg).toContain('data-from="U" data-to="S"');
    expect(svg).toContain('data-note="0"');
    expect(svg).toContain('data-block="loop"');
  });

  it('draws arrowheads with markers and dashes for the dashed variants', () => {
    const all = render(
      'sequenceDiagram\nA->>B: a\nA-->>B: b\nA->B: c\nA-xB: d\nA--)B: e',
    );
    expect(all).toContain('id="ursula-arrow"');
    expect(all).toContain('id="ursula-arrow-open"');
    expect(all).toContain('id="ursula-arrow-cross"');
    expect(all.match(/marker-end="url\(#ursula-arrow-cross\)"/g)).toHaveLength(1);
    expect(all.match(/ursula-line ursula-line--dash"/g)).toHaveLength(2);
    expect(render('sequenceDiagram\nA->B: c')).not.toContain('<marker');
  });

  it('escapes text and honours the title option', () => {
    const out = render('sequenceDiagram\nA->>B: <b>&</b>', { title: 'My "flow"' });
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;b&gt;&amp;&lt;/b&gt;');
    expect(out).toContain('<title>My &quot;flow&quot;</title>');
  });

  it('wraps long labels to the requested width', () => {
    const src = `sequenceDiagram\nA->>B: ${'a long label '.repeat(8)}`;
    const wide = render(src);
    const narrow = render(src, { maxWidth: 360 });
    expect(Number(/viewBox="0 0 (\d+)/.exec(narrow)?.[1])).toBeLessThanOrEqual(360);
    expect(narrow.match(/data-message="0"/g)?.length ?? 0).toBeGreaterThan(wide.match(/data-message="0"/g)?.length ?? 0);
  });

  it('is deterministic', () => {
    expect(render(withFrame)).toBe(render(withFrame));
  });
});

describe('sequence text', () => {
  it('draws a small exchange', () => {
    expect(text(upload)).toMatchInlineSnapshot(`
      "
       ┌───────┐    ┌───────────┐
       │ User  │    │  Storage  │
       └───────┘    └───────────┘
           ┆  Upload file ┆
           ┆─────────────▶┆
           ┆     완료     ┆
           ┆◀┄┄┄┄┄┄┄┄┄┄┄┄┄┆
           ┆              ┆"
    `);
  });

  it('draws activations, a frame with a divider, a note and a self message', () => {
    expect(text(withFrame)).toMatchInlineSnapshot(`
      "
       ┌───────┐  ┌─────────┐
       │ User  │  │ Server  │
       └───────┘  └─────────┘
           ┆   Login   ┆
           ┆──────────▶┃
         ┌ alt [Valid] ──┐
         │ ┆   Token   ┃ │
         │ ┆◀┄┄┄┄┄┄┄┄┄┄┃ │
         ├ [Invalid] ┄┄┄┄┤
         │ ┆ Rejected  ┆ │
         │ ┆×──────────┆ │
         └───────────────┘
          ┌─────────────┐
          │    Done     │
          └─────────────┘
           ┆           ┆──┐ Audit
           ┆           ┆◀─┘
           ┆           ┆"
    `);
  });

  it('counts wide characters as two cells', () => {
    const lines = text('sequenceDiagram\nactor U as 사용자\nparticipant S as 서버\nU->>S: 로그인 요청').split('\n');
    expect(lines.some((l) => l.includes('로그인 요청'))).toBe(true);
    const border = lines[1] ?? '';
    expect(border.startsWith(' ┌')).toBe(true);
    for (const l of lines) expect(cellWidth(l)).toBeLessThanOrEqual(100);
    const header = lines[2] ?? '';
    expect(cellWidth(header.slice(0, header.indexOf('사용자')))).toBeGreaterThan(1);
  });

  it('fits six participants into 100 columns', () => {
    const six = `sequenceDiagram
  participant Web
  participant Gateway
  participant Auth
  participant Orders
  participant Stock
  participant Mail
  Web->>Gateway: Place the order for the cart
  Gateway->>Auth: Verify the session token
  Auth-->>Gateway: Valid
  Gateway->>Orders: Create order
  Orders->>Stock: Reserve the requested items
  Stock-->>Orders: Reserved
  Orders-)Mail: Send confirmation
  Orders-->>Web: 주문 완료`;
    const r = renderText(six, 100);
    if ('error' in r) throw new Error(r.error);
    expect(Math.max(...r.lines.map(cellWidth))).toBeLessThanOrEqual(100);
    expect(r.lines.join('\n')).toContain('주문 완료');
  });

  it('returns an error when even the narrowest drawing does not fit', () => {
    const r = renderText(upload, 10);
    expect(r).toHaveProperty('error');
  });

  it('is deterministic', () => {
    expect(text(withFrame)).toBe(text(withFrame));
  });
});

describe('dispatcher', () => {
  it('selects the front-end by the first meaningful line', () => {
    expect(selectFrontEnd('flowchart LR\nA-->B').name).toBe('flowchart');
    expect(selectFrontEnd('graph TD\nA-->B').name).toBe('flowchart');
    expect(selectFrontEnd('sequenceDiagram\nA->>B: x').name).toBe('sequence');
    expect(selectFrontEnd('%% note\n\n  sequenceDiagram\nA->>B: x').name).toBe('sequence');
  });

  it('sends the same entry points to both families', () => {
    expect(render('flowchart LR\nA --> B')).toContain('data-node="A"');
    expect(render('sequenceDiagram\nA->>B: x')).toContain('data-participant="A"');
    expect(text('flowchart LR\nA[Start] --> B[End]')).toContain('Start');
  });

  it('keeps the unsupported diagram error for other headers', () => {
    expect(renderText('classDiagram\nA <|-- B', 80)).toEqual({ error: "line 1: unsupported diagram type 'classDiagram'" });
    expect(() => render('stateDiagram\nA --> B')).toThrow(UrsulaError);
    expect(renderText('', 80)).toHaveProperty('error');
  });

  it('reports sequence parse errors with their line', () => {
    expect(renderText('sequenceDiagram\nA->>B: ok\nnope', 80)).toEqual({ error: "line 3: unsupported syntax 'nope'" });
    expect(() => render('sequenceDiagram\nend')).toThrow(/line 2/);
  });
});

describe('sequence speed', () => {
  const names = Array.from({ length: 12 }, (_, i) => `Service${i}`);
  const lines = ['sequenceDiagram', ...names.map((n) => `participant ${n}`)];
  for (let i = 0; i < 40; i++) {
    const a = names[i % 12];
    const b = names[(i * 5 + 3) % 12];
    lines.push(`${a}->>${b}: Request number ${i} with some payload`);
    if (i % 10 === 4) lines.push(`Note right of ${a}: checkpoint ${i}`);
  }
  const big = lines.join('\n');

  it('lays out and renders 12 participants and 40 messages in under 20 ms once warm', () => {
    for (let i = 0; i < 3; i++) {
      render(big);
      text(big, 400);
    }
    const t0 = performance.now();
    const svg = render(big);
    const svgMs = performance.now() - t0;
    const t1 = performance.now();
    text(big, 400);
    const textMs = performance.now() - t1;
    expect(svg).toContain('data-message="39"');
    expect(svgMs).toBeLessThan(20);
    expect(textMs).toBeLessThan(20);
  });
});
