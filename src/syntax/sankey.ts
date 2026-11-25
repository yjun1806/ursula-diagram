import type { SyntaxEntry } from './entry.ts';

export const sankey: SyntaxEntry = {
  name: "sankey",
  headers: ["sankey-beta"],
  aliases: ["sankey"],
  summary: "flows and their amounts",
  example: `sankey-beta
Salary,Budget,4000
Side jobs,Budget,800
Budget,Rent,1500
Budget,Food,700
Budget,Savings,2600`,
  rules: [
    "One flow per line: source,target,value (comma separated).",
    "A name with a comma goes in double quotes.",
  ],
  keywords: [],
};
