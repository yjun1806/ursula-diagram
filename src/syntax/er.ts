import type { SyntaxEntry } from './entry.ts';

export const er: SyntaxEntry = {
  name: "er",
  headers: ["erDiagram"],
  summary: "tables and their relations",
  example: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  CUSTOMER {
    string id PK
    string name
  }
  ORDER {
    string id PK
    string customer_id FK
  }`,
  rules: [
    "A ||--o{ B : label is a relation; the label is required.",
    "Ends: || exactly one, |o zero or one, }| one or more, }o zero or more.",
    "-- is an identifying line, .. a non-identifying one.",
    "NAME { type field PK|FK|UK \"comment\" } lists the columns.",
    "NAME[\"Shown name\"] gives a table a longer name.",
  ],
  keywords: ["direction", "style", "classDef", "class"],
};
