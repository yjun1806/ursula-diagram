// The tabs of the home page's install line: one command each, with its own copy button.
export const INSTALL = [
  { id: 'npm', command: 'npm install -g ursula-diagram' },
  { id: 'pnpm', command: 'pnpm add -g ursula-diagram' },
  { id: 'bun', command: 'bun add -g ursula-diagram' },
  { id: 'npx', command: 'npx ursula-diagram order.mmd --format text' },
  { id: 'skill', command: 'npx skills add yjun1806/ursula-diagram' },
  { id: 'mcp', command: 'claude mcp add ursula -- npx -y ursula-diagram mcp' },
];
