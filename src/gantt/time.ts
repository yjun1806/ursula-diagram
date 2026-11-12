/**
 * Calendar arithmetic without time zones. A time is a count of milliseconds on a civil timeline whose day 0 is
 * 1970-01-01; no `Date` conversion is involved, so the result never depends on the machine.
 */

export const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

export type DurationUnit = 'ms' | 's' | 'min' | 'h' | 'd' | 'w' | 'M' | 'y';

export interface Duration {
  value: number;
  unit: DurationUnit;
}

export const floorDiv = (a: number, b: number): number => Math.floor(a / b);

export const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/** Days since 1970-01-01 of a civil date (month 1..12). */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

export function civilFromDays(days: number): { y: number; m: number; d: number } {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** 0 is Sunday. */
export const dayOfWeek = (days: number): number => (((days + 4) % 7) + 7) % 7;

export interface Civil {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
  ms: number;
  /** Days since 1970-01-01. */
  day: number;
  /** 0 is Sunday. */
  dow: number;
  /** 0-based day of the year. */
  doy: number;
}

export function toCivil(t: number): Civil {
  const day = floorDiv(t, DAY);
  const rest = t - day * DAY;
  const { y, m, d } = civilFromDays(day);
  return {
    y,
    m,
    d,
    hh: Math.floor(rest / HOUR),
    mm: Math.floor((rest % HOUR) / MINUTE),
    ss: Math.floor((rest % MINUTE) / 1000),
    ms: rest % 1000,
    day,
    dow: dayOfWeek(day),
    doy: day - daysFromCivil(y, 1, 1),
  };
}

export const fromDate = (y: number, m: number, d: number): number => daysFromCivil(y, m, d) * DAY;

/** The same time-of-day, `n` calendar months later; the day of month is cut to the length of the target month. */
export function addMonths(t: number, n: number): number {
  const c = toCivil(t);
  const index = c.y * 12 + (c.m - 1) + n;
  const y = floorDiv(index, 12);
  const m = (((index % 12) + 12) % 12) + 1;
  return fromDate(y, m, Math.min(c.d, daysInMonth(y, m))) + (t - c.day * DAY);
}

const FIXED_UNIT: Record<'ms' | 's' | 'min' | 'h' | 'd' | 'w', number> = { ms: 1, s: 1000, min: MINUTE, h: HOUR, d: DAY, w: 7 * DAY };

export const unitLength = (unit: 'ms' | 's' | 'min' | 'h' | 'd' | 'w'): number => FIXED_UNIT[unit];

const DURATION = /^(\d+(?:\.\d+)?)(ms|[Mdhmswy])$/;
const SUFFIX: Record<string, DurationUnit> = { ms: 'ms', s: 's', m: 'min', h: 'h', d: 'd', w: 'w', M: 'M', y: 'y' };

/** `30d`, `1.5d`, `24h`, `2w`, `1M`, `500ms`; undefined when the text is not a duration. */
export function parseDuration(text: string): Duration | undefined {
  const m = DURATION.exec(text.trim());
  if (m === null) return undefined;
  const unit = SUFFIX[m[2] ?? ''];
  return unit === undefined ? undefined : { value: Number(m[1]), unit };
}

export function addDuration(t: number, { value, unit }: Duration): number {
  if (unit === 'M' || unit === 'y') {
    const months = unit === 'y' ? value * 12 : value;
    const whole = Math.trunc(months);
    return addMonths(t, whole) + Math.round((months - whole) * 30 * DAY);
  }
  return t + Math.round(value * FIXED_UNIT[unit]);
}

/** The length of `end - start` in the largest unit that holds it exactly: `30y`, `10d`, `36h` stays `36h`, `71s`. */
export function lengthLabel(start: number, end: number): string {
  const span = end - start;
  if (span === 0) return '0d';
  const a = toCivil(start);
  if (span > 0 && a.m === 1 && a.d === 1 && start === a.day * DAY) {
    const b = toCivil(end);
    if (end === b.day * DAY && b.m === 1 && b.d === 1 && b.y > a.y) return `${b.y - a.y}y`;
  }
  const steps: Array<[number, string]> = [
    [DAY, 'd'],
    [HOUR, 'h'],
    [MINUTE, 'm'],
    [1000, 's'],
    [1, 'ms'],
  ];
  for (const [size, suffix] of steps) if (span % size === 0) return `${span / size}${suffix}`;
  return `${span}ms`;
}

// ---------------------------------------------------------------------------------------------------------------
// Input date format

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const weekdayIndex = (name: string): number => WEEKDAYS.findIndex((w) => w.toLowerCase() === name.toLowerCase());

const FORMAT_TOKEN = /\[([^\]]*)\]|YYYY|YY|Q|MMMM|MMM|MM|M|Do|DDDD|DDD|DD|D|X|x|HH|H|hh|h|A|a|mm|m|ss|s|SSS|SS|S|ZZ|Z/g;

const TOKEN_PATTERN: Record<string, string> = {
  YYYY: '(\\d{4})',
  YY: '(\\d{2})',
  Q: '([1-4])',
  MMMM: '([A-Za-z]+)',
  MMM: '([A-Za-z]{3})',
  MM: '(\\d{2})',
  M: '(\\d{1,2})',
  Do: '(\\d{1,2})(?:st|nd|rd|th)',
  DDDD: '(\\d{3})',
  DDD: '(\\d{1,3})',
  DD: '(\\d{2})',
  D: '(\\d{1,2})',
  X: '([+-]?\\d+(?:\\.\\d+)?)',
  x: '([+-]?\\d+)',
  HH: '(\\d{2})',
  H: '(\\d{1,2})',
  hh: '(\\d{2})',
  h: '(\\d{1,2})',
  A: '([AaPp][Mm])',
  a: '([AaPp][Mm])',
  mm: '(\\d{2})',
  m: '(\\d{1,2})',
  ss: '(\\d{2})',
  s: '(\\d{1,2})',
  SSS: '(\\d{3})',
  SS: '(\\d{2})',
  S: '(\\d)',
  ZZ: '([+-]\\d{2}:?\\d{2}|Z)',
  Z: '([+-]\\d{2}:?\\d{2}|Z)',
};

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface DateFormat {
  source: string;
  /** The time the text names, or undefined when the text does not fit the format exactly. */
  parse(text: string): number | undefined;
}

function monthFromName(name: string, full: boolean): number | undefined {
  const i = MONTHS.findIndex((m) => (full ? m : m.slice(0, 3)).toLowerCase() === name.toLowerCase());
  return i < 0 ? undefined : i + 1;
}

/** Reads `dateFormat` tokens (`YYYY`, `MM`, `DD`, `HH`, `mm`, `X`, ...); anything else in the format stands for itself. */
export function compileDateFormat(source: string): DateFormat {
  const names: string[] = [];
  let pattern = '';
  let last = 0;
  for (const match of source.matchAll(FORMAT_TOKEN)) {
    const at = match.index;
    pattern += escapeRegExp(source.slice(last, at));
    last = at + match[0].length;
    if (match[1] !== undefined) {
      pattern += escapeRegExp(match[1]);
      continue;
    }
    names.push(match[0]);
    pattern += TOKEN_PATTERN[match[0]] ?? '';
  }
  pattern += escapeRegExp(source.slice(last));
  const regex = new RegExp(`^${pattern}$`);
  return {
    source,
    parse(text) {
      const m = regex.exec(text.trim());
      if (m === null) return undefined;
      const v: Record<string, string> = {};
      names.forEach((name, i) => {
        v[name] = m[i + 1] ?? '';
      });
      const num = (...keys: string[]): number | undefined => {
        for (const k of keys) {
          const raw = v[k];
          if (raw !== undefined) return Number(raw);
        }
        return undefined;
      };
      if (v['X'] !== undefined) return Math.round(Number(v['X']) * 1000);
      if (v['x'] !== undefined) return Number(v['x']);
      let year = num('YYYY');
      if (year === undefined && v['YY'] !== undefined) year = Number(v['YY']) + (Number(v['YY']) > 68 ? 1900 : 2000);
      let month = num('MM', 'M');
      if (month === undefined && v['MMMM'] !== undefined) month = monthFromName(v['MMMM'], true);
      if (month === undefined && v['MMM'] !== undefined) month = monthFromName(v['MMM'], false);
      if (month === undefined && v['Q'] !== undefined) month = (Number(v['Q']) - 1) * 3 + 1;
      if ((v['MMMM'] !== undefined || v['MMM'] !== undefined) && month === undefined) return undefined;
      let day = num('DD', 'D', 'Do');
      const dayOfYear = num('DDDD', 'DDD');
      let hour = num('HH', 'H');
      const hour12 = num('hh', 'h');
      if (hour === undefined && hour12 !== undefined) {
        const pm = /^p/i.test(v['A'] ?? v['a'] ?? '');
        hour = (hour12 % 12) + (pm ? 12 : 0);
      }
      const minute = num('mm', 'm') ?? 0;
      const second = num('ss', 's') ?? 0;
      const fraction = v['SSS'] ?? v['SS'] ?? v['S'];
      const milli = fraction === undefined ? 0 : Math.round(Number(fraction) * 10 ** (3 - fraction.length));
      if ((hour ?? 0) > 23 || minute > 59 || second > 59) return undefined;
      const y = year ?? 1970;
      let days: number;
      if (dayOfYear !== undefined) {
        if (dayOfYear < 1 || dayOfYear > (isLeap(y) ? 366 : 365)) return undefined;
        days = daysFromCivil(y, 1, 1) + dayOfYear - 1;
      } else {
        const mo = month ?? 1;
        day ??= 1;
        if (mo < 1 || mo > 12 || day < 1 || day > daysInMonth(y, mo)) return undefined;
        days = daysFromCivil(y, mo, day);
      }
      let t = days * DAY + (hour ?? 0) * HOUR + minute * MINUTE + second * 1000 + milli;
      const zone = v['ZZ'] ?? v['Z'];
      if (zone !== undefined && zone !== 'Z') {
        const sign = zone.startsWith('-') ? -1 : 1;
        const digits = zone.slice(1).replace(':', '');
        t -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * MINUTE;
      }
      return t;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Output format (`axisFormat`, the strftime conversions of d3-time-format)

const pad = (n: number, width: number, fill = '0'): string => String(Math.abs(n)).padStart(width, fill);

/** Writes `t` with `%`-conversions such as `%Y-%m-%d`, `%H:%M`, `%b %e`, `%s`; an unknown conversion is kept as written. */
export function formatTime(format: string, t: number): string {
  const c = toCivil(t);
  const hour12 = c.hh % 12 === 0 ? 12 : c.hh % 12;
  const week = (firstDay: number): number => Math.floor((c.doy + 7 - ((c.dow - firstDay + 7) % 7)) / 7);
  return format.replace(/%([-_0]?)([a-zA-Z%])/g, (whole, flag: string, conv: string) => {
    const number = (value: number, width: number, fill = '0'): string => {
      if (flag === '-') return String(value);
      return pad(value, width, flag === '_' ? ' ' : flag === '0' ? '0' : fill);
    };
    switch (conv) {
      case 'a':
        return (WEEKDAYS[c.dow] ?? '').slice(0, 3);
      case 'A':
        return WEEKDAYS[c.dow] ?? '';
      case 'b':
      case 'h':
        return (MONTHS[c.m - 1] ?? '').slice(0, 3);
      case 'B':
        return MONTHS[c.m - 1] ?? '';
      case 'c':
        return formatTime('%a %b %e %H:%M:%S %Y', t);
      case 'd':
        return number(c.d, 2);
      case 'e':
        return number(c.d, 2, ' ');
      case 'H':
        return number(c.hh, 2);
      case 'I':
        return number(hour12, 2);
      case 'j':
        return number(c.doy + 1, 3);
      case 'm':
        return number(c.m, 2);
      case 'M':
        return number(c.mm, 2);
      case 'L':
        return number(c.ms, 3);
      case 'p':
        return c.hh < 12 ? 'AM' : 'PM';
      case 'S':
        return number(c.ss, 2);
      case 's':
        return String(floorDiv(t, 1000));
      case 'Q':
        return String(t);
      case 'U':
        return number(week(0), 2);
      case 'w':
        return String(c.dow);
      case 'W':
        return number(week(1), 2);
      case 'x':
        return formatTime('%m/%d/%Y', t);
      case 'X':
        return formatTime('%H:%M:%S', t);
      case 'y':
        return number(((c.y % 100) + 100) % 100, 2);
      case 'Y':
        return String(c.y);
      case 'Z':
        return '+0000';
      case '%':
        return '%';
      default:
        return whole;
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Excluded days

export interface Excludes {
  /** Days of the week (0 is Sunday) that count as excluded. */
  weekdays: number[];
  /** Single excluded days, as days since 1970-01-01. */
  days: number[];
}

export const isExcludedDay = (ex: Excludes, day: number): boolean => ex.weekdays.includes(dayOfWeek(day)) || ex.days.includes(day);

/**
 * Stretches a task over excluded days: every excluded day inside the task, counted as the task grows, adds one day at
 * its end, so the working time stays as long as written. Excluded days at the very end are left out of the bar.
 */
export function stretchOverExcluded(start: number, end: number, ex: Excludes): number {
  if (ex.weekdays.length === 0 && ex.days.length === 0) return end;
  let cursor = start;
  let stop = end;
  let rendered = end;
  let invalid = false;
  for (let guard = 0; cursor <= stop; guard++) {
    if (guard > 100_000) return end;
    if (!invalid) rendered = stop;
    invalid = isExcludedDay(ex, floorDiv(cursor, DAY));
    if (invalid) stop += DAY;
    cursor += DAY;
  }
  return rendered;
}

/** The first moment at or after `t` that is not on an excluded day (the start of the next working day). */
export function skipExcluded(t: number, ex: Excludes): number {
  if (ex.weekdays.length === 0 && ex.days.length === 0) return t;
  let day = floorDiv(t, DAY);
  if (!isExcludedDay(ex, day)) return t;
  for (let guard = 0; guard < 100_000; guard++) {
    day += 1;
    if (!isExcludedDay(ex, day)) return day * DAY;
  }
  return t;
}
