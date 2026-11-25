# Quick start

Install the `ursula-diagram` command with your package manager (Node 22 or later; `ursula` is a short alias), or run it
once with `npx`:

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
npx ursula-diagram order.mmd --format text   # without installing
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
ursula-diagram order.mmd --format text --width 80   # the text drawing on the home page
ursula-diagram order.mmd --format svg > order.svg   # the picture on the home page
```

To try a text without installing anything, open the [playground](/playground).
