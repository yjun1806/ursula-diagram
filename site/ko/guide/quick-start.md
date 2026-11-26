---
description: 'Mermaid CLI ursula-diagram을 npm, pnpm, bun으로 설치하거나(Node 22 이상) npx로 실행해, Mermaid 다이어그램을 SVG나 터미널 글자 그림으로 그립니다.'
---

# 빠른 시작

사용하는 패키지 매니저로 `ursula-diagram` 명령을 설치합니다(Node 22 이상, 짧은 이름 `ud`와 `ursula`도 함께 설치됩니다). 설치하지 않고 한 번만 쓰려면 `npx ursula-diagram`을 씁니다. `npx ud`는 안 됩니다. npx는 짧은 이름을 패키지 이름으로 찾는데, npm에는 `ud`라는 다른 패키지가 있습니다.

::: code-group

```bash [npm]
npm install -g ursula-diagram
```

```bash [pnpm]
pnpm add -g ursula-diagram
```

```bash [bun]
bun add -g ursula-diagram
```

```bash [npx]
npx ursula-diagram order.mmd --format text
```

:::

첫 화면의 flowchart를 `order.mmd`에 씁니다.

```bash
cat > order.mmd <<'EOF'
flowchart LR
  order([Order placed]) --> pay{Paid?}
  pay -->|yes| pick[Pick items]
  pay -->|no| remind[Send reminder]
  remind --> pay
  pick --> ship([Ship])
EOF
```

그다음 그립니다. `text`는 첫 화면의 글자 그림을 80칸 폭으로 출력하고, `svg`는 첫 화면의 그림을 파일로 저장합니다.

::: code-group

```bash [text]
ursula-diagram order.mmd --format text --width 80
```

```bash [svg]
ursula-diagram order.mmd --format svg > order.svg
```

:::

설치하지 않고 글을 그려 보려면 [플레이그라운드](/ko/playground)를 엽니다.

## 업데이트

`update`는 npm 레지스트리에 최신 버전을 묻고, ursula-diagram을 설치한 방법(npm·pnpm·bun 전역, 프로젝트, 에이전트 스킬)에
맞는 설치 명령을 출력합니다. 스스로는 아무것도 바꾸지 않고, 새 버전이 나와 있으면 코드 1로 끝납니다.

<!-- exit 1 -->

```bash
ursula-diagram update
```

`--yes`를 붙이면 npm·pnpm·bun 전역 설치일 때 그 명령까지 실행합니다. 짧은 이름으로도 똑같이 됩니다.

```bash
ud update --yes
```

네트워크를 쓰는 명령은 `update` 하나뿐입니다. 레지스트리의 답을 5초 기다리고, 답이 없으면 코드 5로 끝납니다. 그림을 그릴 때는 네트워크를 쓰지 않습니다.

## Mermaid 판

문법은 2026년 11월 12일에 공개된 Mermaid 문서(`develop` 브랜치, 커밋 `ddb4c118`)를 따릅니다. 그날 기준 Mermaid의 최신
정식판은 12.3.0, 최신 미리보기판은 13.0.0-alpha.3입니다. 그 뒤에 Mermaid에 추가된 문법은 아직 읽지 못할 수 있습니다.
유형별 짧은 예시는 `ursula-diagram syntax <유형>`으로 볼 수 있습니다.
