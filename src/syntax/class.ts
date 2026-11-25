import type { SyntaxEntry } from './entry.ts';

export const klass: SyntaxEntry = {
  name: "class",
  headers: ["classDiagram"],
  summary: "types with fields and how they relate",
  example: `classDiagram
  class Order {
    +String id
    +total() Money
  }
  class Customer {
    +String name
  }
  Customer "1" --> "*" Order : places
  Order *-- LineItem
  Payment <|-- CardPayment`,
  rules: [
    "class Name { ... } lists members: +public, -private, #protected; a name with () is a method.",
    "A <|-- B inheritance, *-- composition, o-- aggregation, --> association, ..> dependency, ..|> realization.",
    "\"1\" and \"*\" beside the names are multiplicities; : text labels the line.",
    "<<interface>> inside the braces marks a stereotype.",
    "namespace Name { ... } groups classes.",
  ],
  keywords: ["class", "namespace", "note", "direction", "classDef", "cssClass", "style", "link", "click", "callback"],
};
