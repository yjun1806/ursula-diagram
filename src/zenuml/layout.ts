import type { Ruler } from '../metrics.ts';
import { layoutSequence } from '../sequence/layout.ts';
import type { SequenceLayoutOptions } from '../sequence/layout.ts';
import type { Box, Sequence, SequenceLayout } from '../sequence/model.ts';
import type { SceneBox, SceneItem, SceneText } from '../types.ts';
import type { ZenumlModel } from './parse.ts';
import { shiftItemDown } from './shift.ts';

/** Height of the band above the participants that holds the title, and the title's centre below the top margin. */
const TITLE_BAND = 40;
const TITLE_CENTRE = 8;
/** The title is drawn at 15px; the ruler measures the title role at 13px. */
const TITLE_SIZE = 15;
const MEASURED_SIZE = 13;

const down = (b: Box, dy: number): Box => ({ ...b, y: b.y + dy });

/** Space between a frame's tag and its condition, and between the condition and the frame's right side. */
const CONDITION_GAP = 8;
/** Room a comment box keeps on each side of its widest line. */
const NOTE_PAD = 12;

/** The condition of every frame, by the statement index of its opening line. */
function conditionsOf(seq: Sequence): Map<number, string> {
  const out = new Map<number, string>();
  seq.statements.forEach((s, i) => {
    if (s.kind === 'open' && s.lines.length > 0) out.set(i, s.lines.join(' '));
  });
  return out;
}

/** The sequence with the conditions of the frames in `drop` taken out, so the engine reserves no row for them. */
function withoutConditions(seq: Sequence, drop: ReadonlySet<number>): Sequence {
  return { ...seq, statements: seq.statements.map((s, i) => (s.kind === 'open' && drop.has(i) ? { ...s, lines: [] } : s)) };
}

/** A caption the engine wraps in brackets, as written. */
const unbracket = (text: string): string => /^\[(.*)\]$/su.exec(text)?.[1] ?? text;

/**
 * Lays out the sequence, then writes each frame's tag as its keyword and its condition on the tag's row, right of
 * the tag. A frame too narrow for the condition there keeps the engine's caption row under the tag.
 */
function layoutFrames(model: ZenumlModel, ruler: Ruler, opts: SequenceLayoutOptions): SequenceLayout {
  const conditions = conditionsOf(model.sequence);
  const layoutWith = (drop: ReadonlySet<number>): SequenceLayout =>
    layoutSequence(withoutConditions(model.sequence, drop), ruler, { ...opts, legend: opts.legend ?? false });
  if (ruler.terminal || conditions.size === 0) return retag(layoutWith(new Set()), model, ruler, new Map());

  const captionW = (text: string): number => ruler.textWidth(text, 'edge') * ruler.sequence.captionScale;
  let drop = new Set(conditions.keys());
  let base = layoutWith(drop);
  const tags = base.scene.items.filter((it): it is SceneBox => it.kind === 'box' && (it.role?.includes('tag') ?? false));
  const fits = new Set(
    [...drop].filter((statement) => {
      const k = base.frames.findIndex((f) => f.statement === statement);
      const frame = base.frames[k];
      const tag = tags[k];
      if (frame === undefined || tag === undefined) return false;
      return tag.x + tag.w + 2 * CONDITION_GAP + captionW(conditions.get(statement) ?? '') <= frame.x + frame.w;
    }),
  );
  if (fits.size !== drop.size) {
    drop = fits;
    base = layoutWith(drop);
  }
  const beside = new Map<number, string>();
  for (const statement of drop) beside.set(statement, conditions.get(statement) ?? '');
  return retag(base, model, ruler, beside);
}

/** Width of a tag pill around its keyword, measured as the engine measures its own tags. */
function tagWidth(text: string, ruler: Ruler): number {
  const S = ruler.sequence;
  const w = ruler.textWidth(text, 'lane') * S.tabScale + text.length * S.tabSpacing + 2 * S.tabPad;
  return Math.max(S.tabW, Math.ceil(w / ruler.grid - 1e-9) * ruler.grid);
}

/** Writes the tags, the conditions kept beside them, captions without brackets and comment boxes fitted to their text. */
function retag(base: SequenceLayout, model: ZenumlModel, ruler: Ruler, beside: ReadonlyMap<number, string>): SequenceLayout {
  let tagAt = 0;
  let boxAt = 0;
  const added: SceneItem[] = [];
  const backings: SceneItem[] = [];
  const pad = ruler.sequence.labelBgPad;
  /** Left side and new width of each tag pill, by frame order, so that its text stays centred in it. */
  const pills: Array<{ x: number; w: number }> = [];
  const items = base.scene.items.map((it): SceneItem => {
    if (it.kind === 'box' && it.role?.includes('tag')) {
      const frame = base.frames[boxAt++];
      const keyword = frame === undefined ? undefined : model.tags.get(frame.statement);
      const pill = keyword === undefined || ruler.terminal ? it : { ...it, w: tagWidth(keyword, ruler) };
      pills.push({ x: pill.x, w: pill.w });
      const text = frame === undefined ? undefined : beside.get(frame.statement);
      if (text !== undefined && text !== '') {
        const x = pill.x + pill.w + CONDITION_GAP;
        const w = ruler.textWidth(text, 'edge') * ruler.sequence.captionScale;
        // A backing in the page colour keeps the lifelines from striking through the condition.
        backings.push({ kind: 'box', role: ['bg'], x: x - pad, y: pill.y, w: Math.ceil(w + 2 * pad), h: pill.h });
        added.push({ kind: 'text', x, y: pill.y + pill.h / 2, text, anchor: 'start', role: ['label'] });
      }
      return pill;
    }
    if (it.kind !== 'text') return it;
    if (it.role?.includes('tag-text')) {
      const pill = pills[tagAt];
      const open = base.frames[tagAt++]?.statement;
      const tag = open === undefined ? undefined : model.tags.get(open);
      return tag === undefined || pill === undefined ? it : { ...it, text: tag, x: pill.x + pill.w / 2 };
    }
    return it.role?.includes('label') ? { ...it, text: unbracket(it.text) } : it;
  });
  const firstFrame = items.findIndex((it) => it.kind === 'box' && (it.role?.some((r) => r === 'frame' || r === 'zone') ?? false));
  const at = firstFrame < 0 ? items.length : firstFrame;
  const fitted = fitNotes(base, [...items.slice(0, at), ...backings, ...items.slice(at), ...added], ruler);
  return { ...base, notes: fitted.notes, scene: { ...base.scene, items: fitted.items } };
}

/** Narrows every comment box to its widest line plus `NOTE_PAD` a side, around the same centre. */
function fitNotes(base: SequenceLayout, items: SceneItem[], ruler: Ruler): { items: SceneItem[]; notes: SequenceLayout['notes'] } {
  if (ruler.terminal) return { items, notes: base.notes };
  const grid = ruler.grid;
  const notes = base.notes.map((n) => {
    const inside = items.filter((it): it is SceneText => it.kind === 'text' && (it.role?.includes('sub') ?? false) && it.y > n.box.y && it.y < n.box.y + n.box.h && it.x > n.box.x && it.x < n.box.x + n.box.w);
    if (inside.length === 0) return n;
    const widest = Math.max(...inside.map((t) => ruler.textWidth(t.text, 'line')));
    const w = Math.min(n.box.w, Math.ceil((widest + 2 * NOTE_PAD) / grid - 1e-9) * grid);
    const centre = inside[0]?.x ?? n.box.x + n.box.w / 2;
    return { ...n, box: { ...n.box, x: centre - w / 2, w } };
  });
  const out = items.map((it): SceneItem => {
    if (it.kind !== 'box' || !it.role?.includes('note')) return it;
    const k = Number(it.data?.['note']);
    const n = notes[k];
    return n === undefined ? it : { ...it, x: n.box.x, w: n.box.w };
  });
  return { items: out, notes };
}

/**
 * Places a ZenUML diagram with the sequence engine, then writes the tags and conditions of its frames and draws its
 * title in a band above the participants.
 */
export function layoutZenuml(model: ZenumlModel, ruler: Ruler, opts: SequenceLayoutOptions = {}): SequenceLayout {
  const base = layoutFrames(model, ruler, opts);
  const tagged = base.scene.items;
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
