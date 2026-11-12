import type { Diagnostic, Scene } from '../types.ts';

export type ArrowHead = 'filled' | 'open' | 'cross' | 'none';
export type BlockKind = 'loop' | 'opt' | 'alt' | 'par' | 'critical' | 'break';
/** How a message reads, derived from its arrow: `plain` is an arrow without a head. */
export type MessageKind = 'call' | 'reply' | 'async' | 'failed' | 'plain';
export type LegendKind = Exclude<MessageKind, 'plain'>;
/** `false` removes the legend; an object renames the captions of the kinds. */
export type SequenceLegendOption = false | Partial<Record<LegendKind, string>>;

/** How a participant is drawn: a box, or one of the symbols of the Mermaid `@{ "type": ... }` notation. */
export type ParticipantKind = 'participant' | 'actor' | 'boundary' | 'control' | 'entity' | 'database' | 'collections' | 'queue';

export const PARTICIPANT_KINDS: readonly ParticipantKind[] = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'];

export interface Participant {
  id: string;
  /** Label lines (`<br/>` splits lines). */
  lines: string[];
  kind: ParticipantKind;
}

export function kindOf(m: { head: ArrowHead; dashed: boolean }): MessageKind {
  if (m.head === 'filled') return m.dashed ? 'reply' : 'call';
  if (m.head === 'open') return 'async';
  if (m.head === 'cross') return 'failed';
  return 'plain';
}

export interface MessageStmt {
  kind: 'message';
  from: string;
  to: string;
  lines: string[];
  dashed: boolean;
  head: ArrowHead;
  /** `+` suffix: activates the receiver. */
  activate: boolean;
  /** `-` suffix: deactivates the sender. */
  deactivate: boolean;
  /** Sequence number when `autonumber` is on. */
  number?: number;
  /** `<<->>`: a head at both ends. */
  both?: boolean;
  /** `()` beside the sender or the receiver: the line joins that lifeline at a dot. */
  centreFrom?: boolean;
  centreTo?: boolean;
  /** The receiver appears with this message (`create` before it). */
  creates?: boolean;
  /** The lifeline of the sender or the receiver ends with this message (`destroy` before it). */
  destroysFrom?: boolean;
  destroysTo?: boolean;
  line: number;
}

export interface NoteStmt {
  kind: 'note';
  side: 'left' | 'right' | 'over';
  /** One participant, or two for `over A,B`. */
  anchors: string[];
  lines: string[];
  line: number;
}

export interface ActivationStmt {
  kind: 'activate' | 'deactivate';
  who: string;
  line: number;
}

export interface OpenStmt {
  kind: 'open';
  block: BlockKind;
  lines: string[];
  line: number;
}

/** `else` of an `alt`, `option` of a `critical` or `and` of a `par`. */
export interface BranchStmt {
  kind: 'branch';
  lines: string[];
  line: number;
}

export interface CloseStmt {
  kind: 'close';
  line: number;
}

/** `rect` and its `end`: a highlighted stretch of rows. The colour of the source is not kept. */
export interface ZoneStmt {
  kind: 'zoneOpen' | 'zoneClose';
  line: number;
}

export type Statement = MessageStmt | NoteStmt | ActivationStmt | OpenStmt | BranchStmt | CloseStmt | ZoneStmt;

/** `box` ... `end`: participants drawn inside one labelled band. The colour of the source is not kept. */
export interface ParticipantGroup {
  label: string;
  members: string[];
}

export interface Sequence {
  participants: Participant[];
  statements: Statement[];
  groups?: ParticipantGroup[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedParticipant {
  id: string;
  /** Lifeline x. */
  x: number;
  box: Box;
}

export interface PlacedMessage {
  /** Index among the messages of the diagram, in source order. */
  index: number;
  from: string;
  to: string;
  /** Lifeline x of the sender and the receiver. */
  fromX: number;
  toX: number;
  kind: MessageKind;
  /** Vertical position of the message line. */
  y: number;
  self: boolean;
  /** Box around all label lines; absent when the message has no text. */
  label?: Box;
}

export interface PlacedNote {
  statement: number;
  box: Box;
}

export interface PlacedFrame extends Box {
  block: BlockKind;
  /** Statement index of the opening line. */
  statement: number;
  /** Index among the frames of the diagram, in source order. */
  index: number;
  /** Vertical positions of the `else` / `and` dividers. */
  dividers: number[];
}

export interface PlacedRow {
  /** Index into `Sequence.statements`. */
  statement: number;
  /** Top of what the statement draws (the label of a message) down to where the next statement's space starts. */
  y: number;
  h: number;
}

export interface SequenceLayout {
  width: number;
  height: number;
  /** Distance between two neighbouring lifelines. */
  pitch: number;
  /** Width shared by all header boxes. */
  headerWidth: number;
  /** Legend entries in drawing order; empty when no legend is drawn. */
  legend: Array<{ kind: LegendKind; caption: string }>;
  participants: PlacedParticipant[];
  rows: PlacedRow[];
  messages: PlacedMessage[];
  notes: PlacedNote[];
  frames: PlacedFrame[];
  diagnostics: Diagnostic[];
  scene: Scene;
}
