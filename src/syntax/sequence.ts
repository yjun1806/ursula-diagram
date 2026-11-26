import type { SyntaxEntry } from './entry.ts';

export const sequence: SyntaxEntry = {
  name: "sequence",
  headers: ["sequenceDiagram"],
  summary: "messages between participants over time",
  example: `sequenceDiagram
  actor U as User
  participant A as App
  participant S as Server
  U->>A: Tap pay
  A->>+S: POST /pay
  S-->>-A: 200 OK
  alt declined
    A-->>U: Show error
  else paid
    A-->>U: Show receipt
  end`,
  rules: [
    "participant X as Name (or actor) declares in order; undeclared names appear when first used.",
    "A->>B: text is a call, A-->>B: text a reply; -) is async, -x a lost message.",
    "+ and - after the arrow (A->>+B, B-->>-A) start and end an activation.",
    "Blocks: alt/else, opt, loop, par/and, critical, break, each closed by end.",
    "Note right of A: text, or Note over A,B: text.",
  ],
  keywords: ["participant", "actor", "alt", "else", "opt", "loop", "par", "and", "critical", "option", "break", "rect", "end", "Note", "note", "activate", "deactivate", "autonumber", "box", "create", "destroy", "title"],
};
