// The Mermaid text of the single HTML page on the Ways to use pages. The live demo there draws this text, and
// test/use-cases.test.ts checks that the page's HTML snippet holds the same text.
export const ARTIFACT_SAMPLE = `flowchart LR
  Q[Question] --> M[Claude writes Mermaid]
  M --> R[ursula.render]
  R --> P[SVG on the page]`;
