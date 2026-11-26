// Broken texts for the error tests: for every diagram type, a misspelt header, a line cut short, and a wrong line.
// Each case replaces one line of the catalog example; `line` counts from 0.
import { SYNTAX } from '../src/syntax/index.ts';

export interface BrokenCase {
  type: string;
  kind: 'header' | 'cut' | 'wrong';
  line: number;
  text: string;
}

const CUT_AND_WRONG: Record<string, [number, string, number, string]> = {
  flowchart: [4, '  remind -.->', 5, '  subgrap wh[Warehouse]'],
  sequence: [1, '  actor', 2, '  participnt A as App'],
  state: [2, '  Idle -->', 5, '  Running --> Done :: finish'],
  class: [9, '  Customer "1" -->', 9, '  Customer "1" --> "*" Order places'],
  er: [1, '  CUSTOMER ||--o{', 1, '  CUSTOMER ||--o ORDER : places'],
  gantt: [5, '    Code', 3, '  sectoin Build'],
  journey: [3, '    Search events', 2, '  sectoin Find'],
  eventmodeling: [3, 'tf 03 evt', 4, 'tf 04 rmx CartItems'],
  ishikawa: [3, ' New staff', 3, 'New staff'],
  cynefin: [10, '  chaotic -->', 4, '  complicted'],
  git: [7, '  merge', 3, '  chekout feature'],
  kanban: [3, "    t2[Design API]@{ assigned: 'Ana'", 1, '  todo[]'],
  mindmap: [1, '  root(())', 2, '  Product'],
  quadrant: [8, '  Campaign A: [0.3,', 2, '  x-axs Low reach --> High reach'],
  railroad: [2, 'number = [ "-" ] digit {', 1, 'titel Number'],
  block: [3, '  web -->', 2, '  web["Web" api["API"] db[("Database")]'],
  pie: [1, '  "Dogs" :', 0, 'pie titel Pets'],
  packet: [2, '  16-31:', 1, '  0-15 "Source port"'],
  radar: [2, '  curve a["Plan A"]{4, 2', 4, '  maxx 5'],
  requirement: [10, '  auth_service - satisfies ->', 7, '  elemnt auth_service {'],
  sankey: [3, 'Budget,Rent', 3, 'Budget,Rent,lots'],
  architecture: [5, '  web:R -->', 4, '  servce web(internet)[Web]'],
  timeline: [2, '  : Idea', 0, 'timeline UP'],
  treeview: [3, '   utils.ts', 1, '  "src'],
  usecase: [7, 'Customer -->', 2, 'actr Customer'],
  treemap: [2, '  "Pages": ', 2, '  "Pages: 40'],
  venn: [5, '  union Desirable,', 2, '  sett Desirable'],
  c4: [5, '  Rel(customer, shop, "Places orders"', 3, '  Sytem(shop, "Shop", "Takes orders")'],
  wardley: [3, 'component Tea [0.63,', 3, 'compnent Tea [0.63, 0.81]'],
  xychart: [4, '  bar [30, 45', 4, '  barr [30, 45, 60, 80]'],
  zenuml: [3, '  Client->', 1, '  titel Order'],
};

/** The header with its third letter left out. */
function misspelt(word: string): string {
  const at = 2;
  return word.slice(0, at) + word.slice(at + 1);
}

export const CASES: BrokenCase[] = SYNTAX.flatMap((e): BrokenCase[] => {
  const header = e.example.split('\n')[0] ?? '';
  const word = header.trim().split(/\s/)[0] ?? '';
  const [cutLine, cut, wrongLine, wrong] = CUT_AND_WRONG[e.name] ?? [0, '', 0, ''];
  return [
    { type: e.name, kind: 'header', line: 0, text: header.replace(word, misspelt(word)) },
    { type: e.name, kind: 'cut', line: cutLine, text: cut },
    { type: e.name, kind: 'wrong', line: wrongLine, text: wrong },
  ];
});

/** The catalog example of `type` with line `line` replaced by `text`. */
export function withLine(type: string, line: number, text: string): string {
  const rows = (SYNTAX.find((e) => e.name === type)?.example ?? '').split('\n');
  rows[line] = text;
  return rows.join('\n');
}
