import type { SyntaxEntry } from './entry.ts';

export const usecase: SyntaxEntry = {
  name: "usecase",
  headers: ["usecase-beta"],
  summary: "actors and what they can do",
  example: `usecase-beta
direction LR
actor Customer
systemBoundary Shop
  Browse("Browse catalogue")
  Checkout("Check out")
end
Customer --> Browse
Customer --> Checkout
Checkout ..> : include Browse`,
  rules: [
    "actor Name declares a person or system outside.",
    "systemBoundary Name ... end holds the use cases: id(\"Text\").",
    "A --> B joins an actor to a use case.",
    "a ..> : include b and a ..> : extend b are the dashed relations.",
  ],
  keywords: ["actor", "systemBoundary", "end", "direction", "classDef", "class", "style"],
};
