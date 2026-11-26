// The Examples pages of one type, as Markdown with HTML blocks, for the dynamic routes examples/[type].md and
// ko/examples/[type].md. Reads what scripts/render-examples.mjs wrote; the pictures stay separate files that load lazily.
import { existsSync, readFileSync } from 'node:fs';
import { MERMAID_DOCS, TYPES } from './types.mjs';

const RENDERED = new URL('./rendered.json', import.meta.url);

export const EXAMPLE_STRINGS = {
  en: {
    lead: (n, link) =>
      `${n === 1 ? 'The example' : `All ${n} examples`} of the Mermaid documentation's ${link} page, each drawn by ursula and shown unedited. The Mermaid text is on the left. On the right is the SVG; the Terminal tab shows the terminal drawing at 80 columns.`,
    termNote: {
      table: 'In the terminal, ursula shows this type as a table, not a picture.',
      list: 'In the terminal, ursula shows this type as a list, not a picture.',
      rules: 'In the terminal, ursula shows this type as its grammar rules in text, not a picture.',
    },
    jump: 'Jump to an example',
    failed: 'ursula could not draw this text:',
    all: 'All types',
    source: 'Mermaid text',
    svg: 'SVG',
    term: 'Terminal',
    copyCode: 'Copy code',
    copyText: 'Copy text',
    enlarge: 'Enlarge picture',
    cells: (cols, rows) => `${cols} columns × ${rows} lines`,
  },
  ko: {
    lead: (n, link) =>
      `Mermaid 문서 ${link} 페이지의 예시 ${n}개를 모두 ursula가 그려 고치지 않고 실었습니다. 왼쪽이 Mermaid 글이고 오른쪽이 SVG 그림입니다. 터미널 탭을 누르면 80열 터미널 그림이 나옵니다.`,
    termNote: {
      table: '터미널에서는 ursula가 이 유형을 그림 대신 표로 보입니다.',
      list: '터미널에서는 ursula가 이 유형을 그림 대신 목록으로 보입니다.',
      rules: '터미널에서는 ursula가 이 유형을 그림 대신 문법 규칙 글로 보입니다.',
    },
    jump: '예시로 건너뛰기',
    failed: 'ursula가 이 글을 그리지 못했습니다:',
    all: '모든 유형',
    source: 'Mermaid 글',
    svg: 'SVG',
    term: '터미널',
    copyCode: '코드 복사',
    copyText: '글 복사',
    enlarge: '그림 크게 보기',
    cells: (cols, rows) => `${cols}열 × ${rows}줄`,
  },
};

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function readRendered() {
  if (!existsSync(RENDERED)) throw new Error('.vitepress/examples/rendered.json is missing. Run node scripts/prepare.mjs first.');
  return JSON.parse(readFileSync(RENDERED, 'utf8')).types;
}

const failure = (t, message) => `<div class="ex-error" v-pre><strong>${escape(t.failed)}</strong><br>${escape(message)}</div>`;

/** A picture that opens large when clicked (ExampleView.vue does the opening). */
const zoomable = (src, alt, width, height, t) =>
  `<button type="button" class="ex-zoom" aria-label="${escape(t.enlarge)}"><img src="${src}" alt="${escape(alt)}" width="${width}" height="${height}" loading="lazy" decoding="async"></button>`;

function item(type, it, t) {
  const alt = `${type.name}: ${it.name}`;
  const svg = it.error ? failure(t, it.error) : zoomable(it.svg, alt, it.width, it.height, t);
  const svgSize = it.error ? '' : `<span class="ex-size ex-only-svg">${it.width} × ${it.height}</span>`;
  // The terminal view: text-svg, whose every character sits on its own cell, so the columns hold in any font. The
  // copy button sits where VitePress puts it on a code block and copies the plain text from the .txt file.
  const term = it.termError
    ? `<div class="ex-view ex-only-term">${failure(t, it.termError)}</div>`
    : `<div class="ex-view ex-only-term language-text"><button type="button" class="copy ex-copy" title="${escape(t.copyText)}" aria-label="${escape(t.copyText)}" data-copy="${it.term}.txt"></button><div class="ursula-frame">${zoomable(`${it.term}.svg`, `${alt} (${t.term})`, it.termWidth, it.termHeight, t)}</div></div>`;
  const termSize = it.termError ? '' : `<span class="ex-size ex-only-term">${escape(t.cells(it.termCols, it.termRows))}</span>`;
  const tab = (view, label, on) =>
    `<button type="button" class="ex-tab" data-view="${view}" aria-pressed="${on}">${escape(label)}</button>`;
  // Blank lines around <pre> make it its own HTML block, so the blank lines inside the text stay inside it.
  // The copy button and the label before <pre> are what VitePress's own copy handler expects of a code block.
  return [
    `## ${it.name} {#${it.name}}`,
    '',
    `<div class="ex-item" data-view="svg">`,
    `<div class="ex-code" aria-label="${escape(t.source)}">`,
    `<div class="language-mermaid"><button title="${escape(t.copyCode)}" aria-label="${escape(t.copyCode)}" class="copy"></button><span class="lang">mermaid</span>`,
    '',
    `<pre v-pre><code>${escape(it.src.replace(/\n+$/, ''))}</code></pre>`,
    '',
    `</div>`,
    `</div>`,
    `<div class="ex-pic">`,
    `<div class="ex-bar"><span class="ex-tabs">${tab('svg', t.svg, true)}${tab('term', t.term, false)}</span>${svgSize}${termSize}</div>`,
    `<div class="ex-view ex-only-svg${it.error ? ' ex-pic-error' : ''}"><div class="ursula-frame">${svg}</div></div>`,
    term,
    `</div>`,
    `</div>`,
    '',
  ].join('\n');
}

/** The params and content of every type page in a language ('en' or 'ko'). */
export function examplePages(lang) {
  const t = EXAMPLE_STRINGS[lang];
  const rendered = readRendered();
  const prefix = lang === 'ko' ? '/ko' : '';
  return TYPES.map((type) => {
    const { items } = rendered.find((r) => r.id === type.id);
    const { name } = type;
    const link = `[${type.doc}](${MERMAID_DOCS}${type.doc}.html)`;
    const content = [
      `# ${name}`,
      '',
      t.lead(items.length, link),
      '',
      ...(type.term ? [t.termNote[type.term], ''] : []),
      `<div class="ex-toolbar">`,
      `<ExampleJump label="${escape(t.jump)}" />`,
      `<ExampleView />`,
      `</div>`,
      '',
      ...items.map((it) => item(type, it, t)),
      `[← ${t.all}](${prefix}/examples/#types)`,
      '',
    ].join('\n');
    return { params: { type: type.id, title: name }, content };
  });
}
