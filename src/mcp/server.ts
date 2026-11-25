// A Model Context Protocol server: one JSON-RPC 2.0 message per line in, one per line out. It answers initialize,
// ping, tools/list and tools/call. The command feeds it standard input and writes its answers to standard output.
import { internalReport } from '../command/report.ts';
import { VERSION } from '../version.ts';
import { ArgumentError, callTool, TOOLS } from './tools.ts';

/** The protocol versions this server speaks, newest first. */
export const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

const INSTRUCTIONS =
  "Draws Mermaid diagrams. Call 'syntax' when unsure how a diagram type is written, then 'render' (format text for a terminal, text-svg for a chat or a page, svg for a document); pass check: true to get the engine's report in the same call.";

type Id = string | number | null;
type Message = Record<string, unknown>;

const reply = (id: Id, result: unknown): Message => ({ jsonrpc: '2.0', id, result });
const fault = (id: Id, code: number, message: string): Message => ({ jsonrpc: '2.0', id, error: { code, message } });

/** The answer to one message; undefined for a notification. */
export function answer(message: unknown): Message | undefined {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return fault(null, -32600, 'a message is a JSON object');
  const m = message as Message;
  const id = m['id'];
  const hasId = id !== undefined;
  const validId: Id = typeof id === 'string' || typeof id === 'number' ? id : null;
  if (m['jsonrpc'] !== '2.0' || typeof m['method'] !== 'string') return hasId || m['method'] === undefined ? fault(validId, -32600, 'expected jsonrpc "2.0" and a method') : undefined;
  const method = m['method'];
  if (!hasId) return undefined; // A notification, such as notifications/initialized: no answer.
  const params = (typeof m['params'] === 'object' && m['params'] !== null ? m['params'] : {}) as Message;
  switch (method) {
    case 'initialize': {
      const asked = params['protocolVersion'];
      const protocolVersion = (PROTOCOLS as readonly unknown[]).includes(asked) ? asked : PROTOCOLS[0];
      return reply(validId, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'ursula-diagram', version: VERSION }, instructions: INSTRUCTIONS });
    }
    case 'ping':
      return reply(validId, {});
    case 'tools/list':
      return reply(validId, { tools: TOOLS });
    case 'tools/call':
      try {
        return reply(validId, callTool(params['name'], params['arguments']));
      } catch (err) {
        if (err instanceof ArgumentError) return fault(validId, -32602, err.message);
        return reply(validId, { content: [{ type: 'text', text: internalReport(err) }], isError: true });
      }
    default:
      return fault(validId, -32601, `no method ${method}`);
  }
}

/** The answer to one line: a message, a batch of them, or a parse error. */
export function answerLine(line: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return fault(null, -32700, 'the line is not JSON');
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return fault(null, -32600, 'an empty batch');
    const answers = parsed.map(answer).filter((a) => a !== undefined);
    return answers.length === 0 ? undefined : answers;
  }
  return answer(parsed);
}
