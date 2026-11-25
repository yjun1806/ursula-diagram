// The texts the playground offers: the files in examples/ and the Mermaid text of the README gallery.

const files = import.meta.glob('../../../../examples/*.mmd', { query: '?raw', import: 'default', eager: true });

function fromFile(name) {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${name}`));
  return entry ? entry[1] : '';
}

const gallery = {
  flowchart: `flowchart LR
  A([Start]) --> B{Valid?}
  B -->|yes| C[Save]
  B -->|no| D[Show error]
  D --> A
  C --> E([Done])
`,
  sequence: `sequenceDiagram
  actor U as User
  participant W as Web
  participant A as Auth API
  participant D as DB
  U->>W: Log in
  W->>A: POST /login
  A->>D: Find user
  D-->>A: Record
  A-->>W: Token
  W-->>U: Dashboard
`,
  class: `classDiagram
  class Order {
    +id: string
    +total(): number
  }
  class Line {
    +qty: number
  }
  class Product {
    +name: string
  }
  class Customer {
    +email: string
  }
  Customer "1" --> "*" Order
  Order *-- "1..*" Line
  Line --> Product
`,
  state: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Draft: changes
  Review --> Published: approve
  Published --> Archived: retire
  Archived --> [*]
`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  PRODUCT ||--o{ LINE_ITEM : "ordered in"
  CUSTOMER {
    string id PK
    string email
  }
  ORDER {
    string id PK
    date placed
  }
`,
  c4: `C4Context
  Person(buyer, "Shopper", "Buys things")
  System(store, "Web Shop", "Takes orders")
  System_Ext(pay, "Payment Gateway", "Charges cards")
  System_Ext(mail, "Mail Service", "Sends email")
  Rel(buyer, store, "Orders from")
  Rel(store, pay, "Charges via")
  Rel(store, mail, "Sends receipts via")
`,
  gantt: `gantt
  title Release
  dateFormat YYYY-MM-DD
  section Build
  Design   :a1, 2026-01-05, 5d
  Engine   :a2, after a1, 10d
  section Ship
  Docs     :b1, after a2, 4d
  Release  :milestone, after b1, 0d
`,
  mindmap: `mindmap
  root((Diagrams))
    Flow
      Flowchart
      Swimlanes
    Structure
      Class
      ER
    Time
      Gantt
      Timeline
`,
  pie: `pie title Pets
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15
`,
};

export const EXAMPLES = [
  { id: 'order-flow', label: 'Order flow (examples/order-flow.mmd)', src: fromFile('order-flow.mmd') },
  { id: 'login-sequence', label: 'Login sequence (examples/login-sequence.mmd)', src: fromFile('login-sequence.mmd') },
  { id: 'checkout-sequence', label: 'Checkout sequence (examples/checkout-sequence.mmd)', src: fromFile('checkout-sequence.mmd') },
  { id: 'c4-container', label: 'C4 container (examples/c4-container.mmd)', src: fromFile('c4-container.mmd') },
  { id: 'c4-deployment', label: 'C4 deployment (examples/c4-deployment.mmd)', src: fromFile('c4-deployment.mmd') },
  { id: 'flowchart', label: 'Gallery: flowchart', src: gallery.flowchart },
  { id: 'sequence', label: 'Gallery: sequence', src: gallery.sequence },
  { id: 'class', label: 'Gallery: class', src: gallery.class },
  { id: 'state', label: 'Gallery: state', src: gallery.state },
  { id: 'er', label: 'Gallery: entity relationship', src: gallery.er },
  { id: 'c4', label: 'Gallery: C4 context', src: gallery.c4 },
  { id: 'gantt', label: 'Gallery: Gantt', src: gallery.gantt },
  { id: 'mindmap', label: 'Gallery: mindmap', src: gallery.mindmap },
  { id: 'pie', label: 'Pie', src: gallery.pie },
];
