import { describe, expect, it } from 'vitest';
import { cellRuler, layout, parse, pixelRuler } from '../src/index.ts';
import { offCentreEnds } from '../src/layered/centre.ts';
import { directionsOf, mixedSideEnds } from '../src/layered/sides.ts';
import { geometryViolations } from './helpers.ts';

const fanOut = `flowchart LR
  subgraph early[Early]
    hub[Source]
  end
  subgraph late[Late]
    t1[One]
    t2[Two]
    t3[Three]
    t4[Four]
    t5[Five]
  end
  hub --> t1
  hub --> t2
  hub --> t3
  hub --> t4
  hub --> t5`;

const fanIn = `flowchart LR
  subgraph top[Top]
    s1[One]
    s2[Two]
    s3[Three]
    s4[Four]
    s5[Five]
  end
  subgraph bottom[Bottom]
    sink[Target]
  end
  s1 --> sink
  s2 --> sink
  s3 --> sink
  s4 --> sink
  s5 --> sink`;

describe('a node that sends out or takes in many edges', () => {
  for (const [name, src, composition] of [['fan-out in stages', fanOut, 'stages'], ['fan-in in lanes', fanIn, 'lanes']] as const) {
    for (const [rn, ruler] of [['pixel', pixelRuler()], ['cell', cellRuler()]] as const) {
      it(`${name} (${rn}) is sound, centred on its sides, and keeps edges of one direction on one side`, () => {
        const l = layout(parse(src), ruler, { composition });
        expect(geometryViolations(l)).toEqual([]);
        if (rn === 'pixel') expect(offCentreEnds(l)).toEqual([]);
        expect(mixedSideEnds(l, directionsOf(l))).toEqual([]);
      });
    }
  }

  it('puts the source of five partners level with the middle one in stages', () => {
    for (const ruler of [pixelRuler(), cellRuler()]) {
      const l = layout(parse(fanOut), ruler, { composition: 'stages' });
      const centre = (id: string): number => {
        const n = l.nodes.find((v) => v.id === id);
        return (n?.y ?? 0) + (n?.h ?? 0) / 2;
      };
      const partners = ['t1', 't2', 't3', 't4', 't5'].map(centre).sort((a, b) => a - b);
      expect(Math.abs(centre('hub') - (partners[2] ?? 0))).toBeLessThan(1);
    }
  });
});
