---
description: 'ursula를 라이브러리로 씁니다. Node와 브라우저에서 render, renderText, renderTextSvg, renderHtml로 Mermaid를 SVG나 터미널 글자 그림으로 바꿉니다.'
---

# 라이브러리

```ts
import { render, renderText, renderTextSvg } from 'ursula-diagram';
import { renderHtml } from 'ursula-diagram/html';

const src = `flowchart LR
  A[Start] --> B{Ok?}
  B -->|yes| C[Done]
  B -->|no| A`;

const svg = render(src);                 // SVG 문자열
const text = renderText(src, 80);        // { lines: string[] } 또는 { error: string }
const ascii = renderText(src, 80, { charset: 'ascii' });
const picture = renderTextSvg(src, 80);  // { svg: string } 또는 { error: string }
const page = renderHtml(src, { title: 'Flow' });
```

글을 그릴 수 없으면 `render`는 고칠 곳을 알려 주는 `UrsulaError`를 던집니다. `renderText`는 같은 내용을 `{ error }`로
돌려줍니다. 그림이 폭을 넘을 때도 그림을 잘라 내지 않고 `{ error }`를 돌려줍니다.

`renderTextSpans`는 같은 줄을 톤(`normal`, `dim`, `bold`, `accent`)이 붙은 조각으로 돌려줍니다. 터미널 출력에 직접 색을
입히는 프로그램에서 씁니다. `spansToSvg`는 그 조각을 `renderTextSvg`와 같은 그림으로 그리고, `toAscii`는 이미 그린 줄의 상자 그리기
글자를 ASCII로 바꿉니다. ER 그림의 줄에 `{ countBars: true }`를 주면 세로 선 위의 개수 막대가 `-`로 바뀝니다.

`spansToAnsi`는 조각으로 된 줄 하나를 `--color`처럼 ANSI 색 코드를 붙여 씁니다.

## PNG

`ursula-diagram/png`는 Node에서 PNG를 그립니다. `ursula-diagram` 옆에 선택 설치 패키지 `@resvg/resvg-js`를 깔아야 합니다.
기본 입구는 이 패키지를 불러오지 않고, 브라우저에서는 쓰지 않습니다.

```ts
import { renderPng } from 'ursula-diagram/png';

const png = await renderPng(src, { theme: 'dark', scale: 2 }); // Uint8Array
```

패키지가 없으면 프로미스가 `PngRendererMissing`으로 거부되고, 그 메시지가 설치 명령입니다.

글꼴이 없어도 프로미스는 거부되지 않습니다. 컴퓨터에 글꼴이 하나도 없거나, 그림의 한글·중국어·일본어 글자를 가진 글꼴이
없으면 그 글자 없이 PNG를 그리고 `onWarning`을 그 사실을 적은 한 줄로 부릅니다.

```ts
const png = await renderPng(src, { onWarning: (message) => console.warn(message) });
```

`fontDirs`로 시스템 글꼴 폴더 밖의 글꼴 폴더를 더 줄 수 있습니다.

## 옵션

`renderText`, `renderTextSpans`, `renderTextSvg`는 셋째 인자로 명령의 옵션을 받습니다. `charset`(`'unicode'` 또는
`'ascii'`), `detail`, `quality`, `engine`, `composition`, 그리고 `legend`, `questions`, `elbows`입니다. 뒤의 셋은
`false`를 주면 `--no-` 옵션과 같습니다. `render`는 `title`, `legend`, `maxWidth`를, `renderHtml`은 `title`, `theme`,
`maxWidth`를 받습니다.

## 오류와 고침

그릴 수 없는 글을 받으면 `renderText`, `renderTextSpans`, `renderTextSvg`는 `{ error, line, column, hint, suggestion, example }`를
돌려줍니다. `error` 말고는 알 때만 들어 있습니다. `render`는 같은 필드를 가진 `UrsulaError`를 던집니다. `fixSource`는
`--fix`와 같은 고침을 하고, 고친 글과 고친 곳의 목록을 돌려줍니다. 고친 곳마다 `line`, `from`, `to`, `reason`이 있습니다.

```ts
import { fixSource, renderText } from 'ursula-diagram';

const { source, fixes } = fixSource('flowchrt LR\n  A -> B');
const text = renderText(source, 80);
```

`syntaxTypes()`는 `ursula-diagram syntax`처럼 유형 이름의 목록을 돌려주고, `syntaxOf(type)`은 이름이나 머리글에 해당하는
항목(`name`, `headers`, `summary`, `example`, `rules`)을 돌려줍니다. 없으면 `undefined`입니다.

패키지는 이 함수들 아래의 단계(`parse`, `layout`, `renderSvg`, `renderTextLayout` 등)도 엔진 위에 도구를 만드는 쪽을 위해
내보냅니다. 목록과 타입은 `dist/index.d.ts`에 있습니다.

## 브라우저에서

`ursula-diagram/global`은 `<script>` 태그로 불러오는 파일 하나짜리 엔진입니다. 패키지가 내보내는 모든 것과
`renderHtml`이 전역 `ursula` 아래에 있습니다. [플레이그라운드](/ko/playground)가 이 파일로 동작합니다.

```html
<script src="node_modules/ursula-diagram/dist/ursula.global.js"></script>
<script>
  const svg = ursula.render('flowchart LR\n  A --> B');
</script>
```
