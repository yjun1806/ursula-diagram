// Hints for the errors whose message does not say how to fix them. A hint names what is wrong; the example, when
// given, is a line written the right way that can stand in for the wrong one.

interface Hint {
  frontEnd: string;
  pattern: RegExp;
  hint: string;
  example?: string;
}

const HINTS: readonly Hint[] = [
  { frontEnd: 'flowchart', pattern: /^expected a node id near ''/, hint: 'an arrow needs a node on both ends', example: 'A --> B' },
  { frontEnd: 'flowchart', pattern: /^missing '([\])}>])'/, hint: 'a bracket around the text of a node is opened and not closed', example: 'A[Text] --> B(Text)' },
  { frontEnd: 'flowchart', pattern: /^subgraph '.*' is never closed/, hint: "close every subgraph with a line 'end'", example: 'end' },
  { frontEnd: 'flowchart', pattern: /^'end' without a matching 'subgraph'/, hint: "this 'end' has no 'subgraph' above it" },
  { frontEnd: 'state', pattern: /^a transition needs a state on both sides/, hint: 'a transition names a state on each side of -->', example: 'A --> B : event' },
  { frontEnd: 'sequence', pattern: /^message needs a sender and a receiver|^unsupported syntax/, hint: 'a message is written Sender->>Receiver: text', example: 'Alice->>Bob: Hello' },
  { frontEnd: 'class', pattern: /^Unrecognized class diagram statement/, hint: 'a line is a class, a relation such as A <|-- B, or a member such as A : +name' },
  { frontEnd: 'er', pattern: /^Cannot read "/, hint: 'a relation is A ||--o{ B : label, and the label is required', example: 'CUSTOMER ||--o{ ORDER : places' },
  { frontEnd: 'c4', pattern: /^cannot read '|^unclosed quote/, hint: 'an element is Name(alias, "Label", "text") with every bracket and quote closed' },
  { frontEnd: 'gantt', pattern: /^Cannot read ".*"; a task/, hint: 'a task has a name, a colon, then its start and end or length', example: 'Task : 2024-01-01, 3d' },
  { frontEnd: 'wardley', pattern: /^Unrecognised line/, hint: 'a line starts with title, anchor, component, evolve, pipeline or note, or is a link A -> B' },
  { frontEnd: 'quadrant', pattern: /^Unrecognised line/, hint: 'a point is Name: [x, y]; other lines start with title, x-axis, y-axis or quadrant-1..4' },
  { frontEnd: 'mindmap', pattern: /^A mindmap has one root/, hint: 'indent every node below the root further than the root' },
  { frontEnd: 'treeview', pattern: /indented .* below the line above/, hint: 'indent an item one step deeper than the line above it, not more' },
  { frontEnd: 'timeline', pattern: /^An event line needs a time period/, hint: 'an event follows a period: the first line of a period is period : event', example: '2024 : Launch' },
  { frontEnd: 'ishikawa', pattern: /is indented less than the categories/, hint: 'indent categories one step under the effect, and causes further under their category' },
];

/** The hint for an error of this front-end with this message (without `line N: `), if the table has one. */
export function hintFor(frontEnd: string, message: string): { hint: string; example?: string } | undefined {
  const found = HINTS.find((h) => h.frontEnd === frontEnd && h.pattern.test(message));
  return found === undefined ? undefined : { hint: found.hint, ...(found.example === undefined ? {} : { example: found.example }) };
}
