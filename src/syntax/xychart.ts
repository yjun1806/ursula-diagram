import type { SyntaxEntry } from './entry.ts';

export const xychart: SyntaxEntry = {
  name: "xychart",
  headers: ["xychart-beta"],
  summary: "numbers as bars and lines",
  example: `xychart-beta
  title "Sales"
  x-axis [jan, feb, mar, apr]
  y-axis "Revenue" 0 --> 100
  bar [30, 45, 60, 80]
  line [25, 40, 65, 70]`,
  rules: [
    "x-axis [a, b, c] names the categories; x-axis 0 --> 10 makes it numeric.",
    "y-axis \"Title\" min --> max sets the scale.",
    "bar [ ... ] and line [ ... ] give one value per category.",
    "xychart-beta horizontal turns the chart sideways.",
  ],
  keywords: ["title", "x-axis", "y-axis", "bar", "line"],
};
