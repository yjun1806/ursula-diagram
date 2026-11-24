import type { Graph, GraphEdge, GraphNode, Lane } from '../types.ts';
import { ZONE_NAMES, ZONE_ORDER, zoneOf } from './model.ts';
import type { EventModel, Frame, LaneZone } from './model.ts';

const laneId = (zone: LaneZone, namespace: string | undefined): string => (namespace === undefined ? zone : `${zone}/${namespace}`);

/**
 * The model as a graph of boxes, for a terminal: a frame is a box with its number and kind under the name and its data
 * rows below, a swimlane a lane, and time runs left to right. The lanes stand in the order of the picture: the three
 * zones from top to bottom, the namespaces of a zone in the order they are first written.
 */
export function eventModelGraph(model: EventModel): Graph {
  const lanes: Lane[] = [];
  for (const zone of ZONE_ORDER) {
    for (const f of model.frames) {
      if (zoneOf(f.kind) !== zone) continue;
      const id = laneId(zone, f.namespace);
      if (!lanes.some((l) => l.id === id)) lanes.push({ id, label: f.namespace === undefined ? ZONE_NAMES[zone] : `${ZONE_NAMES[zone]} / ${f.namespace}` });
    }
  }
  const ordered = [...model.frames].sort((a, b) => a.number - b.number);
  const nodes: GraphNode[] = ordered.map((f: Frame) => ({
    id: String(f.number),
    title: f.name,
    lines: [`${f.label} ${f.kind}`, ...f.data],
    shape: 'rect',
    lane: laneId(zoneOf(f.kind), f.namespace),
  }));
  const edges: GraphEdge[] = model.relations.map((r) => ({ from: String(r.from), to: String(r.to), style: 'normal' }));
  return { direction: 'LR', lanes, zones: 'rows', nodes, edges };
}
