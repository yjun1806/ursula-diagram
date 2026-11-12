import type { SceneItem } from '../types.ts';

const ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
const fmt = (v: number): string => String(Math.round(v * 100) / 100);

/** Moves absolute SVG path data down by `dy`; relative commands keep their offsets. */
export function shiftPathDown(d: string, dy: number): string {
  const out: string[] = [];
  let cmd = '';
  let at = 0;
  for (const m of d.matchAll(/([MLHVAZCSQTmlhvazcsqt])|(-?\d*\.?\d+(?:e-?\d+)?)/gu)) {
    if (m[1] !== undefined) {
      cmd = m[1];
      at = 0;
      out.push(cmd);
      continue;
    }
    const value = Number(m[2]);
    const arity = ARITY[cmd.toUpperCase()] ?? 0;
    const i = arity === 0 ? 0 : at % arity;
    at++;
    const absolute = cmd === cmd.toUpperCase();
    const isY = absolute && (cmd === 'V' || (cmd === 'A' ? i === 6 : 'MLTCSQ'.includes(cmd) && i % 2 === 1));
    out.push(fmt(isY ? value + dy : value));
  }
  return out.join(' ');
}

/** A scene item moved down by `dy`. */
export function shiftItemDown(item: SceneItem, dy: number): SceneItem {
  switch (item.kind) {
    case 'box':
    case 'text':
      return { ...item, y: item.y + dy };
    case 'line':
      return { ...item, points: item.points.map((p) => ({ x: p.x, y: p.y + dy })) };
    case 'circle':
      return { ...item, cy: item.cy + dy };
    case 'path':
      return { ...item, d: shiftPathDown(item.d, dy) };
  }
}
