// The Examples pages of one type, as Markdown with HTML blocks, for the dynamic routes examples/[type].md and
// ko/examples/[type].md. Reads what scripts/render-examples.mjs wrote; the pictures stay separate files that load lazily.
import { existsSync, readFileSync } from 'node:fs';
import { MERMAID_DOCS, TYPES } from './types.mjs';

const RENDERED = new URL('./rendered.json', import.meta.url);

export const EXAMPLE_STRINGS = {
  en: {
    lead: (n, link) =>
      `${n === 1 ? 'The example' : `All ${n} examples`} of the Mermaid documentation's ${link} page, each drawn by ursula as SVG and shown unedited. The Mermaid text is on the left, the picture on the right.`,
    jump: 'Jump to an example',
    failed: 'ursula could not draw this text:',
    all: 'All types',
    source: 'Mermaid text',
  },
  ko: {
    lead: (n, link) =>
      `Mermaid 문서 ${link} 페이지의 예시 ${n}개를 모두 ursula가 SVG로 그려 고치지 않고 실었습니다. 왼쪽이 Mermaid 글, 오른쪽이 그림입니다.`,
    jump: '예시로 건너뛰기',
    failed: 'ursula가 이 글을 그리지 못했습니다:',
    all: '모든 유형',
    source: 'Mermaid 글',
  },
};

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function readRendered() {
  if (!existsSync(RENDERED)) throw new Error('.vitepress/examples/rendered.json is missing. Run node scripts/prepare.mjs first.');
  return JSON.parse(readFileSync(RENDERED, 'utf8')).types;
}

function item(type, it, t) {
  const picture = it.error
    ? `<div class="ex-error" v-pre><strong>${escape(t.failed)}</strong><br>${escape(it.error)}</div>`
    : `<img src="${it.svg}" alt="${escape(`${type.en}: ${it.name}`)}" width="${it.width}" height="${it.height}" loading="lazy" decoding="async">`;
  const size = it.error ? '' : `<span class="ex-size">${it.width} × ${it.height}</span>`;
  // Blank lines around <pre> make it its own HTML block, so the blank lines inside the text stay inside it.
  return [
    `## ${it.name} {#${it.name}}`,
    '',
    `<div class="ex-item">`,
    `<div class="ex-code" aria-label="${escape(t.source)}">`,
    '',
    `<pre v-pre><code>${escape(it.src.replace(/\n+$/, ''))}</code></pre>`,
    '',
    `</div>`,
    `<div class="ex-pic${it.error ? ' ex-pic-error' : ''}">${size}<div class="ursula-frame">${picture}</div></div>`,
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
    const name = type[lang];
    const link = `[${type.doc}](${MERMAID_DOCS}${type.doc}.html)`;
    const content = [
      `# ${name}`,
      '',
      t.lead(items.length, link),
      '',
      `<ExampleJump label="${escape(t.jump)}" />`,
      '',
      ...items.map((it) => item(type, it, t)),
      `[← ${t.all}](${prefix}/examples/#types)`,
      '',
    ].join('\n');
    return { params: { type: type.id, title: name }, content };
  });
}
