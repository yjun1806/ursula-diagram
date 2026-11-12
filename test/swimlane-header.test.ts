import { describe, expect, it } from 'vitest';
import { parse, render } from '../src/index.ts';

const body = `
  accTitle: Hand-off
  accDescr: Work moves from one lane to the next.
  subgraph one [First]
    a[Start] --> b[Check]
  end
  subgraph two [Second]
    c[Finish]
  end
  b --> c`;

describe('the swimlane header', () => {
  it('reads the same graph as a flowchart with the same body', () => {
    const lanes = parse(`swimlane-beta LR${body}`);
    const flow = parse(`flowchart LR${body}`);
    expect(lanes).toEqual(flow);
    expect(lanes.lanes.map((l) => l.label)).toEqual(['First', 'Second']);
  });

  it('draws, and takes top to bottom when no direction is given', () => {
    expect(render(`swimlane-beta LR${body}`)).toContain('<svg');
    expect(parse(`swimlane-beta${body}`).direction).toBe('TD');
  });
});
