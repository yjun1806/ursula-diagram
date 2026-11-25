import type { SyntaxEntry } from './entry.ts';

export const eventmodeling: SyntaxEntry = {
  name: "eventmodeling",
  headers: ["eventmodeling"],
  summary: "commands, events and views along time",
  example: `eventmodeling
tf 01 ui CartUI
tf 02 cmd AddItem { description: string }
tf 03 evt ItemAdded
tf 04 rmo CartItems
tf 05 ui CartUI`,
  rules: [
    "tf NN kind Name is one time frame; NN orders them left to right.",
    "Kinds: ui, cmd (command), evt (event), rmo (read model), pcr (processor).",
    "{ field: type } after the name gives the data.",
    "rf (resetframe) starts a new flow; ->> NN points the frame at frame NN.",
    "Each frame is joined to the one before it when the kinds allow it.",
  ],
  keywords: ["tf", "timeframe", "rf", "resetframe", "data", "ui", "cmd", "command", "evt", "event", "rmo", "readmodel", "pcr", "processor"],
};
