import type { SyntaxEntry } from './entry.ts';

export const treeview: SyntaxEntry = {
  name: "treeview",
  headers: ["treeView-beta"],
  aliases: ["treeView"],
  summary: "a file tree",
  example: `treeView-beta
  src
    index.ts
    utils.ts
  test
    index.test.ts
  package.json`,
  rules: [
    "Indentation makes the tree; a line further in is inside the line above.",
    "Lines drawn with \u251c\u2500\u2500 and \u2514\u2500\u2500 are read as well.",
    "name ## text adds a note beside an entry.",
  ],
  keywords: [],
  indented: true,
};
