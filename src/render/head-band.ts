import type { SceneThemeSpec } from './scene-theme.ts';
import type { ScenePath } from '../types.ts';

/** Height of the band across the top of a box that carries the box's kind. */
export const HEAD_BAND = 28;

/**
 * The band across the top of the box `x`, `y`, `w`: as wide as the box and cut to its rounded corners, inset by half the
 * outline so that the outline's stroke stays whole.
 */
export function headBand(x: number, y: number, w: number, spec: SceneThemeSpec, data?: Record<string, string>): ScenePath {
  const inset = Number.parseFloat(spec.metrics['box-w'] ?? '0') / 2;
  const r = Math.max(0, spec.boxRadius - inset);
  const left = x + inset;
  const right = x + w - inset;
  const top = y + inset;
  const bottom = y + HEAD_BAND;
  const d = `M${left} ${bottom}V${top + r}A${r} ${r} 0 0 1 ${left + r} ${top}H${right - r}A${r} ${r} 0 0 1 ${right} ${top + r}V${bottom}Z`;
  return { kind: 'path', d, role: ['head-band'], ...(data === undefined ? {} : { data }) };
}
