# Agent skill

`skills/ursula` is a skill for coding agents. `SKILL.md` tells the agent how to write the Mermaid text, how to
draw it and ask the engine about it in one call with `--check`, and which output to give the reader. `scripts/ursula.mjs` is the
command as one file, so the skill runs with Node 22 or later and installs nothing.

Install it with the [skills](https://skills.sh) command, which works for Claude Code, Codex, Cursor and other
agents. Pick where the skill goes: into this project, for every project (`-g`), or for one agent only (`-a`):

::: code-group

```bash [this project]
npx skills add yjun1806/ursula-diagram
```

```bash [every project]
npx skills add yjun1806/ursula-diagram -g
```

```bash [one agent]
npx skills add yjun1806/ursula-diagram -a claude-code
```

:::

Or copy the `skills/ursula` folder into the skills folder of your agent by hand. The npm package carries it too:

```bash
cp -R "$(npm root -g)/ursula-diagram/skills/ursula" ~/.claude/skills/
```

With the skill, the agent writes the Mermaid text, draws it with `--check` and `--fix` (which fixes a misspelt header
or keyword and a flowchart `->`, and names each fix), and picks the output by where the reader is: `text` for a
terminal, `text-svg` for a chat or a web page, `svg` or `html` for a file.

## Over MCP

Where an agent has no shell, `ursula-diagram mcp` serves the command over MCP on standard input and output. It has
three tools: `render` (with `format`, `width`, `charset`, `check` for the report, and `fix`), `check` (with `fix`) and
`syntax`. With `fix: true` the result ends with the fixes and the fixed source.

In Claude Code:

```bash
claude mcp add ursula -- npx -y ursula-diagram mcp
```

In `claude_desktop_config.json` of Claude Desktop, and in other clients that take the same form:

```json
{ "mcpServers": { "ursula": { "command": "npx", "args": ["-y", "ursula-diagram", "mcp"] } } }
```

# In an agent's terminal

A host that shows an agent's replies can also draw the diagrams itself, with no skill and no extra turn: find each
` ```mermaid ` block in the reply and put the drawing in its place. A Claude Code mod that redraws the replies in
the terminal is one such host. `renderTextSpans` gives each line as spans with a tone, and the host picks the
colour of each tone:

````ts
import { renderTextSpans } from 'ursula-diagram';

const TONE = { normal: '', dim: '\x1b[2m', bold: '\x1b[1m', accent: '\x1b[33m' };

function drawMermaidBlocks(reply: string, width: number): string {
  return reply.replace(/```mermaid\n([\s\S]*?)```/g, (block, src) => {
    const out = renderTextSpans(src, width);
    if ('error' in out) return block; // keep the text when it cannot be drawn
    return out.lines
      .map((line) => line.map((s) => TONE[s.tone] + s.text + '\x1b[0m').join(''))
      .join('\n');
  });
}
````

The drawing never goes past `width`: when it does not fit, `renderTextSpans` returns `{ error }`, and the block
stays as text.
