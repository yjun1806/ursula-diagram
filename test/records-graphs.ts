import type { Compartment, Direction, EdgeEnd, Graph, GraphEdge, GraphNode, NodeShape } from '../src/types.ts';

const LANE = { id: '_', label: '' };

export function box(id: string, name: string, ...rest: string[][]): GraphNode {
  const compartments: Compartment[] = [{ lines: [name] }, ...rest.map((lines) => ({ lines }))];
  return { id, title: name, lines: [], shape: 'rect', lane: LANE.id, compartments };
}

export function shaped(id: string, shape: NodeShape, title = ''): GraphNode {
  return { id, title: title === '' ? id : title, lines: [], shape, lane: LANE.id };
}

export function link(from: string, to: string, end: EdgeEnd, extra: Partial<GraphEdge> = {}): GraphEdge {
  return { from, to, style: 'normal', end, ...extra };
}

export function graphOf(direction: Direction, nodes: GraphNode[], edges: GraphEdge[]): Graph {
  return { direction, lanes: [LANE], nodes, edges };
}

/** An inheritance tree: three classes that extend one. */
export function inheritance(): Graph {
  return graphOf(
    'TD',
    [
      box('Animal', 'Animal', ['+int age', '+String gender'], ['+isMammal()', '+mate()']),
      box('Duck', 'Duck', ['+String beakColor'], ['+swim()', '+quack()']),
      box('Fish', 'Fish', ['-int sizeInFeet'], ['-canEat()']),
      box('Zebra', 'Zebra', ['+bool is_wild'], ['+run()']),
    ],
    [
      link('Animal', 'Duck', 'none', { startEnd: 'triangle-open' }),
      link('Animal', 'Fish', 'none', { startEnd: 'triangle-open' }),
      link('Animal', 'Zebra', 'none', { startEnd: 'triangle-open' }),
    ],
  );
}

/** Composition, aggregation and dependency, with multiplicities. */
export function relations(): Graph {
  return graphOf(
    'LR',
    [
      box('Car', 'Car', ['+String model'], ['+drive()']),
      box('Engine', 'Engine', ['+int power'], ['+start()']),
      box('Library', 'Library', ['+String name'], ['+lend()']),
      box('Book', 'Book', ['+String title'], []),
      box('Order', 'Order', ['+int total'], ['+pay()']),
      box('Payment', 'Payment', [], ['+charge()']),
    ],
    [
      link('Car', 'Engine', 'none', { startEnd: 'diamond-filled', startLabel: '1', endLabel: '1' }),
      link('Library', 'Book', 'none', { startEnd: 'diamond-open', startLabel: '1', endLabel: '0..*' }),
      link('Order', 'Payment', 'arrow-open', { style: 'dotted' }),
    ],
  );
}

/** Customers, orders, items and products with the five crow's-foot marks. */
export function entities(): Graph {
  const columns = (rows: Array<[string, string]>): string[] => rows.map(([type, name]) => `${type}  ${name}`);
  return graphOf(
    'LR',
    [
      box('CUSTOMER', 'CUSTOMER', columns([['string', 'id'], ['string', 'name'], ['string', 'email']])),
      box('ORDER', 'ORDER', columns([['string', 'id'], ['date', 'orderDate'], ['string', 'status']])),
      box('ORDER_ITEM', 'ORDER_ITEM', columns([['int', 'quantity'], ['float', 'price']])),
      box('PRODUCT', 'PRODUCT', columns([['string', 'id'], ['string', 'name'], ['float', 'price']])),
      box('NOTE', 'NOTE', columns([['string', 'text']])),
    ],
    [
      link('CUSTOMER', 'ORDER', 'zero-many', { startEnd: 'one', label: 'places' }),
      link('ORDER', 'ORDER_ITEM', 'one-many', { startEnd: 'one', label: 'contains' }),
      link('PRODUCT', 'ORDER_ITEM', 'many', { startEnd: 'zero-one', label: 'includes' }),
      link('PRODUCT', 'NOTE', 'one', { startEnd: 'one' }),
    ],
  );
}

/** A state machine: start dot, states, a fork bar, a note and the end dot. */
export function states(): Graph {
  return graphOf(
    'TD',
    [
      shaped('start', 'start-dot'),
      shaped('Still', 'rect', 'Still'),
      shaped('fork', 'bar'),
      shaped('Moving', 'rect', 'Moving'),
      shaped('Crash', 'rect', 'Crash'),
      shaped('note', 'note', 'Stops here'),
      shaped('end', 'end-dot'),
    ],
    [
      link('start', 'Still', 'arrow'),
      link('Still', 'fork', 'arrow'),
      link('fork', 'Moving', 'arrow'),
      link('Moving', 'Crash', 'arrow'),
      link('Crash', 'end', 'arrow'),
      link('note', 'Crash', 'none', { style: 'dotted' }),
    ],
  );
}

/** Two actors and four use cases. */
export function usecases(): Graph {
  return graphOf(
    'LR',
    [
      shaped('user', 'actor', 'User'),
      shaped('admin', 'actor', 'Administrator'),
      shaped('login', 'ellipse', 'Log in'),
      shaped('profile', 'ellipse', 'View profile'),
      shaped('manage', 'ellipse', 'Manage users'),
      shaped('reports', 'ellipse', 'View reports'),
    ],
    [
      link('user', 'login', 'arrow'),
      link('user', 'profile', 'arrow'),
      link('admin', 'manage', 'arrow'),
      link('admin', 'reports', 'arrow'),
    ],
  );
}
