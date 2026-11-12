/** One data point: the number, the text it was written with and an optional text label. */
export interface XyPoint {
  value: number;
  raw: string;
  label?: string;
}

export interface XySeries {
  kind: 'bar' | 'line';
  name?: string;
  points: XyPoint[];
  /** Line of the source the series starts on. */
  line: number;
}

export interface XyRange {
  min: number;
  max: number;
}

/** Options read from the `config:` block of a front matter that the drawing follows. */
export interface XyConfig {
  width?: number;
  height?: number;
  showDataLabel?: boolean;
  showDataLabelOutsideBar?: boolean;
  showTitle?: boolean;
  showLegend?: boolean;
}

export interface XyChart {
  horizontal: boolean;
  title?: string;
  xTitle?: string;
  /** Names along the category axis; absent when the source has no x-axis or gives it a range. */
  categories?: string[];
  xRange?: XyRange;
  yTitle?: string;
  yRange?: XyRange;
  series: XySeries[];
  config: XyConfig;
}
