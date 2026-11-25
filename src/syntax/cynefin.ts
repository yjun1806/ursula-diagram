import type { SyntaxEntry } from './entry.ts';

export const cynefin: SyntaxEntry = {
  name: "cynefin",
  headers: ["cynefin-beta"],
  summary: "situations sorted into the five Cynefin domains",
  example: `cynefin-beta
  title Incident response
  complex
    "Investigate root cause"
  complicated
    "Analyze the logs"
  clear
    "Restart service"
  chaotic
    "Page on-call"
  chaotic --> complex : "Stabilized"`,
  rules: [
    "The domains are complex, complicated, clear, chaotic and confusion.",
    "Quoted lines indented under a domain are its items.",
    "a --> b : \"text\" draws a move between two domains.",
  ],
  keywords: ["title", "complex", "complicated", "clear", "chaotic", "confusion"],
};
