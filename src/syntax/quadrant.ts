import type { SyntaxEntry } from './entry.ts';

export const quadrant: SyntaxEntry = {
  name: "quadrant",
  headers: ["quadrantChart"],
  summary: "items on two axes, in four quadrants",
  example: `quadrantChart
  title Campaigns
  x-axis Low reach --> High reach
  y-axis Low engagement --> High engagement
  quadrant-1 Expand
  quadrant-2 Promote
  quadrant-3 Re-evaluate
  quadrant-4 Improve
  Campaign A: [0.3, 0.6]
  Campaign B: [0.78, 0.34]`,
  rules: [
    "Name: [x, y] places a point; x and y run from 0 to 1.",
    "x-axis Low --> High and y-axis Low --> High name the ends of each axis.",
    "quadrant-1 is top right, 2 top left, 3 bottom left, 4 bottom right.",
  ],
  keywords: ["title", "x-axis", "y-axis", "quadrant-1", "quadrant-2", "quadrant-3", "quadrant-4", "classDef"],
};
