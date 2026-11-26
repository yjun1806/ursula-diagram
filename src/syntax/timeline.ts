import type { SyntaxEntry } from './entry.ts';

export const timeline: SyntaxEntry = {
  name: "timeline",
  headers: ["timeline"],
  summary: "events in order",
  example: `timeline
  title Product history
  2021 : Idea
  2022 : First release
       : 1000 users
  section Growth
    2023 : Teams plan
    2024 : Mobile app`,
  rules: [
    "period : event; more events of the same period go on lines that start with :.",
    "section Name groups the periods that follow.",
  ],
  keywords: ["title", "section"],
};
