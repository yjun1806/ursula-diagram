import type { SyntaxEntry } from './entry.ts';

export const block: SyntaxEntry = {
  name: "block",
  headers: ["block-beta"],
  aliases: ["block"],
  summary: "blocks on a grid",
  example: `block-beta
  columns 3
  web["Web"] api["API"] db[("Database")]
  web --> api
  api --> db`,
  rules: [
    "columns N sets how many blocks a row holds; blocks fill rows in order.",
    "id[\"Text\"] is a block; shapes as in flowcharts; space leaves a gap.",
    "block:id ... end nests blocks; id:2 spans two columns.",
    "a --> b joins two blocks.",
  ],
  keywords: ["columns", "block", "end", "space", "style", "classDef", "class"],
};
