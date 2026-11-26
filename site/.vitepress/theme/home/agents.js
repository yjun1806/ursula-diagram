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
