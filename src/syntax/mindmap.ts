import type { SyntaxEntry } from './entry.ts';

export const mindmap: SyntaxEntry = {
  name: "mindmap",
  headers: ["mindmap"],
  summary: "a tree of ideas",
  example: `mindmap
  root((Launch))
    Product
      Pricing
      Docs
    Marketing
      Blog post
      Newsletter`,
  rules: [
    "Indentation makes the tree: a line further in is a child of the line above.",
    "The first line is the root.",
    "Shapes as in flowcharts: id[box], id(round), id((circle)), id{{hexagon}}.",
  ],
  keywords: [],
};
