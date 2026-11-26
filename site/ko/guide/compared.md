---
aside: false
pageClass: compare-page
---

# 다른 도구와 비교

여기서 비교한 도구 가운데 Mermaid 문서의 예시 531개를 SVG와 터미널 글로 모두 그리는 것은 ursula 하나입니다. 그림 한 장을
명령 한 번으로 그리면 mermaid-cli보다 약 6배 빠르고, 네이티브 글자 그림 도구보다는 약 10배 느립니다. 모델이 배치를 직접
정하는 스킬과 견주면 ursula를 쓴 에이전트가 5~13배 빨리 그렸습니다.

아래 수치는 모두 2026-11-26에 Apple M2 Max 한 대(macOS 26.6, Node 26.12.1)에서 모든 도구에 같은 입력을 주고 잰 값입니다.
비교한 도구의 버전은 mermaid-cli 12.2.0, Mermaid 12.3.0, Pele 1.13.0, beautiful-mermaid 1.1.3, mmdflux 2.6.1,
mermaid-ascii 1.6.2, termaid 0.14.0입니다.

## 손으로 그리는 스킬과 비교

에이전트가 그림을 그리는 방법은 두 가지입니다. 모델이 배치를 정해 SVG를 직접 쓰거나, 모델은 Mermaid만 쓰고 배치는 엔진에
맡깁니다. 같은 그림 세 장을 앞 방식의 스킬인 [diagram-design](https://github.com/cathrynlavery/diagram-design)과 뒤 방식의
ursula 스킬로 각각 그렸습니다.

<FeatureTable name="skill" />

<BenchmarkBars name="skill" />

두 스킬 모두 노드·간선·라벨을 빠짐없이 그렸습니다. diagram-design은 그림마다 배치와 제목, 범례 문구까지 골랐습니다. ursula의
그림은 생김새가 한 가지이고, 바꿀 수 있는 것은 색뿐입니다.

## 그리는 예시 수

<FeatureTable name="coverage" />

## 속도

<BenchmarkBars name="speed" />

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
헤드리스 Chrome에서 그렸습니다.

### flowchart

<div class="compare-pics">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-flowchart-100-subgraphs-2.svg" alt="flowchart: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-flowchart-100-subgraphs-2.svg" alt="flowchart: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-flowchart-100-subgraphs-2.svg" alt="flowchart: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><img src="/compare/beautiful-mermaid-flowchart-100-subgraphs-2.svg" alt="flowchart: beautiful-mermaid" loading="lazy"></div></figure>
</div>

### sequence

<div class="compare-pics">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-sequence-02-with-the-defaults.svg" alt="sequence: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-sequence-02-with-the-defaults.svg" alt="sequence: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-sequence-02-with-the-defaults.svg" alt="sequence: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><img src="/compare/beautiful-mermaid-sequence-02-with-the-defaults.svg" alt="sequence: beautiful-mermaid" loading="lazy"></div></figure>
</div>

### class

<div class="compare-pics">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-class-02-with-the-defaults.svg" alt="class: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-class-02-with-the-defaults.svg" alt="class: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-class-02-with-the-defaults.svg" alt="class: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><img src="/compare/beautiful-mermaid-class-02-with-the-defaults.svg" alt="class: beautiful-mermaid" loading="lazy"></div></figure>
</div>

### ER

<div class="compare-pics compare-pics-large">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-er-02-entity-relationship-diagrams-2.svg" alt="ER: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-er-02-entity-relationship-diagrams-2.svg" alt="ER: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-er-02-entity-relationship-diagrams-2.svg" alt="ER: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><img src="/compare/beautiful-mermaid-er-02-entity-relationship-diagrams-2.svg" alt="ER: beautiful-mermaid" loading="lazy"></div></figure>
</div>

### C4 system context

<div class="compare-pics compare-pics-large">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-c4-02-c4-system-context-diagram.svg" alt="C4 system context: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-c4-02-c4-system-context-diagram.svg" alt="C4 system context: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-c4-02-c4-system-context-diagram.svg" alt="C4 system context: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><span class="none">이 유형을 그리지 않습니다</span></div></figure>
</div>

### pie

<div class="compare-pics">
  <figure><figcaption>ursula</figcaption><div><img src="/compare/ursula-pie-02-example.svg" alt="pie: ursula" loading="lazy"></div></figure>
  <figure><figcaption>Mermaid</figcaption><div><img src="/compare/mermaid-pie-02-example.svg" alt="pie: Mermaid" loading="lazy"></div></figure>
  <figure><figcaption>Pele</figcaption><div><img src="/compare/pele-pie-02-example.svg" alt="pie: Pele" loading="lazy"></div></figure>
  <figure><figcaption>beautiful-mermaid</figcaption><div><span class="none">이 유형을 그리지 않습니다</span></div></figure>
</div>

## 다른 도구가 더 맞는 경우

- **명령줄에서 PNG가 필요할 때.** mermaid-cli는 PNG를 바로 씁니다. 대신 한 장에 630ms가 걸리고 Chromium이 필요합니다.
  ursula에서는 한 파일 HTML 페이지의 버튼으로만 PNG를 저장할 수 있습니다.
- **그림마다 새 프로세스를 띄울 때.** mmdflux와 mermaid-ascii는 9~11ms가 걸립니다. ursula는 103ms가 걸리는데, 그중
  59ms는 빈 Node 스크립트를 실행해도 드는 시간입니다.
- **한 프로그램 안에서 라이브러리를 여러 번 부를 때.** flowchart 한 장을 그리는 데 Pele는 0.015ms,
  beautiful-mermaid의 글자 출력은 0.009ms로 ursula(0.6ms)보다 빠릅니다.
- **터미널로 보낼 그림의 라벨에 이모지가 있을 때.** ursula는 이모지를 한 칸으로 세기 때문에 이모지가 든 그림에서
  선 끊김이 18개 늘었습니다. mmdflux, mermaid-ascii, termaid는 늘어난 끊김이 0개였습니다.
