import type { Excludes } from './time.ts';

/** Unit of a tick step on the date axis. */
export type TickUnit = 'ms' | 's' | 'min' | 'h' | 'd' | 'w' | 'M' | 'y';

export interface GanttTask {
  id: string;
  label: string;
  /** Index into `Gantt.sections`. */
  section: number;
  /** Source line, 1-based. */
  line: number;
  /** Times in milliseconds on the civil timeline (see `time.ts`). `end` already holds the days stretched over excluded days. */
  start: number;
  end: number;
  active: boolean;
  done: boolean;
  crit: boolean;
  milestone: boolean;
  /** A vertical marker: it takes no row. */
  vert: boolean;
  /** The length as written (`10d`), or measured from the two dates when the end was a date. */
  durationText: string;
  /** Indexes into `Gantt.tasks` of the tasks it follows with `after`. */
  after: number[];
}

export interface Gantt {
  title?: string;
  accTitle?: string;
  /** Section names in order; a task written before any `section` line belongs to a section with an empty name. */
  sections: string[];
  tasks: GanttTask[];
  excludes: Excludes;
  dateFormat: string;
  axisFormat?: string;
  tickInterval?: { step: number; unit: TickUnit };
  /** Day of the week (0 is Sunday) on which week ticks start. */
  weekday?: number;
  /** `displayMode: compact`: tasks of a section that do not overlap share a row. */
  compact?: true;
}
