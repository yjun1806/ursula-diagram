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
  it('reads the subgraphs as lanes, where a flowchart with the same body reads them as boxes', () => {
    const lanes = parse(`swimlane-beta LR${body}`);
    const flow = parse(`flowchart LR${body}`);
    expect(lanes.clusters).toBeUndefined();
    expect(lanes.lanes.map((l) => l.label)).toEqual(['First', 'Second']);
    expect(flow.clusters?.map((c) => c.label)).toEqual(['First', 'Second']);
    expect(flow.lanes).toHaveLength(1);
  });

  it('draws, and takes top to bottom when no direction is given', () => {
    expect(render(`swimlane-beta LR${body}`)).toContain('<svg');
    expect(parse(`swimlane-beta${body}`).direction).toBe('TD');
  });
});
