import type { SyntaxEntry } from './entry.ts';

export const kanban: SyntaxEntry = {
  name: "kanban",
  headers: ["kanban"],
  summary: "work by column",
  example: `kanban
  todo[To do]
    t1[Write spec]
    t2[Design API]@{ assigned: 'Ana', priority: 'High' }
  doing[In progress]
    t3[Build parser]
  done[Done]
    t4[Set up repo]`,
  rules: [
    "A line at the first indent is a column: id[Title].",
    "Lines indented under it are its cards: id[Text].",
    "@{ assigned: 'x', ticket: 'T-1', priority: 'High' } adds details to a card.",
  ],
  keywords: [],
  indented: true,
};
