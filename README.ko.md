<p align="center"><img src="assets/banner.png" alt="ursula" width="100%"></p>

<p align="center"><a href="README.md">English</a> · <b>한국어</b></p>

# ursula

Mermaid 글을 SVG와 터미널 글자 그림으로 그립니다. 상자와 선의 자리는 엔진이 계산하므로 같은 글은 어디서 그려도 같은
그림이 됩니다. 브라우저도, DOM도, 실행 의존성도 필요 없습니다.

```
    ┌── 안 됨 ──┐
    ▼           │
┌───────┐   ┌───────┐       ┌───────┐
│ 시작  │──▶│ 확인  │─ 됨 ─▶│  끝   │
└───────┘   └───────┘       └───────┘
```

## 그리는 유형

Mermaid 문서에 있는 유형 35가지를 모두 그립니다.

Architecture, Block, C4, Class, Cynefin, Entity Relationship, Event Modeling, Flowchart, Gantt, Git Graph, Ishikawa,
Kanban, Mindmap, Packet, Pie, Quadrant, Radar, Railroad(IR, ABNF, EBNF, PEG), Requirement, Sankey, Sequence, State,
Swimlanes, Timeline, TreeView, Treemap, Use Case, User Journey, Venn, Wardley Map, XY Chart, ZenUML.

유형은 Mermaid와 같이 글의 첫 줄에서 읽습니다.

## 출력 형식

| 형식 | 받는 것 |
| --- | --- |
| `svg` | 글 안에 바로 넣는 SVG 한 장. 색은 CSS 변수이고, 밝은·어두운 모드는 보는 쪽 설정을 따릅니다. |
| `text` | 정한 폭을 넘지 않는 상자 그리기 글자 그림. 색 코드는 넣지 않습니다. `--charset ascii`를 주면 영문 기호만으로 그립니다. |
| `text-svg` | 터미널 글자 그림과 똑같이 생긴 SVG 한 장. 글자 그림이 깨지는 자리에 씁니다. |
| `html` | 그림, 밝은·어두운 전환, PNG·SVG 저장이 든 파일 하나. |
| `json` | 상자·선·라벨의 좌표. |
| `check` | 그림을 보고 글을 어떻게 고치면 나아지는지 알려 주는 물음. |

`text` 그림은 모든 글자가 엔진이 센 폭대로 그려질 때만 줄이 맞습니다. 선과 화살촉은 한 칸, 한글·한자·가나는 두 칸입니다.
진짜 터미널은 이렇게 그립니다. 채팅 창, 웹 페이지, 문서의 코드 블록은 그렇지 않은 경우가 많아 상자가 어긋납니다. 그런
자리에는 `svg`나 `text-svg`를 쓰세요. `text-svg`는 선을 도형으로 그리고 모든 낱말을 칸 자리에 고정하므로, 어떤 글꼴로
보여도 줄이 어긋나지 않습니다. 상자 선 글자를 두 칸으로 그리는 터미널에는 `--charset ascii`를 쓰세요.

```
    +---- no ---+
    v           |
+-------+   +-------+        +-------+
| Start |-->|  Ok?  |- yes ->| Done  |
+-------+   +-------+        +-------+
```

| | `unicode`(기본) | `ascii` |
| --- | --- | --- |
| 선, 굵은 선, 점선 | `─ │` `━ ┃` `┄ ┆` | `- \|` `= #` `. :` |
| 모서리·갈림·교차, 둥근 모서리 | `┌ ├ ┼`, `╭ ╮ ╰ ╯` | `+`, `/ \ \ /` |
| 화살촉, 속 빈 화살촉 | `▶ ◀ ▼ ▲`, `──▷` | `> < v ^`, `--\|>` |
| 채운·빈 마름모, 점, 막대 | `◆ ◇` `● ◉` `█` | `@ o` `* @` `#` |
| 잘린 글 | `…` | `~` |

그림 안의 글은 적은 그대로 둡니다. 표의 글자는 어디에 있든 바꾸고, 일부 터미널이 두 칸으로 그리는 기호 몇 개(`·` `×` `—`
`∩` `⊕`)도 바꿉니다.

## 명령줄

```bash
node src/cli.ts flow.mmd --format svg > flow.svg
node src/cli.ts flow.mmd --format text --width 100
node src/cli.ts flow.mmd --format text --width 100 --charset ascii
node src/cli.ts flow.mmd --format text-svg --width 100 > flow-text.svg
node src/cli.ts flow.mmd --format html --theme dark > flow.html
cat flow.mmd | node src/cli.ts --format json
```

`--theme auto|light|dark`는 내보낸 페이지의 밝은·어두운 모드를 정합니다. `auto`는 시스템 설정을 따릅니다.
모든 옵션은 `node src/cli.ts --help`로 봅니다.

## 라이브러리

```ts
import { render, renderText, renderTextSvg } from './src/index.ts';
import { renderHtml } from './src/html.ts';

const src = `flowchart LR
  A[시작] --> B{확인}
  B -->|됨| C[끝]
  B -->|안 됨| A`;

const svg = render(src);                 // SVG 문자열
const text = renderText(src, 80);        // { lines: string[] } 또는 { error: string }
const ascii = renderText(src, 80, { charset: 'ascii' });
const picture = renderTextSvg(src, 80);  // { svg: string } 또는 { error: string }
const page = renderHtml(src, { title: '흐름' });
```

글을 그릴 수 없으면 `render`는 고칠 곳을 알려 주는 `UrsulaError`를 던집니다. `renderText`는 같은 내용을 `{ error }`로
돌려줍니다. 그림이 폭을 넘을 때도 그렇습니다. 그림을 잘라 내지 않습니다.

`renderTextSpans`는 같은 줄을 톤(`normal`, `dim`, `bold`, `accent`)이 붙은 조각으로 돌려줍니다. 터미널 글에 직접 색을
입히는 쪽에서 씁니다. `spansToSvg`는 그 조각을 `renderTextSvg`와 같은 그림으로 그리고, `toAscii`는 이미 그린 줄의 그리기
글자를 ASCII로 바꿉니다. ER 그림의 줄에는 `{ countBars: true }`를 주면 세로 선 위의 개수 막대가 `-`가 됩니다.

## 색 바꾸기

그림은 모든 색을 CSS 변수에서 읽고 기본값을 함께 싣습니다. 그래서 그림만 놓아도 제 색으로 보이고, 페이지가 변수를 정하면
그 색을 따릅니다. 변수마다 밝은 값과 어두운 값이 있고, 어두운 값은 `prefers-color-scheme: dark`에서 씁니다.

```css
:root {
  --ursula-accent: #0b6e4f;
  --ursula-start-fill: #bfe3d0;
}
```

| 변수 | 칠하는 것 | 밝은 값 | 어두운 값 |
| --- | --- | --- | --- |
| `--ursula-fg` | 이름과 본문 글자 | `#201f1e` | `#efeeec` |
| `--ursula-muted` | 둘째 줄과 라벨 | `#5b5b59` | `#b2b1af` |
| `--ursula-faint` | 뒤로 물러나는 글자와 표시 | `#878685` | `#757472` |
| `--ursula-line` | 상자 사이의 선 | `#565554` | `#a5a4a2` |
| `--ursula-border` | 상자 테두리 | `#484846` | `#bebdbb` |
| `--ursula-hair` | 구역 테두리, 구분선, 격자선 | `#e2e1e0` | `#2c2b2a` |
| `--ursula-surface` | 상자와 바탕의 면 | `#fcfcfa` | `#171614` |
| `--ursula-lane` | 칠한 띠: 레인, 구역, 머리 띠, 태그 | `#efeeed` | `#252422` |
| `--ursula-chip-fill` | 라벨 칩과 노트 | `#f1f0ef` | `#252422` |
| `--ursula-accent` | 강조 선과 글자 | `#82641c` | `#dab975` |
| `--ursula-start-fill` | 시작 상자와 가장 높은 막대의 면 | `#e5c37a` | `#dab975` |
| `--ursula-accent-tint` | 옅은 강조 면 | `#f6ecd7` | `#372c15` |
| `--ursula-on-accent` | 시작 상자 위의 글자 | `#201f1e` | `#171614` |
| `--ursula-bg` | 흐름도, 클래스, 상태, ER, 요구사항, C4, 유스케이스 그림의 배경 | `transparent` | `transparent` |
| `--ursula-panel` | 차트 뒤의 판 | `none` | `none` |
| `--ursula-bar` | 차트의 중립 막대 | `#c8c7c6` | `#434241` |
| `--ursula-tint-outer` | C4 그림의 가장 바깥 경계 | `#f4f3f1` | `#1e1d1b` |
| `--ursula-tint-inner` | C4 그림의 가장 안쪽 경계 | `#f6f5f3` | `#1c1b19` |
| `--ursula-tint-chip` | 경계 면 위의 라벨 칩 | `#ebeae8` | `#262523` |
| `--ursula-s1` … `--ursula-s8` | 차트의 계열 여덟 | | |
| `--ursula-s1-tint` … `--ursula-s8-tint` | 계열마다의 옅은 면 | | |

## 에이전트 스킬

`skills/ursula`는 코딩 에이전트용 스킬입니다. `SKILL.md`가 글을 어떻게 쓰고 어떤 출력을 낼지 에이전트에게 알려 주고,
`scripts/ursula.mjs`는 명령을 한 파일로 묶은 것이라 Node만 있으면 돕니다. 이 폴더를 에이전트의 스킬 폴더에 복사해 씁니다.

## 개발

```bash
npm install
npx tsc --noEmit
npm test              # 느린 대조를 뺀 시험 전체
npm run test:rewrite  # 층 배치 엔진의 느린 대조, 15분쯤
bun scripts/build.ts  # dist/와 스킬 안의 명령. 그림이 바뀌면 다시 돌립니다
```

빌드한 파일은 Node 22 이상에서 돕니다. Node 24 이상은 TypeScript 소스도 바로 실행하며, 위 명령은 그렇게 적었습니다.
