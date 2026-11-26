import type { TickUnit } from './model.ts';
import { civilFromDays, DAY, floorDiv, formatTime, fromDate, toCivil, unitLength } from './time.ts';

export interface Tick {
  t: number;
  /** The text under the tick; empty when it would collide with its neighbour. */
  label: string;
  /** Month and year over the first tick of a month; two-row axes only. */
  month?: string;
}

export interface TickPlan {
  unit: TickUnit;
  step: number;
  /** The axis has a month row over a row of day numbers. */
  twoRow: boolean;
  ticks: Tick[];
}

export interface TickInput {
  t0: number;
  t1: number;
  /** Position of a time along the axis, in the unit of the medium (pixels or cells). */
  posOf(t: number): number;
  /** Width of a label in the same unit. */
  width(text: string): number;
  /** Clear space kept between two labels. */
  gap: number;
  axisFormat?: string | undefined;
  tickInterval?: { step: number; unit: TickUnit } | undefined;
  /** Day of the week (0 is Sunday) week ticks fall on; absent means Monday for chosen steps and Sunday for a written interval. */
  weekday?: number | undefined;
  /** Every time on the axis is a midnight, so steps shorter than a day are not tried. */
  wholeDays?: boolean | undefined;
}

const LADDER: Array<[TickUnit, number[]]> = [
  ['ms', [1, 2, 5, 10, 20, 50, 100, 200, 500]],
  ['s', [1, 2, 5, 10, 15, 30]],
  ['min', [1, 2, 5, 10, 15, 30]],
  ['h', [1, 2, 3, 6, 12]],
  ['d', [1, 2]],
  ['w', [1, 2]],
  ['M', [1, 2, 3, 6]],
  ['y', [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 100_000, 1_000_000]],
];

const MAX_TICKS = 2000;

/** How many of each unit shorter than a day make the next one up. */
const PER_NEXT = { ms: 1000, s: 60, min: 60, h: 24 } as const;

const DEFAULT_FORMAT: Record<TickUnit, string> = {
  ms: '%H:%M:%S.%L',
  s: '%H:%M:%S',
  min: '%H:%M',
  h: '%H:%M',
  d: '%Y-%m-%d',
  w: '%Y-%m-%d',
  M: '%Y-%m',
  y: '%Y',
};

function fixedLength(unit: TickUnit): number | undefined {
  return unit === 'M' || unit === 'y' ? undefined : unitLength(unit);
}

/** Times in [t0, t1] on the boundaries of `step` units, or undefined when there would be too many to draw. */
export function aligned(t0: number, t1: number, unit: TickUnit, step: number, weekday: number): number[] | undefined {
  const out: number[] = [];
  const length = fixedLength(unit);
  const approx = length ?? (unit === 'M' ? 30.4375 * DAY : 365.2425 * DAY);
  if ((t1 - t0) / (approx * step) > MAX_TICKS) return undefined;
  if (unit === 'ms' || unit === 's' || unit === 'min' || unit === 'h') {
    const u = unitLength(unit);
    // A step that divides the next unit up (500 ms of a second, 15 min of an hour) falls on the multiples of
    // `step` units since the epoch, so only those are visited. Any other step walks every unit and tests its field.
    if (PER_NEXT[unit] % step === 0) {
      const span = u * step;
      const first = Math.ceil(t0 / u) * u;
      const ahead = ((-first % span) + span) % span;
      for (let t = ahead === 0 ? first : first + ahead; t <= t1; t += span) out.push(t);
      return out.length > MAX_TICKS ? undefined : out;
    }
    for (let t = Math.ceil(t0 / u) * u; t <= t1; t += u) {
      const c = toCivil(t);
      const field = unit === 'ms' ? c.ms : unit === 's' ? c.ss : unit === 'min' ? c.mm : c.hh;
      if (field % step === 0) out.push(t);
    }
  } else if (unit === 'd') {
    for (let day = Math.ceil(t0 / DAY); day * DAY <= t1; day++) if ((civilFromDays(day).d - 1) % step === 0) out.push(day * DAY);
  } else if (unit === 'w') {
    let day = Math.ceil(t0 / DAY);
    while (toCivil(day * DAY).dow !== weekday) day += 1;
    for (let k = 0; day * DAY <= t1; day += 7, k++) if (k % step === 0) out.push(day * DAY);
  } else if (unit === 'M') {
    const c = toCivil(t0);
    for (let index = c.y * 12 + (c.m - 1); ; index++) {
      const y = floorDiv(index, 12);
      const m = (((index % 12) + 12) % 12) + 1;
      const t = fromDate(y, m, 1);
      if (t > t1) break;
      if (t >= t0 && (m - 1) % step === 0) out.push(t);
    }
  } else {
    for (let y = toCivil(t0).y; ; y++) {
      const t = fromDate(y, 1, 1);
      if (t > t1) break;
      if (t >= t0 && y % step === 0) out.push(t);
    }
  }
  return out.length > MAX_TICKS ? undefined : out;
}

/** The ticks of a date axis: the written `tickInterval`, or the smallest step whose labels do not touch. */
export function planTicks(input: TickInput): TickPlan {
  const { t0, t1, posOf, width, gap } = input;
  const label = (unit: TickUnit, twoRow: boolean) => (t: number): string => (twoRow ? String(toCivil(t).d) : formatTime(input.axisFormat ?? DEFAULT_FORMAT[unit], t));

  const build = (unit: TickUnit, step: number, strict: boolean): TickPlan | undefined => {
    const twoRow = input.axisFormat === undefined && (unit === 'd' || unit === 'w');
    const text = label(unit, twoRow);
    const weekday = input.weekday ?? (input.tickInterval === undefined ? 1 : 0);
    const times = aligned(t0, t1, unit, step, weekday);
    if (times === undefined) return undefined;
    const withStart = times[0] === t0 ? times : [t0, ...times];
    // The start of the axis keeps its tick unless the next one stands too close to hold both labels.
    const all =
      withStart.length > 1 && withStart[0] === t0 && times[0] !== t0 && posOf(withStart[1] ?? t0) - posOf(t0) < width(text(t0)) + gap
        ? times
        : withStart;
    if (all.length === 0) return undefined;
    if (strict) {
      if (all.length < 2 && !(unit === 'y' && step >= 1000)) return undefined;
      for (let i = 1; i < all.length; i++) {
        const a = all[i - 1] ?? 0;
        const b = all[i] ?? 0;
        if (posOf(b) - posOf(a) < Math.max(width(text(a)), width(text(b))) + gap) return undefined;
      }
    }
    // Labels that would touch the one before are left off; the tick line stays.
    const ticks: Tick[] = [];
    let right = Number.NEGATIVE_INFINITY;
    let monthRight = Number.NEGATIVE_INFINITY;
    let lastMonth = Number.NaN;
    for (const t of all) {
      const x = posOf(t);
      const s = text(t);
      const w = width(s);
      const fits = x >= right + gap;
      if (fits) right = x + w;
      const tick: Tick = { t, label: fits ? s : '' };
      if (twoRow) {
        const c = toCivil(t);
        const key = c.y * 12 + c.m;
        if (key !== lastMonth) {
          lastMonth = key;
          const month = formatTime('%B %Y', t);
          if (x >= monthRight + gap) {
            monthRight = x + width(month);
            tick.month = month;
          }
        }
      }
      ticks.push(tick);
    }
    return { unit, step, twoRow, ticks };
  };

  if (input.tickInterval !== undefined) {
    const plan = build(input.tickInterval.unit, input.tickInterval.step, false);
    if (plan !== undefined) return plan;
  }
  for (const [unit, steps] of LADDER) {
    if (input.wholeDays === true && ['ms', 's', 'min', 'h'].includes(unit)) continue;
    for (const step of steps) {
      const plan = build(unit, step, true);
      if (plan !== undefined) return plan;
    }
  }
  const last = build('y', 1_000_000, false);
  return last ?? { unit: 'y', step: 1, twoRow: false, ticks: [{ t: t0, label: formatTime('%Y', t0) }] };
}
