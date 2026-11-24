/** Light and dark value of a colour variable. */
type Pair = readonly [string, string];

interface SceneThemeSpec {
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
  /** Width of a value bar and the radius of its two top corners; the bottom edge is straight. */
  barWidth: number;
  barTop: number;
  /** Radius of a value point. */
  dotRadius: number;
  /** Radius of a plain neutral dot, such as a station of a railroad or a component of a map. */
  neutralDotRadius: number;
  /** Radius of the ring where a line leaves its box. */
  portRadius: number;
  /** The filled arrowhead: `length` is the room it takes along the line, `stroke` the width of its outline. */
  arrow: { length: number; width: number; stroke: number };
}

/** Colours and measures of a drawing made of scene items. */
export const SCENE_THEME: SceneThemeSpec = {
  colors: {
    ink: ['#201f1e', '#efeeec'],
    'ink-2': ['#5b5b59', '#b2b1af'],
    'ink-3': ['#878685', '#757472'],
    line: ['#484846', '#bebdbb'],
    'line-weak': ['#e2e1e0', '#2c2b2a'],
    accent: ['#82641c', '#dab975'],
    'accent-deep': ['#82641c', '#dab975'],
    'accent-mid': ['#e5c37a', '#dab975'],
    'accent-tint': ['#f6ecd7', '#372c15'],
    'accent-tint-2': ['#f6ecd7', '#372c15'],
    'dot-neutral': ['#878685', '#757472'],
    'on-accent': ['#201f1e', '#171614'],
    bg: ['#fcfcfa', '#171614'],
    halo: ['#fcfcfa', '#171614'],
    'box-in-zone': ['#fcfcfa', '#171614'],
    'note-fill': ['#f1f0ef', '#252422'],
    'note-in-zone': ['#f1f0ef', '#252422'],
    'zone-plain': ['#fcfcfa', '#171614'],
    rule: ['#fcfcfa', '#171614'],
    'chip-stroke': ['#fcfcfa', '#171614'],
    'chip-accent-stroke': ['#fcfcfa', '#171614'],
    'box-fill': ['#fcfcfa', '#171614'],
    'box-stroke': ['#484846', '#bebdbb'],
    'start-fill': ['#e5c37a', '#dab975'],
    'start-stroke': ['#484846', '#bebdbb'],
    'start-ink': ['#201f1e', '#171614'],
    'decision-fill': ['#fcfcfa', '#171614'],
    'decision-stroke': ['#484846', '#bebdbb'],
    'decision-ink': ['#201f1e', '#efeeec'],
    'active-fill': ['#f6ecd7', '#372c15'],
    'active-stroke': ['#82641c', '#dab975'],
    'note-stroke': ['#484846', '#bebdbb'],
    'rule-in-zone': ['#e2e1e0', '#2c2b2a'],
    edge: ['#565554', '#a5a4a2'],
    'edge-msg': ['#565554', '#a5a4a2'],
    lifeline: ['#878685', '#757472'],
    guide: ['#e2e1e0', '#2c2b2a'],
    'chip-fill': ['#f1f0ef', '#252422'],
    'chip-accent-fill': ['#f6ecd7', '#372c15'],
    'tag-fill': ['#efeeed', '#252422'],
    'tag-fill-zone': ['#efeeed', '#252422'],
    'zone-fill': ['#fcfcfa', '#171614'],
    'zone-stroke': ['#e2e1e0', '#2c2b2a'],
    'zone-plain-stroke': ['#e2e1e0', '#2c2b2a'],
    'zone-dash': ['#878685', '#757472'],
    frame: ['#e2e1e0', '#2c2b2a'],
    panel: ['none', 'none'],
    grid: ['#e2e1e0', '#2c2b2a'],
    axis: ['#484846', '#bebdbb'],
    bar: ['#c8c7c6', '#434241'],
    data: ['#5b5b59', '#b2b1af'],
    'dot-fill': ['#fcfcfa', '#171614'],
    'dot-stroke': ['#201f1e', '#efeeec'],
    value: ['#201f1e', '#efeeec'],
    s1: ['#82641c', '#cdad69'],
    's1-tint': ['#f1e7d2', '#3f3112'],
    s2: ['#007883', '#5ec3ce'],
    's2-tint': ['#d2eef1', '#093a3f'],
    s3: ['#98524d', '#e79a93'],
    's3-tint': ['#fce1de', '#492826'],
    s4: ['#437746', '#8bc18c'],
    's4-tint': ['#dceedc', '#223a23'],
    s5: ['#878685', '#757472'],
    's5-tint': ['#efeeed', '#252422'],
    s6: ['#a5a4a3', '#6a6967'],
    's6-tint': ['#efeeed', '#252422'],
    s7: ['#5b5b59', '#b2b1af'],
    's7-tint': ['#efeeed', '#252422'],
    s8: ['#c8c7c6', '#434241'],
    's8-tint': ['#efeeed', '#252422'],
  },
  metrics: {
    'box-w': '1.5',
    'start-w': '1.5',
    'decision-w': '1.5',
    'active-w': '1.5',
    'note-w': '1',
    'rule-w': '1',
    'edge-w': '1.5',
    dash: '5 4',
    'dash-msg': '5 4',
    'lifeline-w': '1',
    'guide-w': '1',
    'chip-w': '1',
    'zone-w': '1',
    'zone-plain-w': '1',
    'zone-dash-w': '1.5',
    'frame-w': '1',
    'grid-w': '1',
    'grid-dash': 'none',
    'data-w': '1.5',
    'dot-w': '1.5',
    'value-weight': '500',
    'tint-stroke-w': '0',
    overlap: '0.24',
    'overlap-w': '0',
  },
  boxRadius: 10,
  roundRadius: 18,
  zoneRadius: 18,
  bend: 8,
  barWidth: 40,
  barTop: 14,
  dotRadius: 3.5,
  neutralDotRadius: 4,
  portRadius: 4,
  arrow: { length: 9, width: 9, stroke: 1.5 },
};
