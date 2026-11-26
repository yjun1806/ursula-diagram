// The drawing on the home page: one Mermaid text. scripts/render-home.mjs draws it with this checkout's command at
// build time (the terminal drawings the page shows, and public/assets/hero.svg); SOURCE_KO is the same text with
// Korean labels, drawn as public/assets/ko-hero-text.svg for the In a terminal page.

export const SOURCE = `flowchart LR
  order([Order placed]) --> pay{Paid?}
  pay -->|yes| pick[Pick items]
  pay -->|no| remind[Send reminder]
  remind --> pay
  pick --> ship([Ship])`;

export const SOURCE_KO = `flowchart LR
  order([주문 접수]) --> pay{결제됨?}
  pay -->|예| pick[상품 꺼내기]
  pay -->|아니오| remind[알림 보내기]
  remind --> pay
  pick --> ship([배송])`;

/** The widths of the home page's terminal drawings: a wide screen and a narrow one. */
export const WIDTHS = { wide: 80, narrow: 40 };
