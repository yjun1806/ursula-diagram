# 빠른 시작

쓰는 패키지 매니저로 `ursula-diagram` 명령을 설치합니다(Node 22 이상, 짧은 별칭 `ursula`도 함께 깔립니다). 설치하지 않고 한 번만 쓰려면 `npx ursula-diagram`을 씁니다.

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
npx ursula-diagram order.mmd --format text   # 설치하지 않고
```

:::

```bash
cat > order.mmd <<'EOF'
flowchart LR
  order([Order placed]) --> pay{Paid?}
  pay -->|yes| pick[Pick items]
  pay -->|no| remind[Send reminder]
  remind --> pay
  pick --> ship([Ship])
EOF
ursula-diagram order.mmd --format text --width 80   # 첫 화면의 글자 그림
ursula-diagram order.mmd --format svg > order.svg   # 첫 화면의 그림
```

설치하지 않고 글을 그려 보려면 [플레이그라운드](/ko/playground)를 엽니다.

## Mermaid 판

문법은 2026년 11월 12일에 공개된 Mermaid 문서(`develop` 브랜치, 커밋 `ddb4c118`)를 따릅니다. 그날 기준 Mermaid의 최신
정식판은 12.3.0, 최신 미리보기판은 13.0.0-alpha.3입니다. 그 뒤에 Mermaid에 더해진 문법은 아직 읽지 못할 수 있습니다.
유형마다 짧은 예시는 `ursula-diagram syntax <유형>`으로 볼 수 있습니다.
