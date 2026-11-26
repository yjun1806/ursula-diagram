---
description: 'Change the colours of a Mermaid SVG drawn by ursula: every colour is a CSS variable with a light and a dark value, so the drawing follows its page.'
---

# Colours

An SVG drawing reads every colour from a CSS variable and carries the value as a fallback, so it looks right on its
own and follows a page that sets the variables. Each has a light and a dark value; the dark one applies under
`prefers-color-scheme: dark`.

```css
:root {
  --ursula-accent: #0b6e4f;
  --ursula-start-fill: #bfe3d0;
}
```

<ColourTable />
