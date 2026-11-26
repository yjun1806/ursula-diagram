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

## 브라우저에서

`ursula-diagram/global`은 `<script>` 태그로 불러오는 파일 하나짜리 엔진입니다. 패키지가 내보내는 모든 것과
`renderHtml`이 전역 `ursula` 아래에 있습니다. [플레이그라운드](/ko/playground)가 이 파일로 동작합니다.

```html
<script src="node_modules/ursula-diagram/dist/ursula.global.js"></script>
<script>
  const svg = ursula.render('flowchart LR\n  A --> B');
</script>
```
