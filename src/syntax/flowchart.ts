import type { SyntaxEntry } from './entry.ts';

export const flowchart: SyntaxEntry = {
  name: "flowchart",
  headers: ["flowchart", "graph", "swimlane-beta"],
  summary: "steps and decisions; swimlanes by owner",
  example: `flowchart LR
  start([Order placed]) --> pay{Paid?}
  pay -->|yes| pick[Pick items]
  pay -->|no| remind[Send reminder]
  remind -.-> pay
  subgraph wh[Warehouse]
    pick --> ship([Ship])
  end`,
  rules: [
    "A box is an id and its text: A[box], A(round), A([start]), A{decision}, A((circle)).",
    "Lines: --> arrow, --- plain, -.-> dotted, ==> thick; A -->|text| B labels a line.",
    "subgraph id[Title] ... end groups boxes; with 'swimlane-beta LR' each subgraph is a lane.",
    "The direction follows the header: LR, RL, TD (or TB), BT.",
    "Quote text that holds brackets or punctuation: A[\"a (b)\"]; <br> breaks a line.",
  ],
  keywords: ["flowchart", "graph", "subgraph", "end", "direction", "classDef", "class", "style", "click", "linkStyle"],
};
