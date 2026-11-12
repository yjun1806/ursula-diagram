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
}
