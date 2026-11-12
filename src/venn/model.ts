/** A `text` node placed inside a set or a union. */
export interface VennText {
  id: string;
  label: string;
  line: number;
}

export interface VennSet {
  id: string;
  label: string;
  size?: number;
  sizeText?: string;
  texts: VennText[];
  line: number;
}

export interface VennUnion {
  /** Ids of the sets, in the order written. */
  ids: string[];
  label?: string;
  size?: number;
  sizeText?: string;
  texts: VennText[];
  line: number;
}

export interface Venn {
  title?: string;
  accTitle?: string;
  sets: VennSet[];
  unions: VennUnion[];
  /** Parts of the text that are read but not drawn (colour instructions of `style` statements). */
  ignored: string[];
}
