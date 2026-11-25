# Library

```ts
import { render, renderText, renderTextSvg } from 'ursula-diagram';
import { renderHtml } from 'ursula-diagram/html';

const src = `flowchart LR
  A[Start] --> B{Ok?}
  B -->|yes| C[Done]
  B -->|no| A`;

const svg = render(src);                 // string of inline SVG
const text = renderText(src, 80);        // { lines: string[] } or { error: string }
const ascii = renderText(src, 80, { charset: 'ascii' });
const picture = renderTextSvg(src, 80);  // { svg: string } or { error: string }
const page = renderHtml(src, { title: 'Flow' });
```

`render` throws an `UrsulaError` with a message for the writer when the text cannot be drawn. `renderText` returns
the message as `{ error }`, also when the drawing does not fit the width: it never cuts a drawing off.

`renderTextSpans` returns the same lines as spans with a tone (`normal`, `dim`, `bold`, `accent`), for a host that
colours terminal text itself. `spansToSvg` draws such lines as the picture `renderTextSvg` returns, and `toAscii`
replaces the drawing characters of lines already drawn; give it `{ countBars: true }` for the lines of an
entity-relationship drawing, so that the bars of its counts on upright lines become `-`.

## In a browser

`ursula-diagram/global` is the engine as one file for a `<script>` tag; everything the package exports, and
`renderHtml`, is under the global `ursula`. The [playground](/playground) runs this file.

```html
<script src="node_modules/ursula-diagram/dist/ursula.global.js"></script>
<script>
  const svg = ursula.render('flowchart LR\n  A --> B');
</script>
```
