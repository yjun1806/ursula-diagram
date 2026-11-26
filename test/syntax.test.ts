import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { checkReport } from '../src/command/draw.ts';
import { registeredFrontEnds, render, renderText, syntaxOf, syntaxTypes } from '../src/index.ts';
import { SYNTAX } from '../src/syntax/index.ts';
import { syntaxText } from '../src/syntax/lookup.ts';

const root = new URL('..', import.meta.url).pathname;
const cli = (args: string[]) => spawnSync(process.execPath, [`${root}src/cli.ts`, ...args], { encoding: 'utf8' });
const request = { format: 'check' as const, legend: true, color: false, questions: true, elbows: true, check: false };

describe('the syntax catalog', () => {
  it('has an entry for every registered front-end, and only for those', () => {
    const names = registeredFrontEnds().map((f) => f.name).sort();
    expect([...syntaxTypes()].sort()).toEqual(names);
  });

  it.each(SYNTAX.map((e) => [e.name, e] as const))('%s: headers belong to the front-end; the entry is short', (_, e) => {
    const front = registeredFrontEnds().find((f) => f.name === e.name);
    for (const h of e.headers) expect(front?.headers).toContain(h);
    expect(e.example.split('\n').length).toBeLessThanOrEqual(12);
    expect(e.rules.length).toBeLessThanOrEqual(5);
    expect(e.example.split('\n')[0]?.trim().split(/\s/)[0]).toBe(e.headers[0]);
    expect(syntaxText(e).split('\n').length).toBeLessThanOrEqual(25);
  });

  it.each(SYNTAX.map((e) => [e.name, e.example] as const))('%s: the example draws without error or question', (_, example) => {
    expect(() => render(example)).not.toThrow();
    const text = renderText(example, 100);
    expect('error' in text ? text.error : '').toBe('');
    expect(checkReport(example, request)).not.toMatch(/^question/m);
  });

  it('finds a type by name or header, ignoring case', () => {
    expect(syntaxOf('wardley')?.name).toBe('wardley');
    expect(syntaxOf('WARDLEY-BETA')?.name).toBe('wardley');
    expect(syntaxOf('graph')?.name).toBe('flowchart');
    expect(syntaxOf('nothing')).toBeUndefined();
  });

  it('finds a type by every header its front-end reads', () => {
    for (const f of registeredFrontEnds()) for (const h of f.headers) expect(syntaxOf(h)?.name, h).toBe(f.name);
    const r = cli(['syntax', 'stateDiagram']);
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith('stateDiagram-v2: ')).toBe(true);
  });
});

describe('ursula-diagram syntax', () => {
  it('lists every type and points to the detail', () => {
    const r = cli(['syntax']);
    expect(r.status).toBe(0);
    for (const name of syntaxTypes()) expect(r.stdout).toMatch(new RegExp(`^${name}\\s`, 'm'));
    expect(r.stdout).toContain("Run 'ursula-diagram syntax <type>'");
  });

  it('prints the example and the rules of one type', () => {
    const r = cli(['syntax', 'wardley']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^wardley-beta: /);
    expect(r.stdout).toContain('component Tea [0.63, 0.81]');
    expect(r.stdout).toMatch(/^- /m);
  });

  it('suggests a type for a name it does not know, and exits 2', () => {
    const r = cli(['syntax', 'wardly']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain("no diagram type 'wardly'");
    expect(r.stderr).toContain('did you mean: wardley');
  });
});
