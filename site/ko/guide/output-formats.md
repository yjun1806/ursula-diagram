---
description: 'Mermaid CLI ursula의 --format 전체: SVG, 터미널 글자, text-svg, HTML, PNG, JSON 배치, check 점검 결과, fixed 고친 글. 형식마다 명령을 하나씩 싣습니다.'
---

# 출력 형식

| `--format` | 받는 것 |
| --- | --- |
| `svg`(기본) | 문서에 바로 넣는 SVG 한 장. 색은 CSS 변수이고, 밝은·어두운 모드는 보는 사람의 설정을 따릅니다. |
| `text` | `--width`에 맞춰 배치한 상자 그리기 글자 그림. `--color`를 주지 않으면 색 코드를 넣지 않습니다. |
| `text-svg` | 터미널 글자 그림과 똑같이 생긴 SVG 한 장. 글자 그림의 줄이 어긋나는 곳에서 씁니다. |
| `html` | 그림과 밝은·어두운 전환, PNG·SVG 저장 기능을 담은 파일 하나. |
| `png` | `--theme`의 색으로 그린 그림 파일. `--scale`을 주지 않으면 SVG의 두 배 크기입니다. 선택 설치 패키지 `@resvg/resvg-js`가 있어야 합니다. |
| `json` | 상자·선·라벨과 그 좌표. |
| `check` | 그림 없이 엔진의 점검 결과만 냅니다. 꺾임·교차 수를 적은 한 줄, 교차하는 선과 가장 많이 꺾인 선과 그 줄 번호가 나오고, 때로 글을 어떻게 고치면 나아지는지 묻는 질문이 붙습니다. |
| `fixed` | `--fix`의 고침을 반영한 글. 원래 글 대신 저장해 씁니다. 그림은 그리지 않습니다. |

형식마다 명령 하나를 탭으로 나눴습니다. `json` 탭은 표준 입력에서 글을 읽습니다.

::: code-group

```bash [svg]
ursula-diagram flow.mmd --format svg > flow.svg
```

```bash [text]
ursula-diagram flow.mmd --format text --width 100
```

```bash [text, ASCII]
ursula-diagram flow.mmd --format text --width 100 --charset ascii
```

```bash [text-svg]
ursula-diagram flow.mmd --format text-svg --width 100 > flow-text.svg
```

```bash [html]
ursula-diagram flow.mmd --format html --theme dark --title "Flow" > flow.html
```

```bash [png]
ursula-diagram flow.mmd --format png --theme dark > flow.png
```

```bash [check]
ursula-diagram flow.mmd --format check
```

```bash [json]
cat flow.mmd | ursula --format json
```

```bash [fixed]
ursula-diagram flow.mmd --format fixed > flow-fixed.mmd
```

:::

파일을 주지 않으면 명령은 표준 입력에서 글을 읽습니다. `--theme auto|light|dark`는 `html` 페이지의 밝은·어두운
모드를 정하고, `auto`는 시스템 설정을 따릅니다. `png`에서는 그림에 박을 색을 고르고 배경을 한 색으로 칠합니다.
여기서 `auto`는 밝은 모드입니다.

`png`는 선택 설치 패키지 `@resvg/resvg-js`로 SVG를 그립니다. `ursula-diagram`을 설치해도 이 패키지는 따라오지 않습니다.
글자는 그 컴퓨터에 설치된 글꼴로 그리므로, 한글·중국어·일본어 라벨에는 그런 글꼴이 있어야 합니다. macOS에는 있고,
Linux에서는 `fonts-noto-cjk` 같은 패키지로 더합니다. 글꼴이 없어도 명령은 PNG를 쓰고, 표준 오류에 한 줄을 남깁니다.
글꼴이 하나도 없으면 `warning: no font file found, …`(PNG에 글자가 없습니다), 한글·중국어·일본어 글자만 그릴 글꼴이
없으면 `warning: no font has the Korean, Chinese or Japanese characters of this drawing, …`입니다. PNG마다 그 글자에 필요한
글꼴 파일만 읽습니다. 렌더러는 한 번만 설치합니다.

```bash
npm i -g @resvg/resvg-js
```

렌더러가 없으면 `--format png`는 코드 2로 끝나고 위 명령을 출력합니다. PNG는 바이트이므로 터미널에는 쓰지 않습니다.
파일로 돌려 받습니다.

## 옵션 {#options}

`ursula-diagram --help`는 모든 옵션과 형식, 종료 코드를 출력합니다. 명령이 출력하는 그대로 싣습니다.

```ursula-output --help
```

