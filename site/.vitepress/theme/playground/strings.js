// The playground's own words, per language. The engine's error messages stay as the engine writes them.

export const STRINGS = {
  en: {
    example: 'Example',
    yourText: 'Your text',
    width: 'Width',
    widthTitle: 'Terminal columns, for the text outputs',
    copyLink: 'Copy link',
    copied: 'Link copied',
    copyMermaid: 'Copy Mermaid',
    copySvg: 'Copy SVG',
    copyImage: 'Copy as image',
    copyTextOut: 'Copy text',
    downloadSvg: 'Download .svg',
    downloadTxt: 'Download .txt',
    done: 'Copied',
    saved: 'Downloaded',
    failed: 'Could not copy',
    actions: 'Copy or download this output',
    fixFirst: 'Fix the error to copy the output.',
    input: 'Mermaid text',
    tabs: { svg: 'SVG', text: 'Terminal text', ascii: 'ASCII', 'text-svg': 'text-svg' },
    loading: 'Loading the engine…',
    engineMissing: 'The engine did not load.',
    engineFetch: 'The engine script could not be fetched.',
    noteBefore:
      'A text drawing keeps its columns only where every character is as wide as the engine counts it. A browser font often draws Korean, Chinese or Japanese characters and some arrowheads at another width; the ',
    noteAfter: ' tab draws the same drawing with fixed columns.',
  },
  ko: {
    example: '예시',
    yourText: '직접 쓴 글',
    width: '폭',
    widthTitle: '글자 그림의 터미널 칸 수',
    copyLink: '링크 복사',
    copied: '링크를 복사했습니다',
    copyMermaid: 'Mermaid 복사',
    copySvg: 'SVG 복사',
    copyImage: '이미지로 복사',
    copyTextOut: '글자 복사',
    downloadSvg: '.svg 내려받기',
    downloadTxt: '.txt 내려받기',
    done: '복사했습니다',
    saved: '내려받았습니다',
    failed: '복사하지 못했습니다',
    actions: '이 출력 복사·내려받기',
    fixFirst: '오류를 고쳐야 출력을 복사할 수 있습니다.',
    input: 'Mermaid 글',
    tabs: { svg: 'SVG', text: '글자 그림', ascii: 'ASCII', 'text-svg': 'text-svg' },
    loading: '엔진을 불러오는 중입니다…',
    engineMissing: '엔진을 불러오지 못했습니다.',
    engineFetch: '엔진 스크립트를 받지 못했습니다.',
    noteBefore:
      '글자 그림은 모든 글자가 엔진이 센 폭대로 그려질 때만 줄이 맞습니다. 브라우저 글꼴은 한글·한자·가나나 일부 화살촉을 다른 폭으로 그리는 경우가 많습니다. ',
    noteAfter: ' 탭은 같은 그림을 칸 위치에 고정해 그립니다.',
  },
};

/** 'ko' for a Korean page, 'en' otherwise. */
export function langOf(lang) {
  return /^ko\b/i.test(lang ?? '') ? 'ko' : 'en';
}
