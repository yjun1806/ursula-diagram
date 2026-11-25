import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellWidth, renderText, renderTextSpans, toAscii } from '../src/index.ts';

const root = new URL('..', import.meta.url).pathname;
const NOT_ASCII_DRAWING = /[\u2190-\u21ff\u2500-\u25ff]/;

describe('the ASCII character set', () => {
  it('draws light, heavy and dashed lines with different characters', () => {
    expect(toAscii(['┌──┐ ┏━━┓ ┄┄ ╌╌', '│  │ ┃  ┃ ┆  ╎', '└──┘ ┗━━┛'])).toEqual(['+--+ #==# .. ..', '|  | #  # :  :', '+--+ #==#']);
  });

  it('keeps arrowheads, dots and marks apart', () => {
    expect(toAscii(['──▶ ◀── ▲ ▼ ● ◉ ◆ ◇ ○ ⊕ █ ╭─╮ ╰─╯'])).toEqual(['--> <-- ^ v * @ * o O @ # /-\\ \\-/']);
  });

  it('gives a hollow head a bar in the cell behind it', () => {
    expect(toAscii(['───▷│', '│◁───', '│◁┘'])).toEqual(['--|>|', '|<|--', '|<|']);
    expect(toAscii(['△', '│', '│', '▽'])).toEqual(['^', '-', '-', 'v']);
    expect(toAscii(['한│', '글▽'])).toEqual(['한-', '글v']);
  });

  it('draws the bar of a count on an upright line as a bar, and a crossing as a crossing', () => {
    expect(toAscii(['└─┬─┘', '  ┼', '  ┼┌─', '  ││', '  o┼', '  ^^', '┌────┐'])).toEqual(['+-+-+', '  -', '  -+-', '  ||', '  o-', '  ^^', '+----+']);
    expect(toAscii(['└──┘', ' ┼┼', ' ┼┼', ' ││'])).toEqual(['+--+', ' --', ' --', ' ||']);
    expect(toAscii([' │', ' ┼ a', ' ▼', '─┼─'])).toEqual([' |', ' + a', ' v', '-+-']);
  });

  it('leaves the text of the diagram as it is', () => {
    expect(toAscii(['│ 주문 접수 «x» │'])).toEqual(['| 주문 접수 «x» |']);
  });

  const examples = readdirSync(`${root}examples`).filter((f) => f.endsWith('.mmd'));
  it.each(examples)('draws %s with as many rows and columns as the default', (name) => {
    const src = readFileSync(`${root}examples/${name}`, 'utf8');
    const plain = renderText(src, 100);
    const ascii = renderText(src, 100, { charset: 'ascii' });
    if ('error' in plain || 'error' in ascii) throw new Error('not drawn');
    expect(ascii.lines.map(cellWidth)).toEqual(plain.lines.map(cellWidth));
    expect(ascii.lines.filter((line) => NOT_ASCII_DRAWING.test(line))).toEqual([]);
    const spans = renderTextSpans(src, 100, { charset: 'ascii' });
    if ('error' in spans) throw new Error('not drawn');
    expect(spans.lines.map((line) => line.map((s) => s.text).join(''))).toEqual(ascii.lines);
  });
});
