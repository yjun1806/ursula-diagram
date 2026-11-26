import type { SyntaxEntry } from './entry.ts';

export const gantt: SyntaxEntry = {
  name: "gantt",
  headers: ["gantt"],
  summary: "tasks on a calendar",
  example: `gantt
  title Release
  dateFormat YYYY-MM-DD
  section Build
    Design : a1, 2024-01-01, 5d
    Code   : a2, after a1, 10d
  section Ship
    Test   : a3, after a2, 4d
    Launch : milestone, after a3, 0d`,
  rules: [
    "Task : [tags,] [id,] start, end-or-length; tags are done, active, crit, milestone.",
    "start is a date in dateFormat or 'after id'; a length is 3d, 2w, 12h.",
    "section Name starts a group of tasks.",
    "excludes weekends skips days; axisFormat %b %d sets the date labels.",
    "In a terminal it needs about 30 columns or more.",
  ],
  keywords: ["title", "dateFormat", "axisFormat", "tickInterval", "section", "excludes", "includes", "todayMarker", "weekday", "inclusiveEndDates", "topAxis", "displayMode", "accTitle", "accDescr"],
};
