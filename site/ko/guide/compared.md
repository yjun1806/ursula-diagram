---
aside: false
pageClass: compare-page
---

# 다른 도구와 비교

여기서 비교한 도구 가운데 Mermaid 문서의 예시 531개를 SVG와 터미널 글로 모두 그리는 것은 ursula 하나입니다. 그림 한 장을
명령 한 번으로 그리면 mermaid-cli보다 약 6배 빠르고, 네이티브 글자 그림 도구보다는 약 10배 느립니다. 모델이 배치를 직접
정하는 스킬과 견주면 ursula를 쓴 에이전트가 6~12배 빨리 그렸습니다.

아래 수치는 모두 2026-11-26에 Apple M2 Max 한 대(macOS 26.6, Node 26.12.1)에서 모든 도구에 같은 입력을 주고 잰 값입니다.
비교한 도구의 버전은 mermaid-cli 12.2.0, Mermaid 12.3.0, Pele 1.13.0, beautiful-mermaid 1.1.3, mmdflux 2.6.1,
mermaid-ascii 1.6.2, termaid 0.14.0입니다.

## 손으로 그리는 스킬과 비교

에이전트가 그림을 그리는 방법은 두 가지입니다. 모델이 배치를 정해 SVG를 직접 쓰거나, 모델은 Mermaid만 쓰고 배치는 엔진에
맡깁니다. 같은 그림 세 장을 앞 방식의 스킬인 [diagram-design](https://github.com/cathrynlavery/diagram-design)과 뒤 방식의
ursula 스킬로 각각 그렸습니다.

diagram-design의 그림이 더 공들였습니다. 제목, 구역, 범례를 넣고 강조할 곳도 스스로 고릅니다. ursula의 그림은 그보다
수수하지만 빠진 것 없이 깔끔하고 매번 같으며, 에이전트가 6~12배 빨리 끝냈습니다.

<FeatureTable name="skill" />

<BenchmarkBars name="skillMean" />

이 시간은 거의 다 모델의 몫입니다. 엔진이 그리는 시간은 한 번에 0.1~0.4초쯤이고, 나머지는 모델이 스킬을 읽고, Mermaid
글을 쓰고, 답하는 시간입니다. 모델이 쓴 토큰은 ursula와 함께일 때 0.6k~1.3k, 그림을 직접 쓸 때 6.7k~18.8k였고, 토큰을
쓰는 데에도 시간이 듭니다.

<FeatureTable name="skillTime" />

아래 그림은 글마다 두 번 그린 것 가운데 첫 판이고, 손대지 않았습니다. 그림 아래에는 두 판의 평균 시간과 전체 토큰, 그리고
그림에서 확인한 것을 적었습니다. 그림을 누르면 크게 보이고, 이름을 누르면 입력 글이 나옵니다.

<PicGrid name="skill" named />

diagram-design은 그림마다 배치와 제목, 범례 문구까지 골랐고, 그 선택은 판마다 달라집니다. ursula의 그림은 생김새가 한
가지이고, 바꿀 수 있는 것은 색뿐입니다. ursula 스킬로 두 번 그린 SVG는 글마다 바이트 단위까지 같았습니다.

## 그리는 예시 수

<FeatureTable name="coverage" />

## 속도

<BenchmarkBars name="speed" />

아래는 116장 가운데 선이 가장 많은 flowchart 예시 101-flowcharts를 위 그래프의 도구가 모두 기본 설정으로 그린 그림입니다.
글자 그림 도구는 100열로 그렸습니다. 터미널 글은 글자마다 한 칸씩 자리를 잡은 그림으로 보여 주므로 어느 글꼴에서도 열이
맞습니다. beautiful-mermaid의 글자 그림에는 a2, b2와 구역 안의 선이 빠졌고, mermaid-ascii의 글자 그림은 선이 구역 상자를
가로지릅니다.

<PicGrid name="tools" />

ursula가 명령 한 번에 쓰는 103ms는 대부분 Node를 띄우는 데 듭니다. 프로그램 하나 안에서 라이브러리로 부르면 Pele,
beautiful-mermaid와의 순서가 뒤집힙니다.

<FeatureTable name="inProcess" />

## 한글 같은 넓은 글자

한글과 한자는 터미널에서 두 칸을 차지합니다. 이런 글자를 한 칸으로 세는 도구로 그리면 상자의 오른쪽 변이 밀려나 그 변에
닿는 선이 끊깁니다.

<FeatureTable name="wide" />

## 출력과 실행 환경

<FeatureTable name="outputs" />

<FeatureTable name="runtime" />

## 같은 예시를 나란히

Mermaid 문서의 같은 예시를 네 도구가 각자 기본 설정으로 그렸습니다. 그림은 모두 밝은 바탕에 놓았습니다. Mermaid와 Pele는
헤드리스 Chrome에서 그렸습니다. 예시마다 한 줄, 도구마다 한 칸이고, 그림을 누르면 크게 보입니다.

<PicGrid name="side" />

## 다른 도구가 더 맞는 경우

- **더 설치하지 않고 PNG가 필요할 때.** mermaid-cli는 PNG를 바로 씁니다. 대신 한 장에 630ms가 걸리고 Chromium이 필요합니다.
  ursula는 선택 설치 패키지 `@resvg/resvg-js`(약 4MB)를 깔아야 PNG를 씁니다.
- **그림마다 새 프로세스를 띄울 때.** mmdflux와 mermaid-ascii는 9~11ms가 걸립니다. ursula는 103ms가 걸리는데, 그중
  59ms는 빈 Node 스크립트를 실행해도 드는 시간입니다.
- **한 프로그램 안에서 라이브러리를 여러 번 부를 때.** flowchart 한 장을 그리는 데 Pele는 0.015ms,
  beautiful-mermaid의 글자 출력은 0.009ms로 ursula(0.6ms)보다 빠릅니다.
- **터미널로 보낼 그림의 라벨에 이모지가 있을 때.** ursula는 이모지를 한 칸으로 세기 때문에 이모지가 든 그림에서
  선 끊김이 18개 늘었습니다. mmdflux, mermaid-ascii, termaid는 늘어난 끊김이 0개였습니다.

## 직접 재 보기

이 수치를 잰 스크립트는 저장소의 `bench/`에 있습니다. 저장소를 클론한 폴더에서 아래 명령을 실행하면 다른 도구를
`bench/.cache`에 설치하고, 도구마다 그리는 예시 수, 명령 한 번과 라이브러리 호출 한 번의 시간, 넓은 글자 처리를 잽니다.
30분쯤 걸리고, mermaid-cli가 Chromium을 내려받습니다.

```bash
npm run bench:tools
```

아래 명령은 headless Chrome 한 페이지에서 ursula와 Mermaid.js의 시간을 잽니다.

```bash
npm run bench:browser
```

무엇을 재는지, 무엇이 필요한지, Claude Code를 실행해 비용이 드는 스킬 비교를 다시 돌리는 법은
[bench/README.md](https://github.com/yjun1806/ursula-diagram/blob/main/bench/README.md)에 있습니다. 수치가 틀렸거나 도구의 새 버전이 나왔으면 [이슈를 열어 주세요](https://github.com/yjun1806/ursula-diagram/issues/new).
