import type { SyntaxEntry } from './entry.ts';

export const architecture: SyntaxEntry = {
  name: "architecture",
  headers: ["architecture-beta"],
  aliases: ["architecture"],
  summary: "services in groups and what connects them",
  example: `architecture-beta
  group api(cloud)[API]
  service db(database)[Database] in api
  service server(server)[Server] in api
  service web(internet)[Web]
  web:R --> L:server
  server:R -- L:db`,
  rules: [
    "service id(icon)[Name] in group; icons: cloud, database, disk, internet, server.",
    "group id(icon)[Name] holds services; groups can sit in groups.",
    "a:R -- L:b joins the right side of a to the left of b; sides are L, R, T, B.",
    "--> puts an arrowhead at the end, <--> at both.",
  ],
  keywords: ["group", "service", "junction"],
};
