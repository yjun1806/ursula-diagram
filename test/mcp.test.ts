import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TERMINAL_NOTE } from '../src/command/draw.ts';
import { lineSplitter } from '../src/mcp/lines.ts';
import { VERSION } from '../src/version.ts';

const root = new URL('..', import.meta.url).pathname;

/** Sends the messages to a fresh server, one per line, and returns its answers in order. */
function talk(messages: unknown[], entry = 'src/cli.ts'): Array<Record<string, any>> {
  const input = messages.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('\n') + '\n';
  const r = spawnSync(process.execPath, [`${root}${entry}`, 'mcp'], { input, encoding: 'utf8' });
  expect(r.status).toBe(0);
  return r.stdout.split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
}

const hello = { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } };
const ready = { jsonrpc: '2.0', method: 'notifications/initialized' };
const call = (id: number, name: string, args: Record<string, unknown>) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const flow = 'flowchart LR\nA[Order] --> B{Paid?}\nB -->|yes| C[Ship]\n';
const cli = (args: string[], input: string) => spawnSync(process.execPath, [`${root}src/cli.ts`, ...args], { input, encoding: 'utf8' });

describe('reading messages', () => {
  it('ends a message at a newline only, not at U+2028, U+2029 or a lone carriage return', () => {
    const got: string[] = [];
    const lines = lineSplitter((l) => got.push(l));
    lines.push('{"a":"x y z\rw"}\r\n{"b"');
    lines.push(':1}\n{"c":2}');
    lines.end();
    expect(got).toEqual(['{"a":"x y z\rw"}', '{"b":1}', '{"c":2}']);
  });

  it.each(['src/cli.ts', 'skills/ursula/scripts/ursula.mjs'])('%s answers a message with U+2028 in a string, on one line', (entry) => {
    const input = `${JSON.stringify(call(6, 'syntax', { type: 'a b' }))}\n`;
    const r = spawnSync(process.execPath, [`${root}${entry}`, 'mcp'], { input, encoding: 'utf8' });
    const answers = r.stdout.split('\n').filter((l) => l !== '');
    expect(answers).toHaveLength(1);
    expect(answers[0]).not.toContain(' ');
    expect(JSON.parse(answers[0] ?? '')).toMatchObject({ id: 6, result: { isError: true } });
  });
});

describe('ursula-diagram mcp', () => {
  it('says its version, the protocol and that it has tools', () => {
    const [init] = talk([hello, ready]);
    expect(init).toEqual({
      jsonrpc: '2.0',
      id: 0,
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'ursula-diagram', version: VERSION }, instructions: expect.any(String) },
    });
  });

  it('answers an older protocol with that protocol, and an unknown one with its newest', () => {
    const older = talk([{ ...hello, params: { ...hello.params, protocolVersion: '2024-11-05' } }]);
    expect(older[0]?.result.protocolVersion).toBe('2024-11-05');
    const unknown = talk([{ ...hello, params: { ...hello.params, protocolVersion: '1999-01-01' } }]);
    expect(unknown[0]?.result.protocolVersion).toBe('2025-06-18');
  });

  it('lists render, check and syntax, each with an input schema', () => {
    const [, list] = talk([hello, ready, { jsonrpc: '2.0', id: 1, method: 'tools/list' }]);
    const tools = list?.result.tools as Array<{ name: string; description: string; inputSchema: { type: string; properties: object; required?: string[] } }>;
    expect(tools.map((t) => t.name)).toEqual(['render', 'check', 'syntax']);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema.type).toBe('object');
    }
    expect(tools[0]?.inputSchema.required).toEqual(['source']);
  });

  it('renders the same text as the command prints', () => {
    const [, r] = talk([hello, call(1, 'render', { source: flow, format: 'text', width: 80 })]);
    expect(r?.result.isError).toBe(false);
    expect(r?.result.content).toEqual([{ type: 'text', text: cli(['--format', 'text', '--width', '80'], flow).stdout }]);
  });

  it('draws text 100 wide when no format or width is given, and adds the check on request', () => {
    const [, r] = talk([hello, call(1, 'render', { source: flow, check: true })]);
    expect(r?.result.content[0].text).toBe(cli(['--format', 'text', '--width', '100'], flow).stdout);
    expect(r?.result.content[1].text).toBe(`${cli(['--format', 'check'], flow).stdout}${TERMINAL_NOTE}\n`);
  });

  it('renders svg', () => {
    const [, r] = talk([hello, call(1, 'render', { source: flow, format: 'svg' })]);
    expect(r?.result.content[0].text).toBe(cli(['--format', 'svg'], flow).stdout);
  });

  it('runs check and syntax', () => {
    const [, check, syntax, list] = talk([hello, call(1, 'check', { source: flow }), call(2, 'syntax', { type: 'wardley' }), call(3, 'syntax', {})]);
    expect(check?.result).toEqual({ content: [{ type: 'text', text: cli(['--format', 'check'], flow).stdout }], isError: false });
    expect(syntax?.result.content[0].text).toBe(cli(['syntax', 'wardley'], '').stdout);
    expect(list?.result.content[0].text).toBe(cli(['syntax'], '').stdout);
  });

  it('returns a text error and a width error as results marked isError', () => {
    const [, bad, narrow, unknown] = talk([
      hello,
      call(1, 'render', { source: 'flowchrt LR\nA --> B' }),
      call(2, 'render', { source: 'flowchart LR\nA[First box] --> B[Second box]', width: 8 }),
      call(3, 'syntax', { type: 'wardly' }),
    ]);
    expect(bad?.result.isError).toBe(true);
    expect(bad?.result.content[0].text).toBe(cli(['--format', 'text', '--width', '100'], 'flowchrt LR\nA --> B').stderr);
    expect(narrow?.result.isError).toBe(true);
    expect(narrow?.result.content[0].text).toMatch(/^error: the drawing needs \d+ columns; the limit is 8\n/);
    expect(unknown?.result.isError).toBe(true);
    expect(unknown?.result.content[0].text).toContain('did you mean: wardley');
  });

  it('answers protocol errors with JSON-RPC errors', () => {
    const answers = talk([
      'not json',
      { jsonrpc: '2.0', id: 1, method: 'nothing/here' },
      { jsonrpc: '2.0', id: 2 },
      call(3, 'paint', { source: flow }),
      call(4, 'render', { source: 3 }),
      call(5, 'render', { source: flow, format: 'png' }),
      call(6, 'render', { source: flow, width: -4 }),
      { jsonrpc: '2.0', id: 7, method: 'ping' },
    ]);
    expect(answers.map((a) => a.error?.code ?? 'ok')).toEqual([-32700, -32601, -32600, -32602, -32602, -32602, -32602, 'ok']);
    expect(answers[0]?.id).toBeNull();
    expect(answers[7]).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });

  it('keeps the version in step with the package', () => {
    expect(VERSION).toBe(JSON.parse(readFileSync(`${root}package.json`, 'utf8')).version);
  });

  it('works from the file the skill carries', () => {
    const [, list] = talk([hello, { jsonrpc: '2.0', id: 1, method: 'tools/list' }], 'skills/ursula/scripts/ursula.mjs');
    expect(list?.result.tools).toHaveLength(3);
  });
});
