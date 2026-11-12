import type { Ruler } from '../metrics.ts';
import { layoutSequence } from '../sequence/layout.ts';
import type { SequenceLayoutOptions } from '../sequence/layout.ts';
import type { Box, SequenceLayout } from '../sequence/model.ts';
import type { SceneItem } from '../types.ts';
import type { ZenumlModel } from './parse.ts';
import { shiftItemDown } from './shift.ts';

/** Height of the band above the participants that holds the title, and the title's centre below the top margin. */
const TITLE_BAND = 40;
const TITLE_CENTRE = 8;
/** The title is drawn at 15px; the ruler measures the title role at 13px. */
const TITLE_SIZE = 15;
const MEASURED_SIZE = 13;

const down = (b: Box, dy: number): Box => ({ ...b, y: b.y + dy });

/**
 * Places a ZenUML diagram with the sequence engine, then writes the tags of its frames (`IF`, `TRY`) and
 * draws its title in a band above the participants.
 */
export function layoutZenuml(model: ZenumlModel, ruler: Ruler, opts: SequenceLayoutOptions = {}): SequenceLayout {
  const base = layoutSequence(model.sequence, ruler, { ...opts, legend: opts.legend ?? false });
  let tagAt = 0;
  const tagged = base.scene.items.map((it): SceneItem => {
    if (it.kind !== 'text' || !it.role?.includes('tag-text')) return it;
    const open = base.frames[tagAt++]?.statement;
    const tag = open === undefined ? undefined : model.tags.get(open);
    return tag === undefined ? it : { ...it, text: tag };
  });
  if (model.title === undefined || ruler.terminal) return { ...base, scene: { ...base.scene, items: tagged } };

  const margin = ruler.sequence.margin;
  const dy = TITLE_BAND;
  const up4 = (v: number): number => Math.ceil(v / ruler.grid - 1e-9) * ruler.grid;
  const titleW = (ruler.textWidth(model.title, 'title') * TITLE_SIZE) / MEASURED_SIZE;
  const width = Math.max(base.width, up4(titleW + 2 * margin));
  const items: SceneItem[] = [
    { kind: 'text', x: margin, y: margin + TITLE_CENTRE, text: model.title, anchor: 'start', role: ['title'] },
    ...tagged.map((it) => shiftItemDown(it, dy)),
  ];
  const height = base.height + dy;
  return {
    ...base,
    width,
    height,
    participants: base.participants.map((p) => ({ ...p, box: down(p.box, dy) })),
    rows: base.rows.map((r) => ({ ...r, y: r.y + dy })),
    messages: base.messages.map((m) => ({ ...m, y: m.y + dy, ...(m.label ? { label: down(m.label, dy) } : {}) })),
    notes: base.notes.map((nt) => ({ ...nt, box: down(nt.box, dy) })),
    frames: base.frames.map((f) => ({ ...f, y: f.y + dy, dividers: f.dividers.map((d) => d + dy) })),
    scene: { ...base.scene, width, height, items },
  };
}
