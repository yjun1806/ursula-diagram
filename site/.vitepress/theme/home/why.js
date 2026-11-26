// The table under the hero. Measured on 26 November 2026, Apple M2 Max, headless Chrome 158:
// - bundle: `gzip -9c <file> | wc -c` of dist/ursula.global.js (330,071 B; raw 895,602 B) and of
//   mermaid@12.3.0/dist/mermaid.min.js from jsDelivr (1,580,028 B; raw 5,537,838 B).
// - dependencies: package.json `dependencies` (0) and `npm view mermaid@12.3.0 dependencies` (22).
// - render time: the 116 flowchart examples in site/examples/official/flowchart, ursula.render and mermaid.render in
//   the same page, one warm-up pass each, then one timed pass; median and 10th–90th percentile per drawing.
// `npm run bench:browser` reruns the render-time and bundle-size measurement (bench/browser/).

export const WHY = {
  en: {
    title: 'Why ursula-diagram?',
    lead:
      'No runtime dependencies, about 5× smaller than Mermaid.js in the browser, about 29× faster per flowchart, drawings in the terminal too, and errors that tell your agent how to fix them.',
    what: 'What is compared',
    rows: [
      ['Browser bundle, gzip', '330 kB', '1.58 MB'],
      ['Runtime dependencies', '0', '22'],
      ['Time per flowchart, median (10th–90th percentile)', '0.7 ms (0.4–2.4 ms)', '20.6 ms (18.9–27.2 ms)'],
      ['Runs without a browser', 'Yes, on Node alone', 'No, needs a DOM'],
      ['Terminal drawing', 'Yes', 'No'],
      ['For agents', 'Errors that tell your agent how to fix them, syntax, --check, MCP', 'None built in'],
    ],
    caption:
      'Measured on 26 November 2026 on an Apple M2 Max in headless Chrome 158: the 116 flowchart examples of the Mermaid documentation, drawn as SVG by both in the same page after one warm-up pass. Bundle sizes are gzip -9 of ursula.global.js and of mermaid.min.js.',
    strip: 'Same input, both drawings',
    stripNote:
      'The three of those 116 flowcharts with the most lines (7, 6 and 5; a tie goes to the lower file number, and 08 is left out because it repeats 07). ursula\'s drawings come from this site\'s engine; Mermaid\'s from Mermaid.js 12.3.0 in the page the times were measured in. Click a picture to enlarge it; the name links to the text.',
  },
  ko: {
    title: '왜 ursula-diagram인가',
    lead:
      '실행 의존성이 없습니다. 브라우저용 파일은 Mermaid.js보다 약 5배 작고, flowchart 한 장을 약 29배 빨리 그립니다. 터미널에도 그리고, 오류는 에이전트에게 고치는 법까지 알려 줍니다.',
    what: '비교 항목',
    rows: [
      ['브라우저용 파일, gzip', '330kB', '1.58MB'],
      ['실행 의존성', '0개', '22개'],
      ['flowchart 한 장에 드는 시간, 중앙값(10~90번째 백분위)', '0.7ms(0.4~2.4ms)', '20.6ms(18.9~27.2ms)'],
      ['브라우저 없이 실행', '됨, Node만으로', '안 됨, DOM 필요'],
      ['터미널 글자 그림', '됨', '안 됨'],
      ['에이전트용 기능', '고치는 법까지 알려 주는 오류, syntax, --check, MCP', '따로 없음'],
    ],
    caption:
      '2026년 11월 26일 Apple M2 Max의 headless Chrome 158에서 쟀습니다. Mermaid 문서의 flowchart 예시 116장을 한 페이지에서 둘 다 SVG로 그렸고, 한 번 미리 돌린 뒤 쟀습니다. 파일 크기는 ursula.global.js와 mermaid.min.js를 gzip -9로 압축한 크기입니다.',
    strip: '같은 글, 두 그림',
    stripNote:
      '그 116장 가운데 선이 가장 많은 flowchart 세 장입니다(7개, 6개, 5개). 선 수가 같으면 파일 번호가 앞선 것을 골랐고, 08은 07과 같은 그래프라 뺐습니다. ursula 그림은 이 사이트의 엔진이, Mermaid 그림은 시간을 잰 그 페이지에서 Mermaid.js 12.3.0이 그렸습니다. 그림을 누르면 크게 보이고, 이름을 누르면 글이 나옵니다.',
  },
};
