import type { SyntaxEntry } from './entry.ts';

export const wardley: SyntaxEntry = {
  name: "wardley",
  headers: ["wardley-beta"],
  summary: "components by visibility and evolution",
  example: `wardley-beta
title Tea shop
anchor Business [0.95, 0.63]
component Tea [0.63, 0.81]
component Kettle [0.43, 0.35]
Business -> Tea
Tea -> Kettle`,
  rules: [
    "[visibility, evolution]: two numbers from 0 to 1; visibility 1 is the top.",
    "'anchor' is the user need; 'component' is everything else.",
    "'A -> B' links two components by their names.",
    "evolve Name 0.8 draws where a component is heading.",
    "(build), (buy), (outsource) and (inertia) after the position mark a component.",
  ],
  keywords: ["title", "anchor", "component", "evolve", "pipeline", "note", "evolution", "size", "annotation", "annotations", "accelerator", "deaccelerator"],
};
