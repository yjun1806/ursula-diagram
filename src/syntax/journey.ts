import type { SyntaxEntry } from './entry.ts';

export const journey: SyntaxEntry = {
  name: "journey",
  headers: ["journey"],
  summary: "how a user feels at each step",
  example: `journey
  title Buying a ticket
  section Find
    Search events: 4: Me
    Compare prices: 2: Me, Friend
  section Pay
    Enter card: 3: Me
    Get ticket: 5: Me`,
  rules: [
    "Task: score: who; the score runs from 1 (bad) to 5 (good).",
    "Several people are separated by commas.",
    "section Name groups the tasks that follow.",
  ],
  keywords: ["title", "section", "accTitle", "accDescr"],
};
