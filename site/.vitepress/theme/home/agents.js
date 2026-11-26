// The steps of the agent's loop on the home page: the commands and what they print, pasted from the command run on the
// hero's text (order.mmd) or on the broken text shown. Only the syntax output is shortened, where '...' stands.

export const CARDS = [
  {
    id: 'check',
    commands: ['ursula-diagram order.mmd --format svg --check > order.svg'],
    output: 'composition lanes · bends 5 · crossings 1',
  },
  {
    id: 'errors',
    commands: ["printf 'flowchrt LR\\n A-->B\\n' | ursula-diagram --format text"],
    output: `error: line 1: expected a 'flowchart' or 'graph' header
  1 | flowchrt LR
    | ^^^^^^^^
did you mean: flowchart
example: flowchart LR`,
  },
  {
    id: 'lines',
    commands: ['ursula-diagram order.mmd --format check'],
    output: `composition lanes · bends 5 · crossings 1
crossing: pay --> remind (line 4) crosses remind --> pay (line 5)
bends: remind --> pay (line 5) 3, pay --> pick (line 3) 2`,
  },
  {
    id: 'syntax',
    commands: ['ursula-diagram syntax sequence'],
    output: `sequenceDiagram: messages between participants over time.

sequenceDiagram
  actor U as User
  participant A as App
  U->>A: Tap pay
  ...
- A->>B: text is a call, A-->>B: text a reply; ...`,
  },
  {
    id: 'everywhere',
    commands: ['npx skills add yjun1806/ursula-diagram', 'claude mcp add ursula -- npx -y ursula-diagram mcp'],
    output: '',
  },
  {
    id: 'same',
    commands: ['ursula-diagram order.mmd > a.svg; ursula-diagram order.mmd > b.svg; cmp a.svg b.svg && echo same'],
    output: 'same',
  },
];

// Seconds and total tokens per drawing: the least and the most of 6 runs (3 texts, 2 runs each) per skill.
export const MEASURE = [
  { seconds: [12, 18], tokens: '38k–64k', ours: true },
  { seconds: [65, 174], tokens: '330k–672k', ours: false },
];
export const MEASURE_SCALE = 180;
