import type { SyntaxEntry } from './entry.ts';

export const state: SyntaxEntry = {
  name: "state",
  headers: ["stateDiagram-v2"],
  aliases: ["stateDiagram"],
  summary: "states and what moves between them",
  example: `stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> Paused : pause
  Paused --> Running : resume
  Running --> Done : finish
  Done --> [*]`,
  rules: [
    "A --> B : text is a transition; [*] is the start or the end.",
    "state Busy { ... } nests states; state \"Long name\" as L names one.",
    "state Fork <<fork>>, <<join>>, <<choice>> make the special states.",
    "note right of A : text, or note left of A ... end note.",
    "direction LR inside the diagram turns it sideways.",
  ],
  keywords: ["state", "note", "end", "direction", "classDef", "class", "style"],
};
