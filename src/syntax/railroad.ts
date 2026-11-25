import type { SyntaxEntry } from './entry.ts';

export const railroad: SyntaxEntry = {
  name: "railroad",
  headers: ["railroad-ebnf-beta", "railroad-abnf-beta", "railroad-peg-beta", "railroad-beta"],
  summary: "the grammar of a language as railroad tracks",
  example: `railroad-ebnf-beta
title Number
number = [ "-" ] digit { digit } [ "." digit { digit } ] ;
digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;`,
  rules: [
    "One rule per line: name = expression ; (ends with a semicolon).",
    "EBNF: \"x\" a terminal, name a rule, | a choice, [ x ] optional, { x } repeated.",
    "railroad-abnf-beta and railroad-peg-beta read ABNF and PEG rules instead.",
    "railroad-beta takes sequence(), choice(), optional(), zeroOrMore(), terminal(\"x\"), nonterminal(\"y\").",
  ],
  keywords: ["title"],
};
