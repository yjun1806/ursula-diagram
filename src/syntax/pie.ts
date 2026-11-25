import type { SyntaxEntry } from './entry.ts';

export const pie: SyntaxEntry = {
  name: "pie",
  headers: ["pie"],
  summary: "parts of a whole",
  example: `pie title Pets
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15`,
  rules: [
    "\"Label\" : value, one slice per line; values are positive numbers.",
    "pie showData prints the values; title Text names the chart.",
  ],
  keywords: ["title", "showData"],
};
