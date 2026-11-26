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

// Seconds and total tokens per drawing: the least and the most of 6 runs (3 texts, 2 runs each) per skill. split is
// where those seconds went, the least and the most per run, from the stream of each run (bench/agent-skill/breakdown.py):
// waiting for the model, inside the skill's own command (ursula, or diagram-design's scripts), inside other commands.
// ursula: the skill of pull request #49; diagram-design: the runs of bench/agent-skill/results.json.
export const MEASURE = [
  { seconds: [11, 17], tokens: '36k–40k', ours: true, split: { model: '8–12', command: '3.4–5.5', other: '0–0.1' } },
  { seconds: [65, 174], tokens: '330k–672k', ours: false, split: { model: '63–170', command: '0.4–1.9', other: '1.3–2.9' } },
];
export const MEASURE_SCALE = 180;
