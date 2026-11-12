import type { Theme } from './theme.ts';

/** Light and dark value of a colour variable. */
export type Pair = readonly [string, string];

export type Arrow = { kind: 'filled'; length: number; width: number; stroke: number } | { kind: 'open'; length: number; width: number; wing: number };

export interface SceneThemeSpec {
  /** Colour variables (`--ursula-<name>`) with their light and dark values. */
  colors: Record<string, Pair>;
  /** Widths, dashes and weights written into the style sheet as they are. */
  metrics: Record<string, string>;
  /** Corner radius of a box, of a rounded box, and of a zone or panel. */
  boxRadius: number;
  roundRadius: number;
  zoneRadius: number;
  /** Radius of the bends of a line. */
  bend: number;
  lineWidth: number;
  /** Width of a value bar and the radius of its two top corners; the bottom edge is straight. */
  barWidth: number;
  barTop: number;
  dataWidth: number;
  dotRadius: number;
  /** Arrowhead: `length` is the room it takes along the line; an open head draws its two wings `wing` long. */
  arrow: Arrow;
  /** Head of a message line when it differs from `arrow`, so that a call stays apart from the open head of an async message. */
  msgArrow?: Arrow;
  shadow: boolean;
  /** Shape of a value line between its points. */
  interpolation: 'linear' | 'monotone';
  /** Where a value label sits: next to the mark, on the side the line does not pass, or inside a bar. */
  valueLabel: 'outside' | 'inside';
}

const FILLED = ['#7447c8', '#0f9b95', '#d58d25', '#1f7dcf', '#399d57', '#dd5847', '#9ca73e', '#6b727e'] as const;
const TINT_DARK = [
  'rgba(116,71,200,0.24)',
  'rgba(15,155,149,0.24)',
  'rgba(213,141,37,0.24)',
  'rgba(31,125,207,0.24)',
  'rgba(57,157,87,0.24)',
  'rgba(221,88,71,0.24)',
  'rgba(156,167,62,0.24)',
  'rgba(107,114,126,0.24)',
] as const;
const TINT_LIGHT = ['#f2edff', '#d7f1ef', '#fbe8d3', '#d9eeff', '#dcf2df', '#ffe2dc', '#eaeed6', '#e9ebef'] as const;

/** Accent tints: the same accent at 0.24 in the dark scheme; the middle one a little stronger. */
const ACCENT_TINT = 'rgba(116,71,200,0.24)';
const ACCENT_MID = 'rgba(116,71,200,0.4)';

function series(): Record<string, Pair> {
  const out: Record<string, Pair> = {};
  FILLED.forEach((hex, i) => {
    out[`s${i + 1}`] = [hex, hex];
    out[`s${i + 1}-tint`] = [TINT_LIGHT[i] ?? hex, TINT_DARK[i] ?? hex];
  });
  return out;
}

const COMMON: Record<string, Pair> = {
  ink: ['#1c1a24', '#ecebf2'],
  'ink-2': ['#6a6775', '#a5a2b3'],
  'ink-3': ['#9795a1', '#6a6779'],
  line: ['#d3d1dc', '#474454'],
  'line-weak': ['#ecebf1', '#33313d'],
  accent: ['#7447c8', '#7447c8'],
  'accent-deep': ['#4f2b9a', '#d9c9ff'],
  'accent-mid': ['#cdbdf5', ACCENT_MID],
  'accent-tint': ['#f2edff', ACCENT_TINT],
  'accent-tint-2': ['#e3d6fe', ACCENT_TINT],
  'dot-neutral': ['#8f8c9b', '#7d7a8c'],
  'on-accent': ['#ffffff', '#ffffff'],
  ...series(),
};

export const SCENE_THEME_SPECS: Record<Theme, SceneThemeSpec> = {
  solid: {
    colors: {
      ...COMMON,
      bg: ['#ffffff', '#1c1b22'],
      halo: ['#ffffff', '#1c1b22'],
      'box-fill': ['#f3f2f7', '#2a2833'],
      'box-stroke': ['none', 'none'],
      'box-in-zone': ['#ffffff', '#34323e'],
      'start-fill': ['#7447c8', '#7447c8'],
      'start-stroke': ['none', 'none'],
      'start-ink': ['#ffffff', '#ffffff'],
      'decision-fill': ['#e3d6fe', ACCENT_TINT],
      'decision-stroke': ['none', 'none'],
      'decision-ink': ['#4f2b9a', '#d9c9ff'],
      'active-fill': ['#e3d6fe', ACCENT_TINT],
      'active-stroke': ['none', 'none'],
      'note-fill': ['#ffffff', '#1c1b22'],
      'note-stroke': ['#e4e2ec', '#3a3846'],
      'note-in-zone': ['#ffffff', '#1c1b22'],
      rule: ['#ffffff', '#1c1b22'],
      'rule-in-zone': ['#ecebf1', '#474454'],
      edge: ['#c4c1d0', '#6a6779'],
      'edge-msg': ['#8f8c9b', '#7d7a8c'],
      lifeline: ['#e4e2ec', '#3a3846'],
      guide: ['#e4e2ec', '#3a3846'],
      'chip-fill': ['#f3f2f7', '#2a2833'],
      'chip-stroke': ['#ffffff', '#1c1b22'],
      'chip-accent-fill': ['#f2edff', ACCENT_TINT],
      'chip-accent-stroke': ['#ffffff', '#1c1b22'],
      'tag-fill': ['#e9e7f0', '#2e2c38'],
      'tag-fill-zone': ['#f3f2f7', '#2a2833'],
      'zone-fill': ['#f3f2f7', '#211f29'],
      'zone-stroke': ['none', 'none'],
      'zone-plain': ['#ffffff', '#1c1b22'],
      'zone-plain-stroke': ['#e4e2ec', '#3a3846'],
      'zone-dash': ['#c4c1d0', '#6a6779'],
      frame: ['#e4e2ec', '#3a3846'],
      panel: ['none', 'none'],
      grid: ['#f3f2f7', '#26242e'],
      axis: ['none', 'none'],
      bar: ['#cdbdf5', ACCENT_MID],
      data: ['#4f2b9a', '#d9c9ff'],
      'dot-fill': ['#4f2b9a', '#d9c9ff'],
      'dot-stroke': ['#ffffff', '#1c1b22'],
      value: ['#4f2b9a', '#d9c9ff'],
    },
    metrics: {
      'box-w': '0',
      'start-w': '0',
      'decision-w': '0',
      'active-w': '0',
      'note-w': '2',
      'rule-w': '2',
      'edge-w': '2.5',
      dash: '2 7',
      'dash-msg': '6 6',
      'lifeline-w': '2',
      'guide-w': '2',
      'chip-w': '3',
      'zone-w': '0',
      'zone-plain-w': '2',
      'zone-dash-w': '2',
      'frame-w': '2',
      'grid-w': '2',
      'grid-dash': 'none',
      'data-w': '3',
      'value-weight': '600',
      'tint-stroke-w': '0',
      overlap: '0.24',
      'overlap-w': '0',
      port: 'none',
    },
    boxRadius: 18,
    roundRadius: 24,
    zoneRadius: 22,
    bend: 16,
    lineWidth: 2.5,
    barWidth: 40,
    barTop: 14,
    dataWidth: 3,
    dotRadius: 5,
    arrow: { kind: 'filled', length: 9.5, width: 10, stroke: 2 },
    shadow: false,
    interpolation: 'monotone',
    valueLabel: 'inside',
  },
  outline: {
    colors: {
      ...COMMON,
      bg: ['#ffffff', '#1c1b22'],
      halo: ['#ffffff', '#1c1b22'],
      'box-fill': ['#ffffff', '#1d1c23'],
      'box-stroke': ['#d3d1dc', '#474454'],
      'box-in-zone': ['#ffffff', '#1d1c23'],
      'start-fill': ['#ffffff', '#1d1c23'],
      'start-stroke': ['#7447c8', '#7447c8'],
      'start-ink': ['#1c1a24', '#ecebf2'],
      'decision-fill': ['#f2edff', ACCENT_TINT],
      'decision-stroke': ['#7447c8', '#7447c8'],
      'decision-ink': ['#1c1a24', '#ecebf2'],
      'active-fill': ['#f2edff', ACCENT_TINT],
      'active-stroke': ['#7447c8', '#7447c8'],
      'note-fill': ['#f7f6fa', '#211f29'],
      'note-stroke': ['#ecebf1', '#33313d'],
      'note-in-zone': ['#ffffff', '#2a2833'],
      rule: ['#ecebf1', '#33313d'],
      'rule-in-zone': ['#ecebf1', '#33313d'],
      edge: ['#8f8c9b', '#7d7a8c'],
      'edge-msg': ['#8f8c9b', '#7d7a8c'],
      lifeline: ['#d3d1dc', '#474454'],
      guide: ['#d3d1dc', '#474454'],
      'chip-fill': ['#ffffff', '#1d1c23'],
      'chip-stroke': ['#d3d1dc', '#474454'],
      'chip-accent-fill': ['#ffffff', '#1d1c23'],
      'chip-accent-stroke': ['#7447c8', '#7447c8'],
      'tag-fill': ['#f3f2f7', '#2a2833'],
      'tag-fill-zone': ['#ffffff', '#1d1c23'],
      'zone-fill': ['#f7f6fa', '#211f29'],
      'zone-stroke': ['#ecebf1', '#33313d'],
      'zone-plain': ['#ffffff', '#1d1c23'],
      'zone-plain-stroke': ['#ecebf1', '#33313d'],
      'zone-dash': ['#d3d1dc', '#474454'],
      frame: ['#d3d1dc', '#474454'],
      panel: ['none', 'none'],
      grid: ['#ecebf1', '#33313d'],
      axis: ['#d3d1dc', '#474454'],
      bar: ['#e3d6fe', ACCENT_TINT],
      data: ['#7447c8', '#7447c8'],
      'dot-fill': ['#ffffff', '#1d1c23'],
      'dot-stroke': ['#7447c8', '#7447c8'],
      value: ['#1c1a24', '#ecebf2'],
    },
    metrics: {
      'box-w': '1.25',
      'start-w': '1.5',
      'decision-w': '1.5',
      'active-w': '1.25',
      'note-w': '1',
      'rule-w': '1',
      'edge-w': '1.5',
      dash: '5 4',
      'dash-msg': '5 4',
      'lifeline-w': '1.25',
      'guide-w': '1',
      'chip-w': '1',
      'zone-w': '1',
      'zone-plain-w': '1',
      'zone-dash-w': '1.25',
      'frame-w': '1',
      'grid-w': '1',
      'grid-dash': 'none',
      'data-w': '2.5',
      'value-weight': '500',
      'tint-stroke-w': '1',
      overlap: '0.16',
      'overlap-w': '1.5',
      port: 'none',
    },
    boxRadius: 12,
    roundRadius: 20,
    zoneRadius: 16,
    bend: 12,
    lineWidth: 1.5,
    barWidth: 32,
    barTop: 8,
    dataWidth: 2.5,
    dotRadius: 4,
    arrow: { kind: 'filled', length: 8, width: 8, stroke: 1.5 },
    shadow: false,
    interpolation: 'linear',
    valueLabel: 'outside',
  },
  card: {
    colors: {
      ...COMMON,
      bg: ['#f6f5fa', '#17161c'],
      halo: ['#ffffff', '#2e2c38'],
      'box-fill': ['#ffffff', '#2e2c38'],
      'box-stroke': ['none', 'none'],
      'box-in-zone': ['#ffffff', '#2e2c38'],
      'start-fill': ['#ffffff', '#2e2c38'],
      'start-stroke': ['#7447c8', '#7447c8'],
      'start-ink': ['#1c1a24', '#ecebf2'],
      'decision-fill': ['#7447c8', '#7447c8'],
      'decision-stroke': ['none', 'none'],
      'decision-ink': ['#ffffff', '#ffffff'],
      'active-fill': ['#f2edff', ACCENT_TINT],
      'active-stroke': ['#7447c8', '#7447c8'],
      'note-fill': ['#eeecf5', '#1c1b22'],
      'note-stroke': ['none', 'none'],
      'note-in-zone': ['#ffffff', '#2e2c38'],
      rule: ['#ecebf1', '#33313d'],
      'rule-in-zone': ['#ecebf1', '#474454'],
      edge: ['#8f8c9b', '#7d7a8c'],
      'edge-msg': ['#8f8c9b', '#7d7a8c'],
      lifeline: ['#d3d1dc', '#474454'],
      guide: ['#d3d1dc', '#474454'],
      'chip-fill': ['#ffffff', '#2e2c38'],
      'chip-stroke': ['none', 'none'],
      'chip-accent-fill': ['#ffffff', '#2e2c38'],
      'chip-accent-stroke': ['none', 'none'],
      'tag-fill': ['#f3f2f7', '#3a3846'],
      'tag-fill-zone': ['#ffffff', '#2e2c38'],
      'zone-fill': ['#eeecf5', '#1c1b22'],
      'zone-stroke': ['none', 'none'],
      'zone-plain': ['#f6f5fa', '#17161c'],
      'zone-plain-stroke': ['#d3d1dc', '#474454'],
      'zone-dash': ['#d3d1dc', '#474454'],
      frame: ['#d3d1dc', '#474454'],
      panel: ['#ffffff', '#2e2c38'],
      grid: ['#d3d1dc', '#474454'],
      axis: ['none', 'none'],
      bar: ['#e3d6fe', ACCENT_TINT],
      data: ['#7447c8', '#7447c8'],
      'dot-fill': ['#7447c8', '#7447c8'],
      'dot-stroke': ['#ffffff', '#2e2c38'],
      value: ['#1c1a24', '#ecebf2'],
    },
    metrics: {
      'box-w': '0',
      'start-w': '1.5',
      'decision-w': '0',
      'active-w': '1.5',
      'note-w': '0',
      'rule-w': '1',
      'edge-w': '1.75',
      dash: '4 5',
      'dash-msg': '4 5',
      'lifeline-w': '1.25',
      'guide-w': '1.25',
      'chip-w': '0',
      'zone-w': '0',
      'zone-plain-w': '1.25',
      'zone-dash-w': '1.5',
      'frame-w': '1.25',
      'grid-w': '1.5',
      'grid-dash': '0.1 6',
      'data-w': '3',
      'value-weight': '600',
      'tint-stroke-w': '0',
      overlap: '0.16',
      'overlap-w': '1.75',
      port: 'inline',
    },
    boxRadius: 16,
    roundRadius: 24,
    zoneRadius: 20,
    bend: 14,
    lineWidth: 1.75,
    barWidth: 10,
    barTop: 5,
    dataWidth: 3,
    dotRadius: 5.5,
    arrow: { kind: 'open', length: 8, width: 10, wing: 5 },
    msgArrow: { kind: 'filled', length: 8, width: 8, stroke: 1.5 },
    shadow: true,
    interpolation: 'monotone',
    valueLabel: 'outside',
  },
};
