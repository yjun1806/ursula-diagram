import type { SyntaxEntry } from './entry.ts';

export const c4: SyntaxEntry = {
  name: "c4",
  headers: ["C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment"],
  summary: "systems, containers and who uses them",
  example: `C4Context
  title Online shop
  Person(customer, "Customer", "Buys things")
  System(shop, "Shop", "Takes orders")
  System_Ext(pay, "Payments", "Charges cards")
  Rel(customer, shop, "Places orders")
  Rel(shop, pay, "Charges", "HTTPS")`,
  rules: [
    "Person(id, \"Name\", \"text\"), System(...), Container(id, \"Name\", \"tech\", \"text\"); _Ext for outside ones.",
    "Rel(from, to, \"label\", \"tech\") joins two elements.",
    "System_Boundary(id, \"Name\") { ... } groups elements; also Enterprise_Boundary, Container_Boundary.",
    "The header picks the level: C4Context, C4Container, C4Component, C4Dynamic, C4Deployment.",
  ],
  keywords: ["title", "Person", "Person_Ext", "System", "System_Ext", "SystemDb", "SystemDb_Ext", "SystemQueue", "Container", "Container_Ext", "ContainerDb", "ContainerQueue", "Component", "Component_Ext", "ComponentDb", "Rel", "BiRel", "Rel_U", "Rel_D", "Rel_L", "Rel_R", "Boundary", "System_Boundary", "Enterprise_Boundary", "Container_Boundary", "Deployment_Node", "Node", "UpdateLayoutConfig", "UpdateRelStyle", "UpdateElementStyle"],
};
