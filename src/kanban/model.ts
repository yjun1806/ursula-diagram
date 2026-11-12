import type { Scene } from '../types.ts';

export interface KanbanCard {
  id: string;
  title: string;
  ticket?: string;
  assigned?: string;
  priority?: string;
  line: number;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
  line: number;
}

export interface Kanban {
  columns: KanbanColumn[];
  /** Address template of the `kanban.ticketBaseUrl` setting; `#TICKET#` stands for the ticket value. */
  ticketBaseUrl?: string;
}

export interface PlacedTag {
  key: 'ticket' | 'assigned' | 'priority';
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  href?: string;
}

export interface PlacedCard {
  column: number;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: Array<{ text: string; x: number; y: number }>;
  tags: PlacedTag[];
}

export interface PlacedColumn {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KanbanLayout {
  scene: Scene;
  columns: PlacedColumn[];
  cards: PlacedCard[];
}
