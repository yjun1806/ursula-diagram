// One page's Markdown source as the plain Markdown an agent reads: build-time fences drawn as the site draws them,
// components written out by ./components.mjs, VitePress containers and Vue attributes dropped, HTML reduced to its
// text and pictures, and every site link made absolute.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { drawFence } from '../ursula-output.mjs';
import { componentMarkdown } from './components.mjs';

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const COMPONENT = /^\s*<([A-Z][A-Za-z]+)\b([^>]*?)\/>\s*$/;

/** Resolves `<!--@include: path-->` lines against the page's folder, as VitePress does. */
export function withIncludes(src, file) {
  return src.replace(/^<!--\s*@include:\s*(.+?)\s*-->$/gm, (_, path) => readFileSync(join(dirname(file), path), 'utf8'));
}

/** The props of a component tag: `name="x"` becomes { name: 'x' }, a bare `named` becomes { named: true }. */
function props(attrs) {
  return Object.fromEntries([...attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k, v ?? true]));
}

/** An HTML line reduced to Markdown: pictures as images, code and bold kept, every other tag dropped. */
function htmlLine(line, url) {
  return line
    .replace(/<img\b[^>]*>/g, (tag) => {
      const src = /\bsrc="([^"]*)"/.exec(tag)?.[1] ?? '';
      const alt = /\balt="([^"]*)"/.exec(tag)?.[1] ?? '';
      return `![${alt}](${url(src)})`;
    })
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, (_, href, text) => `[${text}](${url(href)})`)
    .replace(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/g, (_, n, text) => `${'#'.repeat(Number(n))} ${text}`)
    .replace(/<\/?code>/g, '`')
    .replace(/<\/?(b|strong)>/g, '**')
    .replace(/<summary>(.*?)<\/summary>/g, '**$1**')
    .replace(/<figcaption>(.*?)<\/figcaption>/g, '$1: ')
    .replace(/<\/?[a-z][^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Site links in Markdown text made absolute: `](/guide/why)` and `](./x)` stay links, now with the full URL. */
const absoluteLinks = (line, url) => line.replace(/\]\((\/[^)\s]*)\)/g, (_, href) => `](${url(href)})`);

/**
 * The agent's Markdown of one page body (front matter already removed). `url` makes a site path absolute; `where` names
 * the page in a failed drawing's error.
 */
export function agentMarkdown(body, { url, where }) {
  // <WebOnly> words (theme/web-only/WebOnly.vue) are for the web page: drop them, or write their `agent` text.
  const lines = body.replace(/<WebOnly(?:\s+agent="([^"]*)")?\s*>([\s\S]*?)<\/WebOnly>/g, (_, agent) => agent ?? '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = FENCE.exec(line);
    if (open) {
      const [, indent, marker, info] = open;
      const content = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const t = lines[j].trimStart();
        if (t.startsWith(marker) && t.slice(marker.length).trim() === '') break;
        content.push(lines[j].startsWith(indent) ? lines[j].slice(indent.length) : lines[j]);
      }
      i = j;
      const text = content.length ? `${content.join('\n')}\n` : '';
      const [kind] = info.trim().split(/\s+/);
      if (kind === 'examples-glance') {
        out.push('The pictures of every example are on the web page; the Mermaid text of each is on its type page, listed below.');
        continue;
      }
      const drawn = drawFence(info, text, where);
      // A code-group tab title, ```bash [every project], becomes a line above the block.
      const title = /\[([^\]]+)\]\s*$/.exec(info)?.[1];
      const lang = drawn ? drawn.lang || 'text' : info.replace(/\[[^\]]*\]\s*$/, '').replace(/\{[^}]*\}/g, '').trim();
      const code = (drawn ? `${drawn.text}\n` : text).replace(/\n+$/, '');
      if (title) out.push(`${indent}${title}:`, '');
      out.push(...[`${marker}${lang}`, ...code.split('\n'), marker].map((l) => (l === '' ? '' : indent + l)));
      continue;
    }
    // VitePress containers: ::: code-group and the closing ::: go; ::: tip Title keeps its title as a bold line.
    const container = /^\s*:::\s*(\S+)?\s*(.*)$/.exec(line);
    if (container) {
      if (container[2]) out.push(`**${container[2]}**`);
      continue;
    }
    const component = COMPONENT.exec(line);
    if (component) {
      const md = componentMarkdown(component[1], props(component[2]), url);
      if (md === undefined) throw new Error(`llms: ${where} uses <${component[1]}>, which .vitepress/llms/components.mjs cannot write as text`);
      if (md) out.push(md);
      continue;
    }
    // Heading attributes, ## Title {#id}, are VitePress's.
    let text = line.replace(/^(#{1,6} .*?)\s*\{#[^}]*\}\s*$/, '$1');
    // A line of HTML, or a line of text with inline tags and no code span that could hold a tag as text.
    if (/^\s*<\/?[a-z]/.test(text) || (/<\/?[a-z][^>]*>/.test(text) && !text.includes('`'))) {
      text = htmlLine(text, url);
      if (text.trim() === '') {
        if (out.length && out[out.length - 1] !== '') out.push('');
        continue;
      }
      text = text.replace(/^\s+/, '');
    }
    out.push(absoluteLinks(text, url));
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
