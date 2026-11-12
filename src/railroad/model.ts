/** The notations the railroad front-end reads; `ir` is the explicit constructor form. */
export type Notation = 'ir' | 'ebnf' | 'abnf' | 'peg';

/** One grammar expression. Every notation is read into this one model. */
export type Node =
  | { k: 'terminal'; text: string }
  | { k: 'nonterminal'; name: string }
  /** A special sequence (`? text ?`, `<prose>`) or the any-character dot of a parsing grammar. */
  | { k: 'special'; text: string }
  | { k: 'seq'; items: Node[] }
  | { k: 'choice'; items: Node[] }
  | { k: 'optional'; item: Node }
  /** `min` times at least, `max` times at most (`null`: no limit). Never 1..1 and never 0..1: those are the item and `optional`. */
  | { k: 'repeat'; item: Node; min: number; max: number | null }
  /** A lookahead that consumes nothing: `&` (and) or `!` (not). */
  | { k: 'predicate'; op: 'and' | 'not'; item: Node }
  /** `item - except`: matches `item` but not `except`. */
  | { k: 'except'; item: Node; except: Node };

export interface Rule {
  name: string;
  body: Node;
  line: number;
}

export interface Railroad {
  notation: Notation;
  title?: string;
  /** The `accTitle` line; the SVG title. */
  accTitle?: string;
  rules: Rule[];
}
