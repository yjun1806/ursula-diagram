import { cellWidth } from '../metrics.ts';
import { cut, spansOf } from '../text/terminal.ts';
import type { TextSpan } from '../types.ts';
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

/** A line of a rule: `prefix` written as the rule name (bold) and the rest of it dim, then `body`, its closing `;` dim. */
function ruleLine(name: string, prefix: string, body: string, closes: boolean): TextSpan[] {
  const named = prefix.startsWith(name) ? name : '';
  const end = closes && body.endsWith(';') ? body.length - 1 : body.length;
  return spansOf([named, 'bold'], [prefix.slice(named.length), 'dim'], body.slice(0, end), [body.slice(end), 'dim']);
}

/**
 * One line per rule as `name = definition ;`; a line wider than `maxWidth` breaks at the `|` of its choice, then at
 * spaces. The title and the rule names are bold; `=`, the `|` that starts a broken line and `;` are dim.
 */
export function railroadTextSpans(model: Railroad, maxWidth: number | undefined): TextSpan[][] {
  const head = model.title === undefined ? [] : [spansOf([maxWidth === undefined ? model.title : cut(model.title, maxWidth), 'bold'])];
  const rows = model.rules.flatMap((rule) => {
    const first = `${rule.name} = `;
    const whole = `${first}${ebnf(rule.body)} ;`;
    if (maxWidth === undefined || cellWidth(whole) <= maxWidth) return [ruleLine(rule.name, first, `${ebnf(rule.body)} ;`, true)];
    const pieces = rule.body.k === 'choice' ? rule.body.items.map(ebnf) : [ebnf(rule.body)];
    const lead = ' '.repeat(cellWidth(rule.name));
    return pieces.flatMap((piece, i) => {
      const prefix = i === 0 ? first : `${lead} ${rule.body.k === 'choice' && rule.body.ordered === true ? '/' : '|'} `;
      const room = Math.max(1, maxWidth - cellWidth(prefix));
      const last = i === pieces.length - 1;
      const body = last ? `${piece} ;` : piece;
      const wrapped = wrapWords(body, room, cellWidth, { blank: true });
      return wrapped.map((l, j) => ruleLine(rule.name, j === 0 ? prefix : ' '.repeat(cellWidth(prefix)), l, last && j === wrapped.length - 1));
    });
  });
  return [...head, ...rows];
}

