import type { SyntaxEntry } from './entry.ts';

export const venn: SyntaxEntry = {
  name: "venn",
  headers: ["venn-beta"],
  summary: "sets and their overlaps",
  example: `venn-beta
  title Good feature
  set Desirable
  set Feasible
  set Viable
  union Desirable,Feasible["Buildable"]
  union Desirable,Feasible,Viable["Ship it"]`,
  rules: [
    "set Name declares a set; two to four sets.",
    "union A,B[\"Text\"] names the overlap of the sets listed.",
    "set Name:20 gives a size; text lines under a set list its items.",
  ],
  keywords: ["title", "set", "union", "text", "style"],
};
