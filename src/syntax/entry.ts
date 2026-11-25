/** How to write one diagram type: a small example the engine draws without error, and the rules that matter most. */
export interface SyntaxEntry {
  /** The name of the front-end that reads this type. */
  name: string;
  /** The headers to show, the usual one first; every one selects this type. */
  headers: string[];
  /** Other headers the front-end also reads; accepted by `syntax <type>` but not listed. */
  aliases?: string[];
  /** What the type is for, in a few words. */
  summary: string;
  /** At most twelve lines, starting with the header. */
  example: string;
  /** At most five short rules. */
  rules: string[];
  /** Words that start a line of this type, for 'did you mean'. */
  keywords: string[];
  /** Indentation carries meaning, so an example line keeps its leading spaces. */
  indented?: true;
}
