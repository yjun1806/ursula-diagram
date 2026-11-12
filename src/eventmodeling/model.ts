import type { Scene } from '../types.ts';

/** The five element kinds of an event model, by their short names. */
export type FrameKind = 'ui' | 'pcr' | 'cmd' | 'rmo' | 'evt';

export interface Frame {
  /** The frame number as a number; frames are unique by it. */
  number: number;
  /** The frame number as written (`01`). */
  label: string;
  kind: FrameKind;
  /** The identifier without its namespace. */
  name: string;
  /** The part of the identifier before its last dot; absent for an identifier without a dot. */
  namespace?: string;
  /** Written as a reset frame (`rf`, `resetframe`): no relation is inferred into it. */
  reset: boolean;
  /** Data rows, from inline braces and from a referenced data block; empty when the frame has no data. */
  data: string[];
  /** Data type written in backticks before the data, when there is one. */
  dataType?: string;
  line: number;
}

export interface Relation {
  /** Frame numbers. */
  from: number;
  to: number;
  /** True for a relation inferred from the order of the text, false for one written with `->>`. */
  inferred: boolean;
}

export interface EventModel {
  /** Frames in the order of the text. */
  frames: Frame[];
  relations: Relation[];
  title?: string;
  accTitle?: string;
}

export interface PlacedFrame {
  number: number;
  kind: FrameKind;
  column: number;
  lane: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedLane {
  zone: LaneZone;
  /** The namespace of the lane; absent for the default lane of the zone. */
  namespace?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedColumn {
  number: number;
  x: number;
  w: number;
}

/** The three bands the element kinds sit in. */
export type LaneZone = 'auto' | 'cmd' | 'evt';

export interface EventLayout {
  scene: Scene;
  lanes: PlacedLane[];
  columns: PlacedColumn[];
  frames: PlacedFrame[];
  /** Each drawn relation with its points. */
  edges: Array<{ from: number; to: number; points: Array<{ x: number; y: number }> }>;
}

export const ZONE_NAMES: Record<LaneZone, string> = {
  auto: 'UI/Automation',
  cmd: 'Command/Read Model',
  evt: 'Events',
};

export const ZONE_ORDER: LaneZone[] = ['auto', 'cmd', 'evt'];

export function zoneOf(kind: FrameKind): LaneZone {
  if (kind === 'ui' || kind === 'pcr') return 'auto';
  if (kind === 'cmd' || kind === 'rmo') return 'cmd';
  return 'evt';
}
