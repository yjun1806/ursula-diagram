export interface RadarAxis {
  id: string;
  label: string;
}

export interface RadarCurve {
  id: string;
  label: string;
  /** One value per axis, in axis order. */
  values: number[];
}

export type Graticule = 'circle' | 'polygon';

export interface Radar {
  title?: string;
  axes: RadarAxis[];
  curves: RadarCurve[];
  max?: number;
  min?: number;
  /** Number of rings; absent when the source does not say. */
  ticks?: number;
  graticule: Graticule;
  showLegend: boolean;
  /** One-based series colour of each curve, by curve order, when the theme variables ask for one (`cScale<i>`). */
  colors?: Array<number | undefined>;
  /** False when the theme variables set the curve opacity to 0: the curves are drawn as outlines only. */
  filled: boolean;
}
