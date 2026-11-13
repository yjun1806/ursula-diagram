export type Theme = 'solid' | 'outline' | 'card' | 'band';

export const THEMES = ['solid', 'outline', 'card', 'band'] as const;

export const DEFAULT_THEME: Theme = 'band';

type Pair = readonly [string, string];

/** A colour variable: its light and dark values, or the name of another variable it takes its value from. */
type Token = Pair | string;

export interface ThemeSpec {
  tokens: Record<string, Token>;
  /** Corner radius of a rectangular box; rounded boxes add 8 and lanes add 4. */
  boxRadius: number;
  /** Width of the outline of a box; 0 draws none. */
  boxBorder: number;
  /** Whether the start and decision boxes get an accent outline. */
  roleBorder: boolean;
  lineWidth: number;
  dash: string;
  /** Radius of the bends of an edge. */
  bend: number;
  arrow: { kind: 'filled'; length: number; width: number } | { kind: 'open'; length: number; width: number };
  shadow: boolean;
  /** Whether a box's head — the kind of a C4 element, the title compartment of a record — sits on a band of the lane colour cut to the box's corners. */
  headBand: boolean;
  /** Whether a line that ends in an arrowhead and starts bare gets a ring where it leaves its box. */
  portRing: boolean;
  /** Whether edge labels have an outline of their own. */
  chipBorder: boolean;
  /** Whether edge labels have a rim of the background colour around them. */
  chipHalo: boolean;
  /** Whether thick and branch edges and their labels take the accent colour. */
  accentEdges: boolean;
  /** Boxes divided by rules, notes and the small texts at the ends of lines. */
  records: {
    /** Colour token and width of the rule between two compartments; a rule of the page colour is a gap. */
    rule: { token: string; width: number };
    /** Fill of a note, and its outline (width 0 draws none). */
    note: { fill: string; line: string; width: number };
    /** Colour token and weight of the small text at the end of a line. */
    value: { token: string; weight: number };
  };
}

const COMMON: Record<string, Token> = {
  fg: ['#1c1a24', '#ecebf2'],
  muted: ['#6a6775', '#a5a2b3'],
  accent: ['#7447c8', '#a98bf0'],
  'accent-ink': ['#4f2b9a', '#d9c9ff'],
  'on-accent': ['#ffffff', '#ffffff'],
  hair: ['#ecebf1', '#33313d'],
};

export const THEME_SPECS: Record<Theme, ThemeSpec> = {
  solid: {
    tokens: {
      ...COMMON,
      bg: ['transparent', 'transparent'],
      surface: ['#f3f2f7', '#2a2833'],
      border: ['#d3d1dc', '#474454'],
      'start-fill': ['#7447c8', '#7447c8'],
      'start-ink': 'on-accent',
      'decision-fill': ['#e3d6fe', '#3b2d63'],
      'decision-ink': 'accent-ink',
      line: ['#c4c1d0', '#6a6779'],
      lane: ['#f3f2f7', '#211f29'],
      zone: ['#ffffff', '#1a191f'],
      'box-in-lane': ['#ffffff', '#34323e'],
      'chip-fill': ['#f3f2f7', '#2a2833'],
      halo: ['#ffffff', '#1a191f'],
    },
    boxRadius: 18,
    boxBorder: 0,
    roleBorder: false,
    lineWidth: 2.5,
    dash: '2 7',
    bend: 16,
    arrow: { kind: 'filled', length: 10, width: 9.5 },
    shadow: false,
    headBand: false,
    portRing: false,
    chipBorder: false,
    chipHalo: true,
    accentEdges: true,
    records: { rule: { token: 'zone', width: 2 }, note: { fill: 'zone', line: 'hair', width: 2 }, value: { token: 'accent-ink', weight: 600 } },
  },
  outline: {
    tokens: {
      ...COMMON,
      bg: ['transparent', 'transparent'],
      surface: ['#ffffff', '#1d1c23'],
      border: ['#d3d1dc', '#474454'],
      'start-fill': 'surface',
      'start-ink': 'fg',
      'decision-fill': ['#f2edff', '#2b2440'],
      'decision-ink': 'fg',
      line: ['#8f8c9b', '#7d7a8c'],
      lane: ['#f7f6fa', '#211f29'],
      zone: ['#ffffff', '#1a191f'],
      'box-in-lane': 'surface',
      'chip-fill': ['#ffffff', '#1d1c23'],
    },
    boxRadius: 12,
    boxBorder: 1.25,
    roleBorder: true,
    lineWidth: 1.5,
    dash: '5 4',
    bend: 12,
    arrow: { kind: 'filled', length: 8, width: 8 },
    shadow: false,
    headBand: false,
    portRing: false,
    chipBorder: true,
    chipHalo: false,
    accentEdges: true,
    records: { rule: { token: 'hair', width: 1 }, note: { fill: 'lane', line: 'hair', width: 1 }, value: { token: 'fg', weight: 500 } },
  },
  card: {
    tokens: {
      ...COMMON,
      bg: ['#f6f5fa', '#17161c'],
      surface: ['#ffffff', '#2e2c38'],
      border: ['#d3d1dc', '#474454'],
      'start-fill': 'surface',
      'start-ink': 'fg',
      'decision-fill': ['#7447c8', '#7447c8'],
      'decision-ink': 'on-accent',
      line: ['#8f8c9b', '#7d7a8c'],
      lane: ['#eeecf5', '#1c1b22'],
      zone: ['#f6f5fa', '#17161c'],
      'box-in-lane': 'surface',
      'chip-fill': ['#ffffff', '#2e2c38'],
    },
    boxRadius: 16,
    boxBorder: 0,
    roleBorder: true,
    lineWidth: 1.75,
    dash: '4 5',
    bend: 14,
    arrow: { kind: 'open', length: 8, width: 9 },
    shadow: true,
    headBand: false,
    portRing: false,
    chipBorder: false,
    chipHalo: false,
    accentEdges: true,
    records: { rule: { token: 'hair', width: 1 }, note: { fill: 'lane', line: 'hair', width: 0 }, value: { token: 'fg', weight: 600 } },
  },
  band: {
    tokens: {
      fg: ['#201f1e', '#efeeec'],
      muted: ['#5b5b59', '#b2b1af'],
      accent: ['#82641c', '#dab975'],
      'accent-ink': 'accent',
      'on-accent': ['#201f1e', '#171614'],
      hair: ['#e2e1e0', '#2c2b2a'],
      bg: ['transparent', 'transparent'],
      surface: ['#fcfcfa', '#171614'],
      border: ['#484846', '#bebdbb'],
      'start-fill': ['#e5c37a', '#dab975'],
      'start-ink': 'on-accent',
      'decision-fill': 'surface',
      'decision-ink': 'fg',
      line: ['#565554', '#a5a4a2'],
      lane: ['#efeeed', '#252422'],
      zone: ['#fcfcfa', '#171614'],
      'box-in-lane': 'surface',
      'chip-fill': ['#f1f0ef', '#252422'],
      // The fills of dashed boundaries by depth, a step each: lighter than a label chip so a chip still reads on them.
      'tint-outer': ['#f8f7f5', '#1b1a18'],
      'tint-mid': ['#f5f4f2', '#1e1d1b'],
      'tint-inner': ['#f3f2f0', '#21201e'],
    },
    boxRadius: 10,
    boxBorder: 1.5,
    roleBorder: false,
    lineWidth: 1.5,
    dash: '5 4',
    bend: 8,
    arrow: { kind: 'filled', length: 9, width: 9 },
    shadow: false,
    headBand: true,
    portRing: true,
    chipBorder: false,
    chipHalo: false,
    accentEdges: false,
    records: { rule: { token: 'hair', width: 1 }, note: { fill: 'lane', line: 'border', width: 1 }, value: { token: 'fg', weight: 500 } },
  },
};

/** `var(--ursula-<name>, <fallback>)` of a token. An alias reads the variable it points to. */
export function tokenVar(spec: ThemeSpec, name: string, mode: 0 | 1): string {
  let target = name;
  for (let i = 0; i < 4; i++) {
    const t = spec.tokens[target];
    if (typeof t !== 'string') break;
    target = t;
  }
  const t = spec.tokens[target];
  const value = t === undefined || typeof t === 'string' ? 'inherit' : t[mode];
  return `var(--ursula-${target},${value})`;
}

/** Rules of a layered drawing, written once with `$name` placeholders and expanded per colour scheme. */
export function flowRules(spec: ThemeSpec, font: string): string[] {
  const w = spec.lineWidth;
  const stroke = spec.boxBorder > 0 ? `stroke:$border;stroke-width:${spec.boxBorder}` : 'stroke:none';
  const roleStroke = spec.roleBorder ? ';stroke:$accent;stroke-width:1.5' : '';
  const arrowFilled = spec.arrow.kind === 'filled';
  const arrowRule = (colour: string): string =>
    arrowFilled ? `fill:${colour}` : `fill:none;stroke:${colour};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round`;
  return [
    `.ursula{background:$bg;font-family:${font};font-size:12px}`,
    '.ursula-lane{fill:$zone;stroke:$hair;stroke-width:1}',
    '.ursula-lane--tint{fill:$lane}',
    '.ursula-lane-label{fill:$muted;font-size:12px;font-weight:600}',
    `.ursula-node-box{fill:$surface;${stroke}}`,
    '.ursula-node--on-lane .ursula-node-box{fill:$box-in-lane}',
    `[data-role="start"] .ursula-node-box{fill:$start-fill${roleStroke}}`,
    `[data-role="decision"] .ursula-node-box{fill:$decision-fill${roleStroke}}`,
    ...(spec.boxBorder > 0 ? [] : ['.ursula-node-box--lined{stroke:$line;stroke-width:1.25}']),
    '.ursula-node-title{fill:$fg;font-size:13px;font-weight:600}',
    '.ursula-node-line{fill:$muted;font-size:12px;font-weight:400}',
    '[data-role="start"] .ursula-node-title{fill:$start-ink}',
    '[data-role="start"] .ursula-node-line{fill:$start-ink;fill-opacity:.8}',
    '[data-role="decision"] .ursula-node-title{fill:$decision-ink}',
    '[data-role="decision"] .ursula-node-line{fill:$decision-ink;fill-opacity:.8}',
    `.ursula-edge{fill:none;stroke:$line;stroke-width:${w};stroke-linecap:round;stroke-linejoin:round}`,
    ...(spec.accentEdges ? ['.ursula-edge--thick{stroke:$accent}', '.ursula-edge--branch{stroke:$accent}'] : []),
    `.ursula-edge--dotted{stroke-dasharray:${spec.dash}}`,
    `.ursula-arrow{${arrowRule('$line')}}`,
    `.ursula-arrow--accent{${arrowRule(spec.accentEdges ? '$accent' : '$line')}}`,
    ...(spec.chipHalo ? ['.ursula-edge-label-halo{fill:$halo}'] : []),
    `.ursula-edge-label-bg{fill:$chip-fill${spec.chipBorder ? ';stroke:$border;stroke-width:1' : ''}}`,
    '.ursula-edge-label{fill:$muted;font-size:12px;font-weight:500}',
    ...(spec.accentEdges ? ['.ursula-edge-label--thick{fill:$accent}', '.ursula-edge-label--branch{fill:$accent}'] : []),
    ...(spec.portRing ? [`.ursula-port{fill:$surface;stroke:$line;stroke-width:${w}}`] : []),
    '.ursula-legend-rule{stroke:$hair;stroke-width:1}',
    '.ursula-legend-text{fill:$muted;font-size:12px;font-weight:400}',
  ];
}

/**
 * Rules of the record shapes (boxes divided by rules, dots, bar, note, actor), of the marks at the ends of relation
 * lines and of the small texts at their ends. A drawing carries them only when it uses one of them.
 */
export function recordRules(spec: ThemeSpec): string[] {
  const w = spec.lineWidth;
  const { rule, note, value } = spec.records;
  const stroke = (colour: string): string => `fill:none;stroke:${colour};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round`;
  const noteLine = note.width > 0 ? `stroke:$${note.line};stroke-width:${note.width};stroke-linejoin:round` : 'stroke:none';
  return [
    `.ursula-rule{fill:none;stroke:$${rule.token};stroke-width:${rule.width}}`,
    // A face that is white (a box in a filled zone) shows no white gap: its rules are hairlines.
    '.ursula-node--on-lane .ursula-rule{stroke:$hair;stroke-width:1}',
    ...(spec.headBand ? ['.ursula-head-band{fill:$lane}'] : []),
    '.ursula-cell-title{fill:$fg;font-size:13px;font-weight:600}',
    '.ursula-cell-tag{fill:$muted;font-size:11px;font-weight:500}',
    '.ursula-cell-body{fill:$fg;font-size:12px;font-weight:400}',
    '.ursula-start-dot{fill:$accent}',
    `.ursula-end-ring{fill:$zone;stroke:$fg;stroke-width:${w}}`,
    '.ursula-end-core{fill:$fg}',
    '.ursula-bar{fill:$fg}',
    `.ursula-note{fill:$${note.fill};${noteLine}}`,
    `.ursula-note-fold{fill:none;${noteLine}}`,
    `.ursula-actor{${stroke('$line')}}`,
    '.ursula-actor-name{fill:$muted;font-size:12px;font-weight:500}',
    `.ursula-end-stroke{${stroke('$line')}}`,
    '.ursula-end-stroke--accent{stroke:$accent}',
    `.ursula-end-hollow{fill:$zone;stroke:$line;stroke-width:${w};stroke-linejoin:round}`,
    '.ursula-end-hollow--accent{stroke:$accent}',
    `.ursula-end-solid{fill:$line;stroke:$line;stroke-width:${w};stroke-linejoin:round}`,
    '.ursula-end-solid--accent{fill:$accent;stroke:$accent}',
    `.ursula-end-label{fill:$${value.token};font-size:11px;font-weight:${value.weight}}`,
  ];
}

/** How far an edge that ends in an arrowhead stops short of the tip, and the place of the arrowhead that sits on that end. */
export function arrowFit(spec: ThemeSpec): { trim: number; refX: number } {
  const a = spec.arrow;
  if (a.kind === 'filled') return { trim: a.length - 1, refX: 1 };
  return { trim: spec.lineWidth / 2, refX: a.length - spec.lineWidth / 2 };
}

export const SHADOW_FILTER =
  '<filter id="ursula-shadow" x="-20%" y="-30%" width="140%" height="170%">' +
  '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#1c1a24" flood-opacity="0.1"/></filter>';

/** The arrowhead; the line ends `arrowFit(spec).trim` before the tip and the marker's reference point sits on that end. */
export function flowMarker(spec: ThemeSpec, id: string, cls: string): string {
  const { length, width } = spec.arrow;
  const { refX } = arrowFit(spec);
  const cy = width / 2;
  if (spec.arrow.kind === 'filled') {
    return (
      `<marker id="${id}" viewBox="0 0 ${length} ${width}" refX="${refX}" refY="${cy}" markerWidth="${length}" markerHeight="${width}" markerUnits="userSpaceOnUse" orient="auto">` +
      `<path class="${cls}" d="M0 0L${length} ${cy}L0 ${width}z"/></marker>`
    );
  }
  const half = spec.lineWidth / 2;
  const tip = length - half;
  return (
    `<marker id="${id}" viewBox="0 0 ${length} ${width}" refX="${refX}" refY="${cy}" markerWidth="${length}" markerHeight="${width}" markerUnits="userSpaceOnUse" orient="auto" overflow="visible">` +
    `<path class="${cls}" d="M${half} ${half}L${tip} ${cy}L${half} ${width - half}"/></marker>`
  );
}

/** The variables a theme declares, resolved to their light and dark values. */
export function themeValues(theme: Theme): Record<string, readonly [string, string]> {
  const spec = THEME_SPECS[theme];
  return Object.fromEntries(Object.keys(spec.tokens).map((name) => [name, [tokenValue(spec, name, 0), tokenValue(spec, name, 1)] as const]));
}

function tokenValue(spec: ThemeSpec, name: string, mode: 0 | 1): string {
  let t = spec.tokens[name];
  for (let i = 0; i < 4 && typeof t === 'string'; i++) t = spec.tokens[t];
  return t === undefined || typeof t === 'string' ? 'inherit' : t[mode];
}
