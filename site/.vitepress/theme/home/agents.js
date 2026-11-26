// The steps of the agent's loop on the home page and their commands. scripts/render-home.mjs runs each command at build
// time on the hero's text (order.mmd) into outputs.json, which the cards show: `exit` is the code it must end with (0
// unless given), `run: false` marks commands that only install, and `head` and `rule` shorten a long output to its
// first lines, '  ...', and the rule that contains `rule`, cut after its first clause.

export const CARDS = [
  { id: 'check', commands: ['ursula-diagram order.mmd --format svg --check > order.svg'] },
  { id: 'errors', commands: ["printf 'flowchrt LR\\n A-->B\\n' | ursula-diagram --format text"], exit: 1 },
  { id: 'lines', commands: ['ursula-diagram order.mmd --format check'] },
  { id: 'syntax', commands: ['ursula-diagram syntax sequence'], head: 6, rule: 'A->>B' },
  { id: 'everywhere', commands: ['npx skills add yjun1806/ursula-diagram', 'claude mcp add ursula -- npx -y ursula-diagram mcp'], run: false },
  { id: 'same', commands: ['ursula-diagram order.mmd > a.svg; ursula-diagram order.mmd > b.svg; cmp a.svg b.svg && echo same'] },
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
