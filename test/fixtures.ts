export const twoLanes = `flowchart LR
  subgraph customer[Customer]
    A[주문 접수] --> B[결제 확인]
    B --> C[배송 준비]
    C --> D[Delivered]
  end
  subgraph warehouse[Warehouse]
    E[Pick items] --> F[Pack]
    F --> G[Label]
    G --> H[Hand over]
  end
  B -->|paid| E
  H --> C
  B ==> I[Notify]
  I -.-> D
  F --> J[Quality check]
  J --> G
  A --> E
`;

export const cycle = `graph LR
  A[Open] --> B[Review]
  B --> C[Approve]
  C --> D[Merge]
  C -->|changes| B
  D --> A
`;

export const topDown = `flowchart TD
  start[Start] --> build[Build]
  build --> unit[Unit tests]
  build --> lint[Lint]
  unit --> pack[Package]
  lint --> pack
  pack --> deploy{Deploy?}
  deploy -->|yes| prod[Production]
  deploy -->|no| stop[Stop]
`;

export const library = `flowchart LR
  subgraph desk[Front desk]
    r1[Member card] --> r2[Check out book]
    r2 --> r3[Due date stamp]
  end
  subgraph shelves[Stacks]
    s1[Locate book] --> s2[Scan barcode]
  end
  r1 --> s1
  s2 --> r2
  r3 -->|reminder| r1
`;

export const korean = `flowchart TD
  a[주문 접수] --> b[결제 확인]
  b --> c[재고 확인<br>창고 A]
  c --> d[배송 시작]
`;
