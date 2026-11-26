// Hints for the errors whose message does not say how to fix them. A hint names what is wrong; the example, when
// given, is a line written the right way that can stand in for the wrong one, or the line to add.

interface Hint {
  frontEnd: string;
  pattern: RegExp;
  hint?: string;
  /** A fixed example line. */
  example?: string;
  /** The wrong line itself, put right; wins over `example`. */
  fix?: (row: string) => string;
  /** The fix is to delete the line, so no line can stand in for it. */
  noExample?: true;
}

/** What the table says about one error: a hint, an example, or that no example fits. */
export interface HintFound {
  hint?: string;
  example?: string;
  noExample?: true;
}

const HINTS: readonly Hint[] = [
  { frontEnd: 'flowchart', pattern: /^expected a node id near ''/, hint: 'an arrow needs a node on both ends', example: 'A --> B' },
  { frontEnd: 'flowchart', pattern: /^missing '([\])}>])'/, hint: 'a bracket around the text of a node is opened and not closed', example: 'A[Text] --> B(Text)' },
  { frontEnd: 'flowchart', pattern: /^subgraph '.*' is never closed/, hint: "close every subgraph with a line 'end'", example: 'end' },
  { frontEnd: 'flowchart', pattern: /^'end' without a matching 'subgraph'/, hint: "this 'end' has no 'subgraph' above it; delete it, or open the subgraph above", noExample: true },
  { frontEnd: 'state', pattern: /^"\{" is never closed/, hint: "close the block of this state with a line '}' after its last line", example: '}' },
  { frontEnd: 'state', pattern: /^a transition needs a state on both sides/, hint: 'a transition names a state on each side of -->', example: 'A --> B : event' },
  { frontEnd: 'sequence', pattern: /^'\w+' block is never closed/, hint: "close the block with a line 'end' after its last message", example: 'end' },
  { frontEnd: 'sequence', pattern: /^'end' without an open block/, hint: "this 'end' closes no loop, alt, opt, par, critical, break or rect; delete it, or open the block above", noExample: true },
  { frontEnd: 'sequence', pattern: /^message needs a sender and a receiver|^unsupported syntax/, hint: 'a message is written Sender->>Receiver: text', example: 'Alice->>Bob: Hello' },
  { frontEnd: 'class', pattern: /^Unrecognized class diagram statement/, hint: 'a line is a class, a relation such as A <|-- B, or a member such as A : +name' },
  { frontEnd: 'er', pattern: /^Cannot read "/, hint: 'a relation is A ||--o{ B : label, and the label is required', example: 'CUSTOMER ||--o{ ORDER : places' },
  { frontEnd: 'c4', pattern: /^cannot read '|^unclosed quote/, hint: 'an element is Name(alias, "Label", "text") with every bracket and quote closed' },
  { frontEnd: 'gantt', pattern: /^Cannot read ".*"; a task/, hint: 'a task has a name, a colon, then its start and end or length', example: 'Task : 2024-01-01, 3d' },
  { frontEnd: 'railroad', pattern: /^The rule ".*" does not end with ";"/, fix: (row) => `${row.trim()} ;` },
  { frontEnd: 'wardley', pattern: /^Unrecognised line/, hint: 'a line starts with title, anchor, component, evolve, pipeline or note, or is a link A -> B' },
  { frontEnd: 'quadrant', pattern: /^Unrecognised line/, hint: 'a point is Name: [x, y]; other lines start with title, x-axis, y-axis or quadrant-1..4' },
  { frontEnd: 'mindmap', pattern: /^A mindmap has one root/, hint: 'indent every node below the root further than the root' },
  { frontEnd: 'treeview', pattern: /indented .* below the line above/, hint: 'indent an item one step deeper than the line above it, not more' },
  { frontEnd: 'timeline', pattern: /^An event line needs a time period/, hint: 'an event follows a period: the first line of a period is period : event', example: '2024 : Launch' },
  { frontEnd: 'ishikawa', pattern: /is indented less than the categories/, hint: 'indent categories one step under the effect, and causes further under their category' },
];

/** The hint for an error of this front-end with this message (without `line N: `) on `row`, if the table has one. */
export function hintFor(frontEnd: string, message: string, row: string | undefined): HintFound | undefined {
  const found = HINTS.find((h) => h.frontEnd === frontEnd && h.pattern.test(message));
  if (found === undefined) return undefined;
  const example = found.fix !== undefined && row !== undefined ? found.fix(row) : found.example;
  return {
    ...(found.hint === undefined ? {} : { hint: found.hint }),
    ...(example === undefined ? {} : { example }),
    ...(found.noExample ? { noExample: true as const } : {}),
  };
}
