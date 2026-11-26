import { OPTIONS } from './args.ts';

const optionLines = OPTIONS.map((o) => {
  const head = `${o.name}${o.value === undefined ? '' : ` ${o.value}`}`;
  return `  ${head.padEnd(16)}  ${o.help}`;
});

export const HELP = `ursula-diagram: draw Mermaid text as a terminal drawing, an SVG or one HTML file.

Usage
  ursula-diagram [file.mmd] [options]   reads standard input when no file is given
  ursula-diagram syntax [type]          an example and the rules of a diagram type
  ursula-diagram mcp                    serve render, check and syntax over MCP (stdio)

Examples
  ursula-diagram flow.mmd --format text --width 100
  ursula-diagram flow.mmd --format svg --check > flow.svg
  ursula-diagram flow.mmd --format html --title "Order flow" > flow.html
  ursula-diagram flow.mmd --format png --theme dark > flow.png
  ursula-diagram syntax wardley

Which format
  text      a real terminal (fixed-width font, wide characters take two cells)
  text-svg  the terminal drawing for a chat window, a web page or a document
  svg       a picture for a document or a page; follows light and dark
  html      one file to open, switch light and dark, and save a PNG
  png       an image file, in the colours of --theme; needs the optional
            package @resvg/resvg-js (npm i -g @resvg/resvg-js)
  json      boxes, lines and labels with coordinates, for a program
  check     the engine's report on the svg layout, without the drawing; a
            terminal drawing routes its lines on its own grid and can differ
  fixed     the text with the fixes of --fix made, to save in place of it

Options
${optionLines.join('\n')}
  -h, --help        this text

Errors
  A text error names the line and column, and often adds 'did you mean' and an
  example line. Fix the text and run again; 'syntax <type>' shows the grammar.
  --fix makes the fixes that have one reading and names each on stderr, such as
  'fixed: line 1: flowchrt → flowchart'; make the same change in your text.

Exit codes
  0 drawn   1 the text has an error   2 wrong options   3 too narrow   4 engine failure
`;
