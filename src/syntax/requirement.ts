import type { SyntaxEntry } from './entry.ts';

export const requirement: SyntaxEntry = {
  name: "requirement",
  headers: ["requirementDiagram"],
  summary: "requirements and what satisfies them",
  example: `requirementDiagram
  requirement login {
    id: 1
    text: Users sign in.
    risk: medium
    verifymethod: test
  }
  element auth_service {
    type: service
  }
  auth_service - satisfies -> login`,
  rules: [
    "requirement name { id: text: risk: verifymethod: } declares one; also functionalRequirement and others.",
    "element name { type: docref: } is what meets or checks it.",
    "a - satisfies -> b; other kinds: contains, copies, derives, verifies, refines, traces.",
  ],
  keywords: ["requirement", "functionalRequirement", "interfaceRequirement", "performanceRequirement", "physicalRequirement", "designConstraint", "element", "direction", "style", "classDef", "class"],
};
