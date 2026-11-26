# 출력 형식

| `--format` | 받는 것 |
| --- | --- |
| `svg`(기본) | 문서에 바로 넣는 SVG 한 장. 색은 CSS 변수이고, 밝은·어두운 모드는 보는 사람의 설정을 따릅니다. |
| `text` | `--width`에 맞춰 배치한 상자 그리기 글자 그림. `--color`를 주지 않으면 색 코드를 넣지 않습니다. |
| `text-svg` | 터미널 글자 그림과 똑같이 생긴 SVG 한 장. 글자 그림의 줄이 어긋나는 곳에서 씁니다. |
| `html` | 그림과 밝은·어두운 전환, PNG·SVG 저장 기능을 담은 파일 하나. |
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
모드를 정하고, `auto`는 시스템 설정을 따릅니다.

## 옵션 {#options}

`ursula-diagram --help`는 모든 옵션과 형식, 종료 코드를 출력합니다. 명령이 출력하는 그대로 싣습니다.

```ursula-output --help
```

