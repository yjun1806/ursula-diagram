// Outputs the site shows are drawn at build time by this checkout's command, never pasted. Two fences:
//
//   ```ursula-output exit=1 input=gallery:pie --format text --width 80
//   ```
// becomes what `ursula-diagram --format text --width 80` prints (standard output, then standard error) for the input:
// the body of the fence when it has one, else the text named by input= (scripts/docs/sources.mjs). The build fails when
// the command ends with another code than exit= (0 unless given).
//
//   ```ursula-input gallery:pie
//   ```
// becomes that Mermaid text, so a page shows the input it draws from without a copy of it.
import { cliOutput, parseOutputInfo } from '../../scripts/docs/cli.mjs';
import { inputText } from '../../scripts/docs/sources.mjs';
import { isMermaid } from './mermaid-fence.mjs';

/** Outputs already drawn in this build, by arguments and input: a page is rendered more than once. */
const drawn = new Map();

/** The text and the language of an `ursula-output` or `ursula-input` fence, or undefined for any other fence. */
export function drawFence(info, body, where = 'a page') {
  const [kind, ...rest] = info.trim().split(/\s+/);
  if (kind === 'ursula-input') {
    const text = inputText(rest.join(' ')).trimEnd();
    return { text, lang: 'mermaid' };
  }
  if (kind !== 'ursula-output') return undefined;
  const { settings, args } = parseOutputInfo(rest.join(' '));
  const input = body.trim() !== '' ? body : settings.input ? `${inputText(settings.input)}\n` : '';
  const key = JSON.stringify([args, input, settings.exit]);
  if (!drawn.has(key)) drawn.set(key, cliOutput(args, input, Number(settings.exit ?? 0), where));
  const text = drawn.get(key);
  return { text, lang: isMermaid(text) ? 'mermaid' : '' };
}

/** A markdown-it plugin: every `ursula-output` and `ursula-input` fence becomes what the command draws now. */
export function ursulaOutputs(md) {
  md.core.ruler.after('block', 'ursula-output', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'fence') continue;
      const out = drawFence(token.info, token.content, state.env?.relativePath);
      if (!out) continue;
      token.content = `${out.text}\n`;
      token.info = out.lang;
    }
  });
}
