import { describe, expect, it } from 'vitest';
import { checkLines, layout, parse, pixelRuler } from '../src/index.ts';
import { score } from '../src/layered/choose.ts';
import { pictureOf } from '../src/layered/questions.ts';

const mixed = `flowchart LR
  subgraph desk[Desk]
    start[Start]
    end1[End one]
    end2[End two]
    end3[End three]
    idle1[Idle one]
    idle2[Idle two]
  end
  subgraph store[Store]
    mid1[Middle one]
    mid2[Middle two]
  end
  start --> mid1
  start --> mid2
  mid1 --> end1
  mid2 --> end2
  mid2 --> end3`;

const split = `flowchart LR
  subgraph first[First]
    start[Start]
  end
  subgraph desk[Desk]
    end1[End one]
    end2[End two]
    end3[End three]
    idle1[Idle one]
    idle2[Idle two]
  end
  subgraph store[Store]
    mid1[Middle one]
    mid2[Middle two]
  end
  start --> mid1
  start --> mid2
  mid1 --> end1
  mid2 --> end2
  mid2 --> end3`;

const asked = (src: string, options = {}) => layout(parse(src), pixelRuler(), options).diagnostics.filter((d) => d.kind === 'question');

describe('questions', () => {
  it('asks to split a lane that holds both the start and the ends of the flow, with the picture the split text really gives', () => {
    const q = asked(mixed).find((d) => d.code === 'split-lane');
    expect(q).toBeDefined();
    expect(q?.lane).toBe('Desk');
    expect(q?.nodes).toEqual(['start']);
    expect(q?.before?.composition).toBe('lanes');
    expect(q?.after?.composition).toBe('stages');
    expect((q?.after?.cost ?? 0)).toBeLessThan(q?.before?.cost ?? 0);
    const real = pictureOf(layout(parse(split), pixelRuler(), { questions: false }));
    expect(q?.after).toEqual(real);
  });

  it('asks about nodes that no edge touches, one node included, and not about a lane of only such nodes', () => {
    const q = asked(mixed).find((d) => d.code === 'isolated-nodes');
    expect(q?.lane).toBe('Desk');
    expect(q?.nodes).toEqual(['idle1', 'idle2']);
    const one = asked('flowchart LR\nsubgraph a[A]\nP --> Q\nlonely\nend');
    expect(one.map((d) => d.nodes)).toEqual([['lonely']]);
    expect(asked('flowchart LR\nsubgraph a[A]\nP --> Q\nend\nsubgraph b[B]\nR\nS\nend')).toEqual([]);
  });

  it('does not ask to split when the bands already go one way or send edges both ways', () => {
    expect(asked(split).find((d) => d.code === 'split-lane')).toBeUndefined();
    expect(asked('flowchart LR\nsubgraph a[A]\nP --> Q\nend\nsubgraph b[B]\nR --> S\nend\nQ --> R\nS --> P').find((d) => d.code === 'split-lane')).toBeUndefined();
  });

  it('can be switched off, and never counts as a problem', () => {
    const g = parse(mixed);
    const on = layout(g, pixelRuler());
    const off = layout(g, pixelRuler(), { questions: false });
    expect(off.diagnostics.some((d) => d.kind === 'question')).toBe(false);
    expect(score(on)).toEqual(score(off));
    expect(on.edges).toEqual(off.edges);
    expect(on.diagnostics.filter((d) => d.kind !== 'question')).toEqual(off.diagnostics);
  });

  it('writes a first line with the composition, bends and crossings, and a few lines per question', () => {
    const lines = checkLines(layout(parse(mixed), pixelRuler()));
    expect(lines[0]).toMatch(/^composition lanes · bends \d+ · crossings \d+$/);
    expect(lines.some((l) => l.includes('question 1'))).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(1 + 2 * 3);
    expect(checkLines(layout(parse('flowchart LR\nA --> B'), pixelRuler()))).toHaveLength(1);
  });
});
