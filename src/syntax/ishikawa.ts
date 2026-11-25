import type { SyntaxEntry } from './entry.ts';

export const ishikawa: SyntaxEntry = {
  name: "ishikawa",
  headers: ["ishikawa-beta"],
  summary: "the causes of one effect",
  example: `ishikawa-beta
  Slow checkout
  People
    New staff
  Process
    Manual card entry
    Long queue
  Tools
    Old card reader`,
  rules: [
    "The first line under the header is the effect.",
    "Each line one step in is a category; lines further in are its causes.",
    "Indent with spaces; deeper causes nest under the line above.",
  ],
  keywords: [],
  indented: true,
};
