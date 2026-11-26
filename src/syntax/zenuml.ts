import type { SyntaxEntry } from './entry.ts';

export const zenuml: SyntaxEntry = {
  name: "zenuml",
  headers: ["zenuml"],
  summary: "calls between objects, written like code",
  example: `zenuml
  title Order
  @Actor Client
  Client->Shop.order(cart) {
    Stock.reserve(cart)
    if(paid) {
      return receipt
    }
  }`,
  rules: [
    "A->B: text is a message; A->B.method(args) { ... } is a call with what happens inside.",
    "@Actor, @Database, @Boundary and others before a name set its kind.",
    "if(x) { } else { }, while(x) { }, try { } catch { } are the blocks.",
    "return x inside a call draws the reply.",
  ],
  keywords: ["title", "if", "else", "while", "for", "forEach", "loop", "par", "opt", "try", "catch", "finally", "return", "new", "@Actor", "@Database", "@Boundary", "@Control", "@Entity"],
};
