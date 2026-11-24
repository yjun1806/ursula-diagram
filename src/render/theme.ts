interface ThemeSpec {
  /** Corner radius of a rectangular box; rounded boxes add 8 and lanes add 4. */
  boxRadius: number;
  /** Width of the outline of a box. */
  boxBorder: number;
  lineWidth: number;
  dash: string;
  /** Radius of the bends of an edge. */
  bend: number;
  /** The filled arrowhead at the end of an edge. */
  arrow: { length: number; width: number };
}

/** Measures of a layered drawing. */
export const THEME: ThemeSpec = {
  boxRadius: 10,
  boxBorder: 1.5,
  lineWidth: 1.5,
  dash: '5 4',
  bend: 8,
  arrow: { length: 9, width: 9 },
};

const { lineWidth } = THEME;

/** Rules of a layered drawing, written once with `$name` placeholders and expanded per colour scheme. */
export function flowRules(font: string): string[] {
  const w = lineWidth;
  return [
    `.ursula{background:$bg;font-family:${font};font-size:12px}`,
    '.ursula-lane{fill:$surface;stroke:$hair;stroke-width:1}',
    '.ursula-lane--tint{fill:$lane}',
    '.ursula-lane-label{fill:$fg;font-size:13px;font-weight:600}',
    `.ursula-node-box{fill:$surface;stroke:$border;stroke-width:${THEME.boxBorder}}`,
    '.ursula-node--on-lane .ursula-node-box{fill:$surface}',
    '[data-role="start"] .ursula-node-box{fill:$start-fill}',
    '[data-role="decision"] .ursula-node-box{fill:$surface}',
    '.ursula-node-title{fill:$fg;font-size:13px;font-weight:600}',
    '.ursula-node-line{fill:$muted;font-size:12px;font-weight:400}',
    '[data-role="start"] .ursula-node-title{fill:$on-accent}',
    '[data-role="start"] .ursula-node-line{fill:$on-accent;fill-opacity:.8}',
    '[data-role="decision"] .ursula-node-title{fill:$fg}',
    '[data-role="decision"] .ursula-node-line{fill:$fg;fill-opacity:.8}',
    `.ursula-edge{fill:none;stroke:$line;stroke-width:${w};stroke-linecap:round;stroke-linejoin:round}`,
    `.ursula-edge--dotted{stroke-dasharray:${THEME.dash}}`,
    '.ursula-arrow{fill:$line}',
    '.ursula-arrow--accent{fill:$line}',
    '.ursula-edge-label-bg{fill:$chip-fill}',
    '.ursula-edge-label{fill:$muted;font-size:12px;font-weight:500}',
    `.ursula-port{fill:$surface;stroke:$line;stroke-width:${w}}`,
    '.ursula-legend-rule{stroke:$hair;stroke-width:1}',
    '.ursula-legend-text{fill:$muted;font-size:12px;font-weight:400}',
  ];
}

/**
 * Rules of the record shapes (boxes divided by rules, dots, bar, note, actor), of the marks at the ends of relation
 * lines and of the small texts at their ends. A drawing carries them only when it uses one of them.
 */
export function recordRules(): string[] {
  const w = lineWidth;
  const stroke = (colour: string): string => `fill:none;stroke:${colour};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round`;
  const noteLine = 'stroke:$border;stroke-width:1;stroke-linejoin:round';
  return [
    '.ursula-rule{fill:none;stroke:$hair;stroke-width:1}',
    // A face that is white (a box in a filled zone) shows no white gap: its rules are hairlines.
    '.ursula-node--on-lane .ursula-rule{stroke:$hair;stroke-width:1}',
    '.ursula-head-band{fill:$lane}',
    '.ursula-cell-title{fill:$fg;font-size:13px;font-weight:600}',
    '.ursula-cell-tag{fill:$muted;font-size:11px;font-weight:500}',
    '.ursula-cell-body{fill:$fg;font-size:12px;font-weight:400}',
    '.ursula-start-dot{fill:$accent}',
    `.ursula-end-ring{fill:$surface;stroke:$fg;stroke-width:${w}}`,
    '.ursula-end-core{fill:$fg}',
    '.ursula-bar{fill:$fg}',
    `.ursula-note{fill:$lane;${noteLine}}`,
    `.ursula-note-fold{fill:none;${noteLine}}`,
    `.ursula-actor{${stroke('$line')}}`,
    '.ursula-actor-name{fill:$muted;font-size:12px;font-weight:500}',
    `.ursula-end-stroke{${stroke('$line')}}`,
    '.ursula-end-stroke--accent{stroke:$accent}',
    `.ursula-end-hollow{fill:$surface;stroke:$line;stroke-width:${w};stroke-linejoin:round}`,
    '.ursula-end-hollow--accent{stroke:$accent}',
    `.ursula-end-solid{fill:$line;stroke:$line;stroke-width:${w};stroke-linejoin:round}`,
    '.ursula-end-solid--accent{fill:$accent;stroke:$accent}',
    '.ursula-end-label{fill:$fg;font-size:11px;font-weight:500}',
  ];
}

/** How far an edge that ends in an arrowhead stops short of the tip; the arrowhead overlaps the end of the line by 1. */
export const ARROW_TRIM = THEME.arrow.length - 1;

/** The arrowhead; the line ends `ARROW_TRIM` before the tip and the marker's reference point sits on that end. */
export function flowMarker(id: string, cls: string): string {
  const { length, width } = THEME.arrow;
  const cy = width / 2;
  return (
    `<marker id="${id}" viewBox="0 0 ${length} ${width}" refX="1" refY="${cy}" markerWidth="${length}" markerHeight="${width}" markerUnits="userSpaceOnUse" orient="auto">` +
    `<path class="${cls}" d="M0 0L${length} ${cy}L0 ${width}z"/></marker>`
  );
}
