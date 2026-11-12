import type { GraphEdge, LayoutEdge } from './types.ts';

/** The fields of a graph edge that a layout edge carries on: its id, its ends and whether it is drawn. */
export function endFields(e: GraphEdge): Pick<LayoutEdge, 'id' | 'startEnd' | 'end' | 'invisible'> {
  return {
    ...(e.id === undefined ? {} : { id: e.id }),
    ...(e.startEnd === undefined ? {} : { startEnd: e.startEnd }),
    ...(e.end === undefined ? {} : { end: e.end }),
    ...(e.invisible === undefined ? {} : { invisible: e.invisible }),
  };
}
