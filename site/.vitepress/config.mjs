import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

const repo = 'https://github.com/yjun1806/ursula-diagram';
const base = '/ursula-diagram/';

// On an English page, a visitor whose browser puts Korean first goes to the same page under /ko/, with the query and
// the hash (a playground link keeps its drawing). Once the visitor picks a language in the menu, this never runs again.
const languageRedirect = `(function () {
  try {
    var base = ${JSON.stringify(base)};
    var path = location.pathname;
    if (path === base.slice(0, -1)) path = base;
    if (path.indexOf(base) !== 0 || path.indexOf(base + 'ko/') === 0 || path === base + 'ko') return;
    try { if (localStorage.getItem('ursula-lang')) return; } catch (e) {}
    var first = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    if (!/^ko\\b/i.test(first)) return;
    location.replace(base + 'ko/' + path.slice(base.length) + location.search + location.hash);
  } catch (e) {}
})();`;

function sidebar(prefix, t) {
  return [
    {
      text: t.intro,
      items: [
        { text: t.why, link: `${prefix}/guide/why` },
        { text: t.compared, link: `${prefix}/guide/compared` },
        { text: t.quickStart, link: `${prefix}/guide/quick-start` },
      ],
    },
    {
      text: t.drawings,
      items: [
        { text: t.gallery, link: `${prefix}/gallery` },
        { text: t.larger, link: `${prefix}/guide/larger-drawing` },
        { text: t.terminal, link: `${prefix}/guide/terminal` },
      ],
    },
    {
      text: t.reference,
      items: [
        { text: t.formats, link: `${prefix}/guide/output-formats` },
        { text: t.library, link: `${prefix}/guide/library` },
        { text: t.colours, link: `${prefix}/guide/colours` },
        { text: t.skill, link: `${prefix}/guide/agent-skill` },
      ],
    },
    { text: t.playground, link: `${prefix}/playground` },
  ];
}

const en = {
  intro: 'Introduction', why: 'Why ursula', compared: 'Compared with other tools', quickStart: 'Quick start',
  drawings: 'Drawings', gallery: 'Gallery', larger: 'A larger drawing', terminal: 'In a terminal',
  reference: 'Reference', formats: 'Output formats', library: 'Library', colours: 'Colours', skill: 'Agent skill',
  playground: 'Playground', guide: 'Guide',
};
const ko = {
  intro: '소개', why: '왜 ursula인가', compared: '다른 도구와 비교', quickStart: '빠른 시작',
  drawings: '그림', gallery: '그림 모음', larger: '큰 그림', terminal: '터미널에서',
  reference: '참고', formats: '출력 형식', library: '라이브러리', colours: '색 바꾸기', skill: '에이전트 스킬',
  playground: '플레이그라운드', guide: '안내',
};

function nav(prefix, t) {
  return [
    { text: t.guide, link: `${prefix}/guide/why` },
    { text: t.gallery, link: `${prefix}/gallery` },
    { text: t.playground, link: `${prefix}/playground` },
    { text: 'npm', link: 'https://www.npmjs.com/package/ursula-diagram' },
  ];
}

export default defineConfig({
  title: 'ursula',
  base,
  cleanUrls: true,
  lastUpdated: false,
  head: [
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${base}icon-32.png` }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: `${base}icon-16.png` }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}icon-180.png` }],
    ['script', {}, languageRedirect],
  ],
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      description: 'Draws Mermaid text as SVG and as terminal text. No browser, no runtime dependencies.',
      themeConfig: {
        nav: nav('', en),
        sidebar: sidebar('', en),
        editLink: { pattern: `${repo}/edit/main/site/:path`, text: 'Edit this page on GitHub' },
        footer: { message: 'Released under the MIT License.' },
      },
    },
    ko: {
      label: '한국어',
      lang: 'ko-KR',
      link: '/ko/',
      description: 'Mermaid 글을 SVG와 터미널 글자 그림으로 그립니다. 브라우저도, 실행 의존성도 필요 없습니다.',
      themeConfig: {
        nav: nav('/ko', ko),
        sidebar: sidebar('/ko', ko),
        editLink: { pattern: `${repo}/edit/main/site/:path`, text: 'GitHub에서 이 페이지 고치기' },
        footer: { message: 'MIT 라이선스로 배포합니다.' },
        outline: { level: [2, 3], label: '이 페이지에서' },
        docFooter: { prev: '이전', next: '다음' },
        langMenuLabel: '언어 바꾸기',
        returnToTopLabel: '맨 위로',
        sidebarMenuLabel: '메뉴',
        darkModeSwitchLabel: '화면 모드',
        lightModeSwitchTitle: '밝은 화면으로',
        darkModeSwitchTitle: '어두운 화면으로',
        skipToContentLabel: '본문으로 건너뛰기',
        notFound: {
          title: '페이지를 찾을 수 없습니다',
          quote: '주소가 바뀌었거나 없는 페이지입니다.',
          linkLabel: '첫 화면으로 가기',
          linkText: '첫 화면으로',
        },
      },
    },
  },
  themeConfig: {
    logo: { src: '/icon-180.png', alt: '' },
    socialLinks: [{ icon: 'github', link: repo }],
    outline: [2, 3],
    search: {
      provider: 'local',
      options: {
        locales: {
          ko: {
            translations: {
              button: { buttonText: '검색', buttonAriaLabel: '검색' },
              modal: {
                displayDetails: '자세히 보기',
                resetButtonTitle: '검색어 지우기',
                backButtonTitle: '검색 닫기',
                noResultsText: '결과가 없습니다',
                footer: { selectText: '고르기', navigateText: '옮기기', closeText: '닫기' },
              },
            },
          },
        },
      },
    },
  },
  vite: {
    // The playground reads examples/*.mmd from the repository root.
    server: { fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
  },
});
