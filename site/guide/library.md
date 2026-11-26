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

`spansToAnsi` writes one line of spans with ANSI colour codes, as `--color` does.

## PNG

`ursula-diagram/png` draws a PNG in Node with the optional package `@resvg/resvg-js`, installed beside
`ursula-diagram`. The main entrance never loads it, and a browser has no use for it.

```ts
import { renderPng } from 'ursula-diagram/png';

const png = await renderPng(src, { theme: 'dark', scale: 2 }); // Uint8Array
```

Without the package the promise rejects with `PngRendererMissing`, whose message is the command that installs it.

A missing font does not reject the promise. When the machine has no font at all, or none with the Korean, Chinese or
Japanese characters of the drawing, the PNG is drawn without that text and `onWarning` is called with one line that
says so:

```ts
const png = await renderPng(src, { onWarning: (message) => console.warn(message) });
```

`fontDirs` names more folders of fonts besides those of the system.

## Options

`renderText`, `renderTextSpans` and `renderTextSvg` take the options of the command as a third argument: `charset`
(`'unicode'` or `'ascii'`), `detail`, `quality`, `engine`, `composition`, and `legend`, `questions` and `elbows` (each
`false` for the `--no-` option). `render` takes `title`, `legend` and `maxWidth`; `renderHtml` takes `title`, `theme`
and `maxWidth`.

## Errors and fixes

A text that cannot be drawn comes back from `renderText`, `renderTextSpans` and `renderTextSvg` as
`{ error, line, column, hint, suggestion, example }`, every field but `error` only when known. `render` throws a
`UrsulaError` with the same fields. `fixSource` makes the fixes of `--fix` and returns the fixed text with the list of
fixes, each with `line`, `from`, `to` and `reason`:

```ts
import { fixSource, renderText } from 'ursula-diagram';

const { source, fixes } = fixSource('flowchrt LR\n  A -> B');
const text = renderText(source, 80);
```

`syntaxTypes()` lists the names of the types, as `ursula-diagram syntax` does, and `syntaxOf(type)` returns the
entry of a name or a header (`name`, `headers`, `summary`, `example`, `rules`), or `undefined`.

The package also exports the stages under these functions (`parse`, `layout`, `renderSvg`, `renderTextLayout` and
others) for tools built on the engine; `dist/index.d.ts` lists them with their types.

## In a browser

`ursula-diagram/global` is the engine as one file for a `<script>` tag; everything the package exports, and
`renderHtml`, is under the global `ursula`. The [playground](/playground) runs this file.

```html
<script src="node_modules/ursula-diagram/dist/ursula.global.js"></script>
<script>
  const svg = ursula.render('flowchart LR\n  A --> B');
</script>
```
