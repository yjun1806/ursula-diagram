import { cellWidth } from '../metrics.ts';
import { cut } from '../text/terminal.ts';
import { wrapWords } from '../text/wrap.ts';
import type { Node, Railroad } from './model.ts';

const quote = (text: string): string => (text.includes('"') && !text.includes("'") ? `'${text}'` : `"${text}"`);

/** Binding strength: 0 choice, 1 sequence, 2 exception, 3 a single element. */
function strength(node: Node): number {
  switch (node.k) {
    case 'choice':
      return 0;
    case 'seq':
      return 1;
    case 'except':
      return 2;
    default:
      return 3;
  }
}

function wrapped(node: Node, text: string, need: number): string {
  return strength(node) < need ? `( ${text} )` : text;
}

/** A node written in one line of EBNF: quoted terminals, `|`, `?` `*` `+`, `{n,m}` for counts, `!` and `&` for lookahead. */
export function ebnf(node: Node): string {
  switch (node.k) {
    case 'terminal':
      return quote(node.text);
    case 'nonterminal':
      return node.name;
    case 'special':
      return node.text === '.' || node.text.startsWith('<') ? node.text : `? ${node.text} ?`;
    case 'seq':
      return wrapped(node, node.items.map((n) => wrapped(n, ebnf(n), 2)).join(' '), 1);
    case 'choice':
      return node.items.map(ebnf).join(node.ordered === true ? ' / ' : ' | ');
    case 'optional':
      return strength(node.item) === 3 ? `${ebnf(node.item)}?` : `[ ${ebnf(node.item)} ]`;
    case 'repeat': {
      const item = wrapped(node.item, ebnf(node.item), 3);
      if (node.max === null) return `${item}${node.min === 0 ? '*' : node.min === 1 ? '+' : `{${node.min},}`}`;
      return `${item}{${node.min === node.max ? node.min : `${node.min === 0 ? '' : node.min},${node.max}`}}`;
    }
    case 'predicate':
      return `${node.op === 'not' ? '!' : '&'}${wrapped(node.item, ebnf(node.item), 3)}`;
    case 'except':
      return `${wrapped(node.item, ebnf(node.item), 3)} - ${wrapped(node.except, ebnf(node.except), 3)}`;
  }
}

/** One line per rule as `name = definition ;`; a line wider than `maxWidth` breaks at the `|` of its choice, then at spaces. */
export function railroadTextLines(model: Railroad, maxWidth: number | undefined): string[] {
  const head = model.title === undefined ? [] : [maxWidth === undefined ? model.title : cut(model.title, maxWidth)];
  const rows = model.rules.flatMap((rule) => {
    const first = `${rule.name} = `;
    const whole = `${first}${ebnf(rule.body)} ;`;
    if (maxWidth === undefined || cellWidth(whole) <= maxWidth) return [whole];
    const pieces = rule.body.k === 'choice' ? rule.body.items.map(ebnf) : [ebnf(rule.body)];
    const lead = ' '.repeat(cellWidth(rule.name));
    return pieces.flatMap((piece, i) => {
      const prefix = i === 0 ? first : `${lead} ${rule.body.k === 'choice' && rule.body.ordered === true ? '/' : '|'} `;
      const room = Math.max(1, maxWidth - cellWidth(prefix));
      const body = i === pieces.length - 1 ? `${piece} ;` : piece;
      return wrapWords(body, room, cellWidth, { blank: true }).map((l, j) => (j === 0 ? prefix : ' '.repeat(cellWidth(prefix))) + l);
    });
  });
  return [...head, ...rows];
}

