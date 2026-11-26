# 왜 ursula인가

ursula는 아래 네 가지가 맞는 상황을 위해 만들었습니다. 먼저 자기 경우와 맞는지 확인해 보세요.

1. 사람이 아니라 에이전트가 그림을 씁니다. 답을 쓰는 도중에, 한 세션에 여러 장을 그리기도 합니다.
2. 아무도 손으로 고쳐 주지 않습니다. 글이 틀리면 에이전트가 혼자 알아채고 고쳐야 합니다.
3. 브라우저가 없을 수 있습니다. 터미널, CI, 샌드박스, Chromium이 없는 서버에서도 그려야 합니다.
4. 같은 답을 여러 곳에서 읽습니다. 터미널, 채팅 창, 웹 페이지, README가 모두 그 자리입니다.

이 네 가지가 맞는다면 아래 표의 네 가지가 무엇보다 중요합니다. 수치는 맨 아래 [수치의 조건](#수치의-조건)에서 잰 값입니다.

| 전제 | ursula가 하는 일 | 잰 값 |
| --- | --- | --- |
| 에이전트가 한 세션에 여러 장을 그린다 | 모델은 Mermaid 글만 씁니다. 배치는 엔진이 계산합니다 | 그림 한 장에 11~17초. 모델이 배치를 정하는 스킬은 65~174초. 그중 엔진의 몫은 0.1~0.4초. 두 번 그린 SVG가 바이트까지 같음 |
| 혼자 고쳐야 한다 | 오류가 틀린 자리와 함께 의도했을 낱말과 맞는 예시 줄을 알려 줍니다. 점검은 교차하는 선을 줄 번호로 짚습니다 | 일부러 틀리게 쓴 글 93개에서 틀린 줄을 오류의 예시 줄로 바꾸자 93개 모두 그려짐. `--fix`는 그중 50개를 턴을 더 쓰지 않고 그림 |
| 브라우저가 없을 수 있다 | Node만으로 돕니다 | 실행 의존성 0개. 명령 한 번에 103ms |
| 여러 곳에서 읽는다 | 엔진 하나가 SVG, 터미널 글자 그림, 글자 그림을 담은 SVG(`text-svg`)를 그립니다. 셸이 없는 클라이언트에는 MCP 서버로 엽니다 | Mermaid 문서의 예시 531개를 SVG와 터미널 글자로 모두 그림(35가지 유형) |

반대로 사람이 중요한 그림 한 장을 손으로 다듬는다면, 또는 브라우저에서 Mermaid를 이미 잘 쓰고 있다면 ursula가
필요 없을 수 있습니다. 그런 경우는 [ursula가 맞지 않는 경우](#ursula가-맞지-않는-경우)에 수치와 함께 적었습니다.

## 모델에게 배치를 맡기면

모델이 배치를 직접 정하는 그림 스킬이 있습니다. [diagram-design](https://github.com/cathrynlavery/diagram-design)은
모델이 배치를 정하고 SVG를 직접 씁니다. 같은 Mermaid 글 세 개를 이 스킬과 ursula 스킬로 두 번씩 그렸습니다. 칸마다
첫 판 / 둘째 판입니다.

| 그림 | 스킬 | 시간(초) | 모델이 쓴 토큰 | 전체 토큰 | 턴 |
| --- | --- | ---: | ---: | ---: | ---: |
| flowchart, 노드 9 | diagram-design | 65 / 78 | 6.7k / 8.5k | 330k / 443k | 10 / 12 |
| | ursula | 12 / 11 | 0.7k / 0.6k | 36k / 36k | 4 / 4 |
| C4, 요소 7 | diagram-design | 154 / 174 | 15.4k / 17.7k | 379k / 672k | 11 / 14 |
| | ursula | 16 / 17 | 1.3k / 1.3k | 40k / 40k | 4 / 4 |
| sequence, 메시지 10 | diagram-design | 161 / 144 | 18.8k / 17.9k | 666k / 392k | 14 / 10 |
| | ursula | 13 / 14 | 0.8k / 0.9k | 37k / 37k | 4 / 4 |

전체 토큰에는 각 스킬이 읽은 자기 지시문과, 턴마다 다시 보내는 대화가 들어 있습니다. 모델이 실제로 쓴 양은 「모델이 쓴
토큰」(출력 토큰) 열입니다. ursula 행은 [풀 리퀘스트 #49](https://github.com/yjun1806/ursula-diagram/pull/49)의 스킬로, diagram-design보다 같은 날 뒤에 잰 값입니다.

시간이 어디에 들었는지를 판마다 세션 스트림의 시각으로 나눴습니다.

| 스킬 | 모델을 기다린 시간 | 스킬의 명령 | 다른 명령 |
| --- | ---: | ---: | ---: |
| ursula | 8~12초 | 3.4~5.5초(ursula) | 0~0.1초 |
| diagram-design | 63~170초 | 0.4~1.9초(자체 스크립트) | 1.3~2.9초 |

엔진이 그리는 시간은 한 번에 0.1~0.4초쯤입니다. 나머지는 모델이 스킬을 읽고, Mermaid 글을 쓰고, 답하는 시간입니다.
모델이 쓴 토큰은 ursula와 함께일 때 0.6k~1.3k, 그림을 직접 쓸 때 6.7k~18.8k였고, 토큰을 쓰는 데에도 시간이 듭니다.
ursula로 그린 판은 스킬을 읽고, 글을 써서 명령을 돌린 뒤 답했습니다. diagram-design으로 그린 판은 참고 문서를 읽고, 그림(또는 그림을 쓰는 스크립트)을 구상해 쓰는 데 35~127초를
쓰고, 그 뒤에 점검하고 스크린숏을 보고 고쳤습니다.

세션 안의 ursula 명령이 따로 돌릴 때보다 오래 걸린 것은 세션의 첫 명령이어서라고 봅니다. 첫 명령은 무엇을 실행하든
1.2~5.5초가 걸렸고, diagram-design의 첫 명령인 cat도 1.2~1.9초였습니다.

diagram-design은 같은 글도 판마다 다르게 그렸습니다. flowchart는 첫 판이 가로 띠, 둘째 판이 구역 상자였습니다. 그림
제목(「Order fulfilment flow」)과 범례 문구(「Paid handoff to warehouse」)는 입력에 없는 글을 모델이 지은 것입니다.
ursula 스킬은 세 글 모두 두 판의 SVG가 바이트까지 같았습니다.

<div class="compare-pics compare-pics-large">
  <figure><figcaption>diagram-design, 첫 판</figcaption><div><img src="/skill-compare/order-flow-diagram-design.png" alt="flowchart: diagram-design이 그린 그림" loading="lazy"></div></figure>
  <figure><figcaption>ursula, 첫 판과 둘째 판</figcaption><div><img src="/skill-compare/order-flow-ursula.svg" alt="flowchart: ursula가 그린 그림" loading="lazy"></div></figure>
</div>

디자인은 diagram-design의 그림이 낫습니다. 모델이 그림마다 강조할 노드를 고르고 범례를 붙였습니다. ursula의 그림은
더 수수하지만 노드·간선·라벨을 하나도 빼지 않았고, 몇 번을 그려도 같습니다.

이 표는 모델이 배치를 정할 때 드는 값입니다. 모델이 Mermaid만 쓰고 Mermaid.js가 그려도 턴은 ursula만큼 줄 것으로
추정합니다. 그 경우와의 차이는 다음 절에 적었습니다.

## Mermaid.js에 맡기면

모델이 Mermaid를 쓰고 Mermaid.js가 그리면 모델의 턴은 적습니다. ursula와의 차이는 그리는 곳과 오류에 있습니다.

**그리는 곳.** Mermaid.js는 DOM이 있어야 그립니다. 명령줄의 mermaid-cli는 설치할 때 Chromium을 내려받고, 그림마다
헤드리스 Chromium을 띄워 한 장에 630ms가 걸립니다. ursula는 Node만으로 명령 한 번에 103ms가 걸립니다. 또 Mermaid.js는
SVG만 냅니다. 터미널에서 답하는 에이전트는 Mermaid 원문을 보여 줄 수밖에 없습니다. ursula는 같은 글로 터미널 글자
그림도 그립니다.

**오류.** Mermaid도 어디서 실패했는지 알려 줍니다. ursula는 그 자리에 무엇을 써야 하는지도 알려 줍니다. 첫 줄을
`flowchrt LR`로 잘못 쓴 글을 Mermaid 12.3.0의 `mermaid.parse`에 넣으면 이렇게 답합니다.

```
No diagram type detected matching given configuration for text: flowchrt LR
```

같은 글을 ursula에 넣으면 이렇게 답합니다.

```ursula-output exit=1 --format text
flowchrt LR
  A --> B
```

이렇게 고칠 방법이 하나뿐인 오류는 `--fix`를 주면 엔진이 고쳐서 그리고, 고친 줄을 알려 줍니다. 그림이 그려진 뒤에도
`--format check`가 교차하는 선의 짝을 원본 줄 번호와 함께 알려 줍니다.

**속도.** 턴 한 번에 몇 초를 쓰는 에이전트에게는 큰 차이가 아닙니다. 브라우저에서 미리보기를 실시간으로 그리거나 그림이
많을 때는 차이가 납니다. flowchart 한 장에 ursula는 중앙값 0.7ms, Mermaid.js는 20.6ms가 걸렸습니다. 브라우저용 파일은
gzip으로 ursula 330kB, Mermaid.js 1.58MB입니다.

## 글자 그림 도구와는

termaid, mmdflux, mermaid-ascii도 Mermaid를 터미널 글자 그림으로 그립니다. mmdflux와 mermaid-ascii는 실행 파일 하나라
명령 한 번이 9~11ms로 ursula보다 약 10배 빠릅니다. 셋 다 이모지가 든 라벨도 어긋나지 않게 그립니다. 한글 같은 넓은
글자는 termaid와 mermaid-ascii도 ursula처럼 맞춥니다.

차이는 그리는 유형의 수입니다. Mermaid 문서의 예시 531개 가운데 termaid는 366개(18가지 유형), mmdflux는 206개(4가지),
mermaid-ascii는 160개(3가지)를 그립니다. ursula는 531개(35가지)를 그립니다. termaid와 mermaid-ascii는 SVG를 내지 않습니다.

## ursula가 맞지 않는 경우

- **사람이 그림 한 장을 공들여 디자인할 때.** ursula 그림의 생김새는 한 가지이고 바꿀 수 있는 것은 색뿐입니다. 그림
  스킬이나 디자이너가 낫습니다.
- **명령줄에서 PNG가 필요할 때.** ursula의 명령은 PNG를 쓰지 않습니다. `--format html` 페이지의 버튼으로만 PNG를 저장합니다.
  mermaid-cli는 PNG를 바로 씁니다. 대신 한 장에 630ms가 걸리고 Chromium이 필요합니다.
- **그림마다 새 프로세스를 띄울 때.** mmdflux와 mermaid-ascii는 9~11ms, ursula는 103ms가 걸립니다. 그중 59ms는 빈 Node
  스크립트를 실행해도 드는 시간입니다.
- **터미널로 보낼 그림의 라벨에 이모지가 있을 때.** ursula는 이모지를 한 칸으로 셉니다. 그래서 이모지가 든 그림에서 끊긴
  선 끝이 18개 늘었습니다. mmdflux, mermaid-ascii, termaid는 0개였습니다.

## 써 보기

[플레이그라운드](/ko/playground)에서 자기 Mermaid 글을 그려 볼 수 있습니다. 에이전트 스킬은 이 명령으로 설치합니다.

```bash
npx skills add yjun1806/ursula-diagram
```

스킬과 MCP 서버를 설정하는 법은 [에이전트 스킬](/ko/guide/agent-skill)에, 도구별 수치는 [다른 도구와 비교](/ko/guide/compared)에
있습니다.

## 수치의 조건

모두 2026-11-26에 Apple M2 Max 한 대(macOS 26.6, Node 26.12.1)에서 쟀습니다. 스킬 대조는 Claude Code에서
claude-opus-5-5로, 판마다 새 세션을 열고 같은 지시문으로 공개 Mermaid 글 세 개를 두 번씩 그렸습니다. 스킬은 ursula가
풀 리퀘스트 #49의 것, diagram-design이 커밋 b228c5d입니다. 명령 한 번의
시간은 Mermaid 문서의 flowchart 예시 103개의 중앙값입니다. 브라우저 속도는 헤드리스 Chrome 158의 한 페이지에서
flowchart 예시 116장을 둘 다 SVG로 그린 중앙값입니다. 도구 버전은 mermaid-cli 12.2.0, Mermaid 12.3.0, mmdflux 2.6.1,
mermaid-ascii 1.6.2, termaid 0.14.0입니다.

측정 스크립트는 저장소의 `bench/`에 있습니다. 저장소를 클론한 폴더에서 아래 명령은 다른 도구와 명령 한 번의 시간을 잽니다.

```bash
npm run bench:tools
```

아래 명령은 브라우저에서의 속도를 잽니다.

```bash
npm run bench:browser
```

스킬 비교를 포함한 자세한 방법은 [bench/README.md](https://github.com/yjun1806/ursula-diagram/blob/main/bench/README.md)에 있습니다. 수치가 틀렸거나 도구의 새 버전이 나왔으면
[이슈를 열어 주세요](https://github.com/yjun1806/ursula-diagram/issues/new).
