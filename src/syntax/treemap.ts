import type { SyntaxEntry } from './entry.ts';

export const treemap: SyntaxEntry = {
  name: "treemap",
  headers: ["treemap-beta"],
  summary: "sizes of nested parts",
  example: `treemap-beta
"Frontend"
  "Pages": 40
  "Components": 25
"Backend"
  "API": 30
  "Jobs": 10`,
  rules: [
    "\"Name\" alone is a group; \"Name\": value is a leaf with its size.",
    "Indentation puts leaves and groups inside the group above.",
  ],
  keywords: ["classDef"],
  indented: true,
};
