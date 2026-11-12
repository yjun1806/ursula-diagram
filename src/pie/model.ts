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
  /** `config.pie.donutHole`: the hole's radius as a share of the circle's, from 0 to 0.9. */
  donutHole: number;
  slices: PieSlice[];
}
