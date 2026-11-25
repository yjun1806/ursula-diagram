# 빠른 시작

npm으로 `ursula-diagram` 명령을 설치합니다(Node 22 이상, 짧은 별칭 `ursula`도 함께 깔립니다). 설치하지 않고 한 번만 쓰려면 `npx ursula-diagram`을 씁니다.

```bash
npm install -g ursula-diagram
npx ursula-diagram order.mmd --format text   # 설치하지 않고
```

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
