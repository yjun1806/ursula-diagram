// The check report reads the layout of `json(src, 'svg', opts)`; it describes the drawing only when the svg and the json
// of one text are laid out with the same options.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectFrontEnd } from '../src/index.ts';
import type { Layout } from '../src/index.ts';

const DIR = join(import.meta.dirname, '../site/examples/official');
describe('the svg and the json of a graph take the same layout options', () => {
  for (const type of ['flowchart', 'swimlane', 'class', 'er', 'requirement', 'state', 'usecase']) {
    it(type, () => {
      for (const file of readdirSync(join(DIR, type)).filter((f) => f.endsWith('.mmd')).slice(0, 12)) {
        const src = readFileSync(join(DIR, type, file), 'utf8');
        const frontEnd = selectFrontEnd(src);
        // What the svg draws of a layout: its size, the boxes and the lines.
        const drawnPart = (o: object): string => {
          const got = frontEnd.json(src, 'svg', o) as Layout | { layout: Layout };
          const l = 'layout' in got ? got.layout : got;
          return JSON.stringify([l.width, l.height, l.nodes.map((n) => [n.id, n.x, n.y, n.w, n.h]), l.edges.map((e) => e.points)]);
        };
        const svg = frontEnd.svg(src, {});
        const json = drawnPart({});
        for (const opts of [{ maxWidth: 480 }, { quality: 'fast' as const }, { composition: 'lanes' as const }]) {
          // An option that moves the drawing moves the json, and one that leaves the drawing alone leaves the json alone.
          const drawnMoved = frontEnd.svg(src, opts) !== svg;
          const jsonMoved = drawnPart(opts) !== json;
          expect(jsonMoved, `${type}/${file} ${JSON.stringify(opts)}`).toBe(drawnMoved);
        }
      }
    });
  }
});
