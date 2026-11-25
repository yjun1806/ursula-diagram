import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

const repo = 'https://github.com/yjun1806/ursula-diagram';

export default defineConfig({
  title: 'ursula',
  description: 'Draws Mermaid text as SVG and as terminal text. No browser, no runtime dependencies.',
  base: '/ursula-diagram/',
  lang: 'en',
  cleanUrls: true,
  lastUpdated: false,
  head: [['link', { rel: 'icon', type: 'image/png', href: '/ursula-diagram/assets/icon.png' }]],
  themeConfig: {
    logo: '/assets/icon.png',
    nav: [
      { text: 'Guide', link: '/guide/why' },
      { text: 'Gallery', link: '/gallery' },
      { text: 'Playground', link: '/playground' },
      { text: 'npm', link: 'https://www.npmjs.com/package/ursula-diagram' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Why', link: '/guide/why' },
          { text: 'Compared with other tools', link: '/guide/compared' },
          { text: 'Quick start', link: '/guide/quick-start' },
        ],
      },
      {
        text: 'Drawings',
        items: [
          { text: 'Gallery', link: '/gallery' },
          { text: 'A larger drawing', link: '/guide/larger-drawing' },
          { text: 'In a terminal', link: '/guide/terminal' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Output formats', link: '/guide/output-formats' },
          { text: 'Library', link: '/guide/library' },
          { text: 'Colours', link: '/guide/colours' },
          { text: 'Agent skill', link: '/guide/agent-skill' },
        ],
      },
      { text: 'Playground', link: '/playground' },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: { pattern: `${repo}/edit/main/site/:path`, text: 'Edit this page on GitHub' },
    footer: { message: 'Released under the MIT License.' },
    search: { provider: 'local' },
    outline: [2, 3],
  },
  vite: {
    // The playground reads examples/*.mmd from the repository root.
    server: { fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  },
});
