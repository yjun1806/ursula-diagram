interface SceneThemeSpec {
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

/** Measures of a drawing made of scene items. */
export const SCENE_THEME: SceneThemeSpec = {
  metrics: {
    'box-w': '1.5',
    'start-w': '1.5',
    'decision-w': '1.5',
    'active-w': '1.5',
    'note-w': '1',
    'rule-w': '1',
    'edge-w': '1.5',
    'edge-thick-w': '3',
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
