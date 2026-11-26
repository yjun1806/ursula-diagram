// The drawing on the home page: one Mermaid text and what the engine draws from it. The text drawings are the output
// of `ursula-diagram order.mmd --format text --width <n>`, pasted unedited; the SVG is public/assets/hero.svg.

export const SOURCE = `flowchart LR
  order([Order placed]) --> pay{Paid?}
  pay -->|yes| pick[Pick items]
  pay -->|no| remind[Send reminder]
  remind --> pay
  pick --> ship([Ship])`;

export const TEXT_WIDE = { width: 80, text: `                                         ╭────────────╮   ╭────────────╮
                                ┌─ yes ─▶│ Pick items │──▶│    Ship    │
╭────────────╮   ╭────────────╮ │        ╰────────────╯   ╰────────────╯
│   Order    │──▶│   Paid?    │─┤
│   placed   │   ╰────────────╯ │        ╭────────────╮
╰────────────╯          ▲       └─ no ──▶│    Send    │
                        │                │  reminder  │
                        │                ╰────────────╯
                        │                       │
                        └───────────────────────┘` };

export const TEXT_NARROW = { width: 40, text: `           ╭───────────────╮
           │ Order placed  │
           ╰───────────────╯
                   │
                   ▼
           ╭───────────────╮
           │     Paid?     │
           ╰───────────────╯
       ┌─── no ──┘▲│  yes
       │ ┌────────┘▼
       │ │ ╭───────────────╮
       │ │ │  Pick items   │
       │ │ ╰───────────────╯
       ▼ │         │
╭───────────────╮  │
│ Send reminder │  │
╰───────────────╯  │
                   ▼
           ╭───────────────╮
           │     Ship      │
           ╰───────────────╯` };
