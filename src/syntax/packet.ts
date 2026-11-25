import type { SyntaxEntry } from './entry.ts';

export const packet: SyntaxEntry = {
  name: "packet",
  headers: ["packet-beta"],
  aliases: ["packet"],
  summary: "the bits of a packet header",
  example: `packet-beta
  0-15: "Source port"
  16-31: "Destination port"
  32-63: "Sequence number"
  64-95: "Acknowledgment number"`,
  rules: [
    "start-end: \"Name\" covers bits start to end; a single bit is n: \"Name\".",
    "+n: \"Name\" takes the next n bits.",
    "Rows hold 32 bits.",
  ],
  keywords: ["title"],
};
