import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, renderText } from '../src/index.ts';

/** A small string hash (cyrb53), so that no Node module is needed. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Small deterministic generator (mulberry32). */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['Receive order', 'Check stock', 'Pack', 'Ship parcel', 'Notify', 'Audit log', 'Refund', 'Approve', 'Archive', 'Index'];

function generate(seed: number): string {
  const rnd = prng(seed);
  const pick = (n: number): number => Math.floor(rnd() * n);
  const lanes = 1 + pick(3);
  const count = 4 + pick(13);
  const dir = rnd() < 0.5 ? 'LR' : 'TD';
  const labels = rnd() < 0.5;
  const members: string[][] = Array.from({ length: lanes }, () => []);
  for (let i = 0; i < count; i++) members[pick(lanes)]?.push(`n${i}`);
  const title = (i: number): string => `n${i}[${WORDS[(i * 7 + seed) % WORDS.length]}]`;
  const lines = [`flowchart ${dir}`];
  members.forEach((ids, k) => {
    if (ids.length === 0) return;
    lines.push(`subgraph l${k}[Lane ${k}]`, ...ids.map((id) => title(Number(id.slice(1)))), 'end');
  });
  const edges = Math.min(count + pick(count), 24);
  for (let e = 0; e < edges; e++) {
    const a = pick(count);
    let b = pick(count);
    if (b === a) b = (a + 1) % count;
    if (e < count - 1 && rnd() < 0.7) b = Math.min(count - 1, a + 1);
    if (a === b) continue;
    lines.push(`n${a} -->${labels && rnd() < 0.5 ? `|e${e}|` : ''} n${b}`);
  }
  return lines.join('\n');
}

const fanOut = 'flowchart LR\n  subgraph early[Early]\n    hub[Source]\n  end\n  subgraph late[Late]\n    t1[One]\n    t2[Two]\n    t3[Three]\n    t4[Four]\n    t5[Five]\n  end\n  hub --> t1\n  hub --> t2\n  hub --> t3\n  hub --> t4\n  hub --> t5';
const fanIn = 'flowchart LR\n  subgraph top[Top]\n    s1[One]\n    s2[Two]\n    s3[Three]\n    s4[Four]\n    s5[Five]\n  end\n  subgraph bottom[Bottom]\n    sink[Target]\n  end\n  s1 --> sink\n  s2 --> sink\n  s3 --> sink\n  s4 --> sink\n  s5 --> sink';

const examples = ['order-flow', 'checkout-sequence', 'login-sequence'];

function outputs(): Record<string, string> {
  const graphs: Record<string, string> = { fanOut, fanIn };
  for (let seed = 1; seed <= 40; seed++) graphs[`generated-${seed}`] = generate(seed);
  for (const name of examples) graphs[name] = readFileSync(join(import.meta.dirname, '..', 'examples', `${name}.mmd`), 'utf8');
  const out: Record<string, string> = {};
  for (const [name, src] of Object.entries(graphs)) {
    out[`${name} svg`] = hash(render(src));
    for (const width of [80, 120]) {
      const r = renderText(src, width);
      out[`${name} text${width}`] = hash('lines' in r ? r.lines.join('\n') : `error:${r.error}`);
    }
  }
  return out;
}

const file = join(import.meta.dirname, 'golden.json');

describe('golden outputs', () => {
  it('give the same pixel drawing and the same terminal text as the ones kept in test/golden.json', () => {
    const now = outputs();
    if (process.env['URSULA_UPDATE_GOLDEN'] === '1') {
      writeFileSync(file, `${JSON.stringify(now, null, 1)}\n`);
      return;
    }
    const kept = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    const changed = Object.keys(now).filter((k) => kept[k] !== now[k]);
    expect(changed).toEqual([]);
    expect(Object.keys(kept).filter((k) => !(k in now))).toEqual([]);
  }, 600000);
});
