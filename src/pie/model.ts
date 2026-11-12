export interface PieSlice {
  label: string;
  /** Numeric value; always greater than zero. */
  value: number;
  /** The value as written in the source, kept for display. */
  valueText: string;
}

export interface Pie {
  title?: string;
  showData: boolean;
  slices: PieSlice[];
}
