/** Turns a number into text following a d3-style format specifier such as `,`, `$0,0`, `.1f` or `$.1%`. */
export type ValueFormatter = (value: number) => string;

const SPEC = /^(\$)?0*(,)?0*(?:\.(\d+))?(~)?([a-z%])?$/u;

function grouped(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/** Falls back to the default specifier `,` when `spec` is not one this reader knows. */
export function makeFormatter(spec: string): ValueFormatter {
  const m = SPEC.exec(spec.trim());
  if (m === null) return makeFormatter(',');
  const dollar = m[1] !== undefined;
  const comma = m[2] !== undefined;
  const precision = m[3] === undefined ? undefined : Number(m[3]);
  const type = m[5];
  return (value) => {
    const percent = type === '%';
    const fixed = type === 'f' || percent;
    const scaled = percent ? value * 100 : value;
    let body: string;
    if (fixed) body = scaled.toFixed(precision ?? 6);
    else if (type === 'd') body = Math.round(scaled).toString();
    else if (precision !== undefined) body = Number(scaled.toPrecision(Math.max(1, precision))).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
    else body = scaled.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 12 });
    const negative = body.startsWith('-');
    const abs = negative ? body.slice(1) : body;
    const [int = '', frac] = abs.split('.');
    const digits = comma ? grouped(int) : int;
    const num = frac === undefined ? digits : `${digits}.${frac}`;
    // A currency sign has no place before a percentage.
    return `${negative ? '-' : ''}${dollar && !percent ? '$' : ''}${num}${percent ? '%' : ''}`;
  };
}
