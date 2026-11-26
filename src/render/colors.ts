/** Light and dark value of a colour. */
type Pair = readonly [string, string];

/**
 * Every colour of a drawing. Each is the CSS variable `--ursula-<name>`, read with the value here as its fallback: the
 * first value in the light scheme, the second in the dark one.
 */
export const COLORS: Record<string, Pair> = {
  // Text: names and bodies, second lines and labels, and what stands back.
  fg: ['#201f1e', '#efeeec'],
  muted: ['#5b5b59', '#b2b1af'],
  faint: ['#878685', '#757472'],
  // Strokes: a line between boxes, the outline of a box, and a hairline (a zone outline, a rule, a grid line).
  line: ['#565554', '#a5a4a2'],
  border: ['#484846', '#bebdbb'],
  hair: ['#e2e1e0', '#2c2b2a'],
  // Faces: the page and a box, a filled band (a lane, a zone, a head band, a tag), and a label chip or a note.
  surface: ['#fcfcfa', '#171614'],
  lane: ['#efeeed', '#252422'],
  'chip-fill': ['#f1f0ef', '#252422'],
  // The accent: a stroke or a text, the face of a start box, a pale face, and the text on the face of a start box.
  accent: ['#82641c', '#dab975'],
  'start-fill': ['#e5c37a', '#dab975'],
  'accent-tint': ['#f6ecd7', '#372c15'],
  'on-accent': ['#201f1e', '#171614'],
  // The background of a layered drawing, and the panel behind a chart.
  bg: ['transparent', 'transparent'],
  panel: ['none', 'none'],
  // A neutral bar of a chart.
  bar: ['#c8c7c6', '#434241'],
  // The dashed boundaries of a C4 drawing by depth: the outermost and the innermost take a light fill and the one
  // between them the face of the page, so that depth reads without the drawing growing dark. A label chip on such a
  // fill takes a step past it.
  'tint-outer': ['#f4f3f1', '#1e1d1b'],
  'tint-inner': ['#f6f5f3', '#1c1b19'],
  'tint-chip': ['#ebeae8', '#262523'],
  // The eight series of a chart, each with the pale fill of an area in its colour.
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
};

/** The page behind a drawing, light and dark: the HTML page and a PNG paint it, an SVG leaves it to its host. */
export const PAPER: Pair = ['#ffffff', '#16181d'];

/** A rule with each `$name` placeholder filled by the variable of that colour and its value in one colour scheme. */
export function fillColors(rule: string, mode: 0 | 1): string {
  return rule.replace(/\$([a-z][a-z0-9-]*)/g, (_, name: string) => `var(--ursula-${name},${COLORS[name]?.[mode] ?? 'inherit'})`);
}
