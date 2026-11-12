/** One task of a journey: a name, a satisfaction score from 1 to 5 and the actors that take part. */
export interface JourneyTask {
  name: string;
  score: number;
  /** The score as written, so a label shows the input unchanged. */
  scoreText: string;
  actors: string[];
  line: number;
}

/** A stretch of the journey; the tasks before the first `section` line belong to a section without a name. */
export interface JourneySection {
  name?: string;
  tasks: JourneyTask[];
}

export interface Journey {
  title?: string;
  /** Accessible title and description (`accTitle`, `accDescr`). */
  accTitle?: string;
  accDescr?: string;
  sections: JourneySection[];
}
