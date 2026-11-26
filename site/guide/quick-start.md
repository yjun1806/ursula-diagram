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
npx ursula-diagram order.mmd --format text
```

:::

Write the flowchart of the home page into `order.mmd`:

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

Then draw it: `text` prints the terminal drawing of the home page, 80 columns wide, and `svg` saves its picture.

::: code-group

```bash [text]
ursula-diagram order.mmd --format text --width 80
```

```bash [svg]
ursula-diagram order.mmd --format svg > order.svg
```

:::

To try a text without installing anything, open the [playground](/playground).

## Mermaid version

The syntax follows the Mermaid documentation as published on 12 November 2026 (the `develop` branch, commit
`ddb4c118`). On that date the latest Mermaid release was 12.3.0 and the latest preview 13.0.0-alpha.3. Syntax that
Mermaid adds after that date may not be read yet. Run `ursula-diagram syntax <type>` for a short example of any type.
