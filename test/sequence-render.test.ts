import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellRuler, cellWidth, layoutSequence, parseSequence, render, renderText, renderTextSpans, selectFrontEnd, spansToAnsi, UrsulaError } from '../src/index.ts';
import type { TextSpan } from '../src/index.ts';

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

/** The drawing without its style sheet, whose rules name every role. */
const body = (svg: string): string => svg.replace(/<style>[\s\S]*?<\/style>/, '');

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
    expect(svg).toContain('--ursula-ink');
    expect(svg).toContain('--ursula-edge-msg');
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
    expect(svg).toContain('data-frame="0"');
    expect(svg).toContain('data-kind="call"');
  });

  it('draws an actor as a figure, a participant as a box, and writes the frame tag in capitals', () => {
    const out = render('sequenceDiagram\nactor P\nparticipant S\nloop Retry\nP->>S: ping\nend');
    expect(out.match(/<rect class="ursula-box"/g)).toHaveLength(1);
    expect(out.match(/<circle class="ursula-edge ursula-edge--msg"[^>]*data-participant="P"/g)).toHaveLength(1);
    expect(out).toContain('<rect class="ursula-frame"');
    expect(out).toContain('<rect class="ursula-tag"');
    expect(out).toContain('class="ursula-tag-text ursula-middle"');
    expect(out).toContain('>LOOP</text>');
  });

  it('writes the theme on the root, the card shadow only in the card theme, and edge--msg on every message line', () => {
    const src = 'sequenceDiagram\nA->>B: a\nB-->>A: b';
    for (const theme of ['solid', 'outline', 'card'] as const) {
      const out = body(render(src, { theme, legend: false }));
      expect(out).toContain(`data-theme="${theme}"`);
      expect(out.includes('filter="url(#ursula-shadow)"')).toBe(theme === 'card');
      expect(out.match(/class="ursula-edge ursula-edge--msg ursula-edge--arrow/g)).toHaveLength(2);
    }
    expect(render(src)).toContain('data-theme="solid"');
  });

  it('draws the reply dashed and the ports that only the card theme shows', () => {
    const out = body(render('sequenceDiagram\nA->>B: a\nB-->>A: b', { theme: 'card', legend: false }));
    expect(out.match(/ursula-edge--pending/g)).toHaveLength(1);
    expect(out.match(/class="ursula-port ursula-port--msg"/g)).toHaveLength(2);
  });

  it('draws a rect block as a zone that sits under the lifelines', () => {
    const out = body(render('sequenceDiagram\nA->>B: a\nrect rgb(240, 240, 255)\nB->>A: b\nend\nA->>B: c'));
    // The zone itself and the backing of the label that lies inside it; the other labels sit on the page.
    expect(out.match(/class="ursula-zone"/g)).toHaveLength(2);
    expect(out.indexOf('class="ursula-zone"')).toBeLessThan(out.indexOf('class="ursula-lifeline"'));
    expect(out).not.toContain('rgb(');
  });

  it('takes the title of the front matter as the title unless a title is given', () => {
    const src = '---\ntitle: Head\n---\nsequenceDiagram\nA->>B: a';
    expect(render(src)).toContain('<title>Head</title>');
    expect(render(src, { title: 'Own' })).toContain('<title>Own</title>');
  });

  it('draws a head on call, reply and async lines, a cross on a failed one, and dashes the replies and async lines', () => {
    const all = body(render('sequenceDiagram\nA->>B: a\nA-->>B: b\nA->B: c\nA-xB: d\nA--)B: e', { legend: false }));
    expect(all.match(/marker-end="url\(#ursula-arrow-msg-end\)"/g)).toHaveLength(3);
    expect(all.match(/ursula-edge--pending/g)).toHaveLength(2);
    expect(all.match(/<path class="ursula-edge ursula-edge--msg" d="M[^"]*" data-message/g)).toHaveLength(2);
    expect(all.match(/<path class="ursula-edge ursula-edge--msg" d="M[^"]*"\/>/g)).toHaveLength(2);
    expect(render('sequenceDiagram\nA->B: c')).not.toContain('<marker');
  });

  it('writes the legend captions and lets the options rename or drop them', () => {
    const src = 'sequenceDiagram\nA->>B: a\nB-->>A: b';
    expect(render(src)).toContain('>Reply</text>');
    expect(render(src, { legend: { reply: 'Answer' } })).toContain('>Answer</text>');
    expect(render(src, { legend: false })).not.toContain('>Reply</text>');
    expect(render('sequenceDiagram\nA->>B: a')).not.toContain('>Call</text>');
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

const login = readFileSync(new URL('../examples/login-sequence.mmd', import.meta.url), 'utf8');

function lines(src: string, width = 100): string[] {
  return text(src, width).split('\n');
}

/** Terminal column of the first `ch` in `line`. */
function columnOf(line: string, ch: string): number {
  const at = line.indexOf(ch);
  return at < 0 ? -1 : cellWidth(line.slice(0, at));
}

function spans(src: string, width = 100): TextSpan[][] {
  const r = renderTextSpans(src, width);
  if ('error' in r) throw new Error(r.error);
  return r.lines;
}

describe('sequence svg stays as committed', () => {
  for (const name of ['login', 'checkout']) {
    it(`renders ${name}-sequence.mmd to the committed svg`, () => {
      const src = readFileSync(new URL(`../examples/${name}-sequence.mmd`, import.meta.url), 'utf8');
      const svg = readFileSync(new URL(`../examples/${name}-sequence.svg`, import.meta.url), 'utf8');
      expect(`${render(src)}\n`).toBe(svg);
    });
  }
});

describe('sequence text', () => {
  it('draws a small exchange', () => {
    expect(text(upload)).toMatchInlineSnapshot(`
      "┌───────┐       ┌─────────┐
      │ User  │       │ Storage │
      └───────┘       └─────────┘
          ├─ Upload file ─▶┆
          ┆◀┄┄┄┄ 완료 ┄┄┄┄┄┤

      ─▶ Call   ┄▶ Reply"
    `);
  });

  it('draws activations, a frame with a divider, a note and a self message', () => {
    expect(text(withFrame)).toMatchInlineSnapshot(`
      "┌───────┐    ┌─────────┐
      │ User  │    │ Server  │
      └───────┘    └─────────┘
          ├── Login ───▶┃
          ┆             ┃
         ┌┼ ALT [Valid] ┼┐
         │┆◀┄┄ Token ┄┄┄┃│
         ├┼ [Invalid] ┄┄┼┤
         │┆×─ Rejected ─┤│
         └┼─────────────┼┘
          ┆             ┆
          ┆    ▏Done    ┆
          ┆             ├──┐ Audit
          ┆             ┤◀─┘

      ─▶ Call   ┄▶ Reply   ┄× Failed"
    `);
  });

  it('draws a label inside its arrow on one row', () => {
    const out = lines('sequenceDiagram\nautonumber\nA->>B: Open page');
    const arrows = out.filter((l) => l.includes('▶'));
    expect(arrows).toHaveLength(1);
    expect(arrows[0]).toMatch(/├─+ 01 Open page ─+▶┆/);
    expect(out).toHaveLength(4);
  });

  it('puts an over-long label on its own row over lifelines that take no part', () => {
    const label = 'Place the order for the whole cart now';
    const out = lines(`sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nparticipant D\nA->>B: ${label}\nC->>D: Ok`, 60);
    const at = out.findIndex((l) => l.includes(label));
    expect(at).toBeGreaterThan(0);
    expect(out.filter((l) => l.includes('Place')).length).toBe(1);
    expect(out[at + 1]).toMatch(/^\s*├─+▶┆/);
    const header = out.findIndex((l) => l.includes('│ C │'));
    const columnC = columnOf(out[header] ?? '', 'C');
    expect(columnOf(out[at] ?? '', 'P')).toBeLessThan(columnC);
    expect(cellWidth(out[at] ?? '')).toBeGreaterThan(columnC);
  });

  it('wraps a label at word boundaries only when it cannot fit the width', () => {
    const label = 'Place the order for the whole cart now please';
    const out = lines(`sequenceDiagram\nA->>B: ${label}`, 30);
    expect(out.some((l) => l.includes(label))).toBe(false);
    expect(out.filter((l) => /Place|order|please/.test(l)).length).toBeGreaterThan(1);
    for (const l of out) expect(cellWidth(l)).toBeLessThanOrEqual(30);
  });

  it('spaces lifelines by what sits between them instead of one shared pitch', () => {
    const src = 'sequenceDiagram\nA->>B: x\nB->>C: a much longer label here\nC->>D: y';
    const adaptive = Math.max(...lines(src).map(cellWidth));
    const uniform = layoutSequence(parseSequence(src), cellRuler()).width;
    expect(adaptive).toBeLessThan(uniform);
    const out = lines(src);
    const row = out.find((l) => l.includes(' x '));
    const wide = out.find((l) => l.includes('a much longer label here'));
    expect(columnOf(row ?? '', '▶') - columnOf(row ?? '', '├')).toBeLessThan(columnOf(wide ?? '', '▶') - columnOf(wide ?? '', '├'));
  });

  it('places frame side bars one cell outside the lifelines they hold', () => {
    const out = lines('sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nloop R\nA->>B: ping the server now\nend');
    const row = out.find((l) => l.includes('ping')) ?? '';
    const tee = columnOf(row, '├');
    const head = columnOf(row, '▶');
    expect(columnOf(row, '│')).toBe(tee - 1);
    const rightBar = cellWidth(row.slice(0, row.lastIndexOf('│')));
    expect(rightBar).toBe(head + 2);
    const top = out.find((l) => l.includes('LOOP')) ?? '';
    expect(top.startsWith(`${' '.repeat(tee - 1)}┌┼ LOOP [R] `)).toBe(true);
    expect(columnOf(top, '┐')).toBe(head + 2);
  });

  it('leaves no blank row between messages and one blank row on each side of a frame', () => {
    const plain = lines('sequenceDiagram\nA->>B: one\nB-->>A: two\nA->>B: three');
    expect(plain.filter((l) => /^[┆┃\s]+$/.test(l))).toHaveLength(0);
    const out = lines(withFrame);
    const loginAt = out.findIndex((l) => l.includes('Login'));
    expect(out[loginAt + 1]).toMatch(/^[┆┃\s]+$/);
    expect(out[loginAt + 2]).toContain('ALT');
    const bottom = out.findIndex((l) => l.includes('└┼'));
    expect(out[bottom + 1]).toMatch(/^[┆┃\s]+$/);
    expect(out[bottom + 2]).toContain('Done');
  });

  it('draws a self message on two rows with its label to the right', () => {
    const out = lines('sequenceDiagram\nautonumber\nA->>A: Hash password');
    const at = out.findIndex((l) => l.includes('Hash password'));
    expect(out[at]).toMatch(/├──┐ 01 Hash password$/);
    expect(out[at + 1]).toMatch(/┤◀─┘$/);
  });

  it('writes a note on one line without a box, and boxes it only when it has to wrap', () => {
    const one = lines('sequenceDiagram\nA->>B: x\nNote right of A: Cached for 60 s');
    expect(one.some((l) => l.includes('▏Cached for 60 s'))).toBe(true);
    expect(one.some((l) => l.includes('┌') && l.includes('Cached'))).toBe(false);
    const wrapped = lines('sequenceDiagram\nA->>B: x\nNote right of A: Cached for sixty seconds and then looked up again', 40);
    expect(wrapped.some((l) => l.includes('▏'))).toBe(false);
    expect(wrapped.filter((l) => /^\s*[│┌└].*[│┐┘]$/.test(l) && !l.includes('LOOP')).length).toBeGreaterThan(2);
  });

  it('marks the active interval of a lifeline with a heavy bar', () => {
    const out = lines('sequenceDiagram\nA->>+B: Login\nB->>B: Check\nB-->>-A: Token');
    const row = out.find((l) => l.includes('Login')) ?? '';
    expect(row).toMatch(/├─.*▶┃/);
    const back = out.find((l) => l.includes('Token')) ?? '';
    expect(back).toMatch(/◀.*┃/);
    expect(out[out.length - 1]).not.toContain('┃');
  });

  it('wraps header labels onto two lines before it gives up the diagram', () => {
    const wide = lines(login, 71);
    const narrow = lines(login, 70);
    expect(wide.some((l) => l.includes('│ Web App │'))).toBe(true);
    expect(narrow.some((l) => l.includes('│ Web │'))).toBe(true);
    expect(narrow.some((l) => l.includes('│ App │'))).toBe(true);
    expect(narrow.join('\n')).toContain('Mail');
    expect(narrow.join('\n')).toContain('Service');
  });

  it('falls back to numbered arrows with a footnote list when labels cannot be drawn', () => {
    const src = 'sequenceDiagram\nparticipant A\nparticipant B\nA->>B: Request\nB->>B: Validate everything carefully\nB-->>A: Done';
    const out = lines(src, 20);
    expect(out.some((l) => /├─+ 01 ─+▶/.test(l))).toBe(true);
    expect(out).toContain('01 Request');
    expect(out).toContain('02 Validate');
    expect(out).toContain('03 Done');
    for (const l of out) expect(cellWidth(l)).toBeLessThanOrEqual(20);
    expect(out.some((l) => l.includes('Request') && l.includes('─'))).toBe(false);
  });

  it('returns an error when even the list form does not fit', () => {
    expect(renderText(upload, 10)).toHaveProperty('error');
    expect(renderTextSpans(upload, 10)).toHaveProperty('error');
  });

  it('counts wide characters as two cells and keeps every border aligned', () => {
    const src = 'sequenceDiagram\nautonumber\nactor U as 사용자\nparticipant S as 서버\nparticipant D as 데이터베이스\nU->>S: 로그인 요청을 보냅니다\nS->>D: 조회\nNote over S,D: 한국어 메모입니다\nalt 성공\nD-->>S: 결과\nelse 실패\nS--xU: 오류\nend';
    for (const width of [100, 60, 50]) {
      const out = lines(src, width);
      for (const l of out) expect(cellWidth(l)).toBeLessThanOrEqual(width);
      expect(out.some((l) => l.includes('로그인 요청을 보냅니다') || l.includes('로그인'))).toBe(true);
      const top = out[0] ?? '';
      const middle = out[1] ?? '';
      const bottom = out[2] ?? '';
      for (let at = top.indexOf('┌'); at >= 0; at = top.indexOf('┌', at + 1)) {
        const col = cellWidth(top.slice(0, at));
        const close = cellWidth(top.slice(0, top.indexOf('┐', at)));
        expect(columnOf(bottom.slice(top.slice(0, at).length), '└') + col).toBe(col);
        expect(cellWidth(bottom.slice(0, bottom.indexOf('┘', top.slice(0, at).length)))).toBe(close);
      }
      expect(cellWidth(middle.slice(0, middle.indexOf('│')))).toBe(columnOf(top, '┌'));
      expect(out.filter((l) => l.includes('ALT'))).toHaveLength(1);
      const alt = out.findIndex((l) => l.includes('ALT'));
      const end = out.findIndex((l, i) => i > alt && l.includes('└─'));
      for (let i = alt; i <= end; i++) {
        const row = out[i] ?? '';
        expect(cellWidth(row.trimEnd())).toBe(cellWidth(out[alt] ?? ''));
      }
    }
  });

  it('is deterministic', () => {
    expect(text(withFrame)).toBe(text(withFrame));
  });
});

describe('login example text', () => {
  it('stays compact and keeps every message on one arrow row at 100 columns', () => {
    const out = lines(login, 100);
    expect(out.length).toBeLessThanOrEqual(34);
    for (const l of out) expect(cellWidth(l)).toBeLessThanOrEqual(100);
    const joined = out.join('\n');
    for (const label of ['Open login page', 'Show form', 'Submit credentials', 'POST /login', 'Hash password', 'Find user by email', 'User record', 'Session token', 'Redirect to dashboard', 'Send lock notice', '423 Locked', '계정이 잠겼습니다', 'Refresh session']) {
      expect(out.filter((l) => l.includes(label))).toHaveLength(1);
      expect(joined).toContain(label);
    }
    expect(out.filter((l) => /^\s*│?\s*[├┤┃┆].*[▶◀▷×]/.test(l) || /[▶◀▷×]/.test(l)).length).toBeGreaterThanOrEqual(13);
  });

  it('touches both lifelines with every arrow', () => {
    for (const width of [120, 100, 72]) {
      for (const l of lines(login, width)) {
        if (!/[▶◀▷×]/.test(l) || l.includes('Call')) continue;
        expect(l).toMatch(/[├┤┃┆].*[▶◀▷×]|[▶◀▷×].*[┃┆┤├]/);
      }
    }
  });

  it('still renders at 72 columns', () => {
    const out = lines(login, 72);
    expect(out.length).toBeGreaterThan(10);
    for (const l of out) expect(cellWidth(l)).toBeLessThanOrEqual(72);
  });
});

describe('sequence text spans', () => {
  it('equals the plain lines when joined', () => {
    for (const [src, width] of [[login, 100], [login, 72], [withFrame, 80], [upload, 60]] as const) {
      const plain = lines(src, width);
      const toned = spans(src, width).map((l) => l.map((s) => s.text).join(''));
      expect(toned).toEqual(plain);
    }
  });

  const tonesOf = (line: TextSpan[]): string => line.map((s) => `${s.tone}:${s.text}`).join('|');

  it('tones names and numbers bold and lifelines, borders and replies dim', () => {
    const all = spans(login).flat();
    const toneOfText = (needle: string): string | undefined => all.find((s) => s.text.includes(needle))?.tone;
    expect(toneOfText('Web App')).toBe('bold');
    expect(toneOfText('사용자')).toBe('bold');
    expect(all.filter((s) => s.tone === 'bold' && /^\d\d$/.test(s.text)).length).toBe(13);
    expect(toneOfText('ALT')).toBe('bold');
    expect(all.find((s) => s.text.includes('Session token'))?.tone).toBe('dim');
    expect(all.find((s) => s.text.includes('Open login page'))?.tone).toBe('normal');
    expect(all.find((s) => s.text.includes('POST /login'))?.tone).toBe('normal');
    expect(all.find((s) => s.text.includes('┆'))?.tone).toBe('dim');
    expect(all.find((s) => s.text.includes('Password matches'))?.tone).toBe('normal');
    const legend = spans(login).at(-1) ?? [];
    expect(legend.every((s) => s.tone === 'dim')).toBe(true);
    const frameTop = spans(login).find((l) => l.some((s) => s.text === 'ALT')) ?? [];
    expect(tonesOf(frameTop)).toContain('dim:┌');
    expect(tonesOf(frameTop)).toContain('bold:ALT');
  });

  it('writes no escape codes and maps tones to ANSI only on request', () => {
    for (const l of spans(login)) for (const s of l) expect(s.text).not.toContain('\u001b');
    expect(spansToAnsi([{ text: 'a', tone: 'bold' }, { text: 'b', tone: 'dim' }, { text: 'c', tone: 'normal' }])).toBe(
      '\u001b[1ma\u001b[0m\u001b[2mb\u001b[0mc',
    );
  });

  it('gives flowcharts a single normal span per line', () => {
    const r = renderTextSpans('flowchart LR\nA --> B', 40);
    if ('error' in r) throw new Error(r.error);
    for (const l of r.lines) for (const s of l) expect(s.tone).toBe('normal');
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
