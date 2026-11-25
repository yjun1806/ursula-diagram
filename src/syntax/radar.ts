import type { SyntaxEntry } from './entry.ts';

export const radar: SyntaxEntry = {
  name: "radar",
  headers: ["radar-beta"],
  summary: "scores of a few things on several axes",
  example: `radar-beta
  axis speed["Speed"], cost["Cost"], ease["Ease"]
  curve a["Plan A"]{4, 2, 5}
  curve b["Plan B"]{3, 4, 2}
  max 5`,
  rules: [
    "axis id[\"Name\"], ... lists the axes.",
    "curve id[\"Name\"]{n, n, ...} gives one value per axis, in order.",
    "max and min set the scale.",
  ],
  keywords: ["title", "axis", "curve", "max", "min", "ticks", "showLegend", "graticule"],
};
