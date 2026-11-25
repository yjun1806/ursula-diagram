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

<details>
<summary>All colour variables</summary>

| Variable | What it colours | Light | Dark |
| --- | --- | --- | --- |
| `--ursula-fg` | Names and body text | `#201f1e` | `#efeeec` |
| `--ursula-muted` | Second lines and labels | `#5b5b59` | `#b2b1af` |
| `--ursula-faint` | Text and marks that stand back | `#878685` | `#757472` |
| `--ursula-line` | A line between boxes | `#565554` | `#a5a4a2` |
| `--ursula-border` | The outline of a box | `#484846` | `#bebdbb` |
| `--ursula-hair` | Zone outlines, rules and grid lines | `#e2e1e0` | `#2c2b2a` |
| `--ursula-surface` | The face of a box and of the page | `#fcfcfa` | `#171614` |
| `--ursula-lane` | Filled bands: lanes, zones, head bands, tags | `#efeeed` | `#252422` |
| `--ursula-chip-fill` | Label chips and notes | `#f1f0ef` | `#252422` |
| `--ursula-accent` | The accent as a stroke or a text | `#82641c` | `#dab975` |
| `--ursula-start-fill` | The face of a start box and of the highest bar | `#e5c37a` | `#dab975` |
| `--ursula-accent-tint` | A pale accent face | `#f6ecd7` | `#372c15` |
| `--ursula-on-accent` | Text on the face of a start box | `#201f1e` | `#171614` |
| `--ursula-bg` | The background of flowchart, class, state, ER, requirement, C4 and use case drawings | `transparent` | `transparent` |
| `--ursula-panel` | The panel behind a chart | `none` | `none` |
| `--ursula-bar` | A neutral bar of a chart | `#c8c7c6` | `#434241` |
| `--ursula-tint-outer` | The outermost boundary of a C4 drawing | `#f4f3f1` | `#1e1d1b` |
| `--ursula-tint-inner` | The innermost boundary of a C4 drawing | `#f6f5f3` | `#1c1b19` |
| `--ursula-tint-chip` | A label chip on a boundary fill | `#ebeae8` | `#262523` |
| `--ursula-s1` … `--ursula-s8` | The eight series of a chart | | |
| `--ursula-s1-tint` … `--ursula-s8-tint` | The pale area fill of each series | | |

</details>
