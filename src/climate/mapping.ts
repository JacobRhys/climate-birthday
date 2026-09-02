// Climate-birthday mapping.
//
// Given a smoothed pre-industrial climatology B[d] and a current climatology
// C[d] (365 values each, °C), the "climate birthday" of day d0 is the day d*
// in the current climate whose temperature equals what d0 used to have:
//
//     C[d*] = B[d0]
//
// The current curve is inverted by scanning its 365 segments for crossings of
// the target temperature. Two constraints pick the right crossing:
//   1. Same phase: a spring day (temperature rising) must map to a spring day,
//      not the autumn day that happens to share its temperature.
//   2. Nearest: among same-phase crossings, take the smallest circular
//      day distance from d0.
// If no crossing exists the target lies outside the current curve's range:
// that weather no longer occurs in this city ("extinct"). The reverse case,
// the current temperature on d0 exceeds anything in the baseline, is
// flagged separately ("novel").

export type Climatology = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  baseline: number[];
  current: number[];
};

export type Mapping = {
  /** Input day-of-year, 0-based, 29 Feb folded onto 28 Feb. */
  doy: number;
  /** Baseline temperature on the input day. */
  target: number;
  /** Fractional day-of-year in the current climate with the same temperature, or null. */
  mapped: number | null;
  /** Signed shift in days (negative = earlier in the year). */
  shiftDays: number | null;
  /** Warming on the input day itself: C[doy] - B[doy]. */
  warming: number;
  /** Baseline temperature colder (or hotter) than anything in the current year. */
  extinct: 'cold' | 'hot' | null;
  /** Current temperature on the input day outside the baseline range. */
  novel: 'cold' | 'hot' | null;
  /** True when no same-phase crossing existed and any-phase fallback was used. */
  phaseFallback: boolean;
};

const N = 365;
const wrap = (i: number) => ((i % N) + N) % N;

/** Signed circular distance from a to b in days, in (-182.5, 182.5]. */
export function circularDelta(a: number, b: number): number {
  let d = b - a;
  while (d > N / 2) d -= N;
  while (d <= -N / 2) d += N;
  return d;
}

function slopeSign(series: number[], i: number): number {
  return Math.sign(series[wrap(i + 1)] - series[wrap(i - 1)]);
}

type Crossing = { day: number; sign: number };

/** Every fractional day where the series crosses `value` (linear interpolation). */
function crossings(series: number[], value: number): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 0; i < N; i++) {
    const a = series[i];
    const b = series[wrap(i + 1)];
    if (a === value) {
      out.push({ day: i, sign: slopeSign(series, i) });
      continue;
    }
    if ((a < value && b > value) || (a > value && b < value)) {
      const t = (value - a) / (b - a);
      out.push({ day: i + t, sign: Math.sign(b - a) });
    }
  }
  return out;
}

export function climateBirthday(city: Climatology, doy: number): Mapping {
  const { baseline: B, current: C } = city;
  const d0 = wrap(Math.round(doy));
  const target = B[d0];
  const phase = slopeSign(B, d0);

  const minC = Math.min(...C);
  const maxC = Math.max(...C);
  const minB = Math.min(...B);
  const maxB = Math.max(...B);

  let extinct: Mapping['extinct'] = null;
  if (target < minC) extinct = 'cold';
  else if (target > maxC) extinct = 'hot';

  let novel: Mapping['novel'] = null;
  if (C[d0] > maxB) novel = 'hot';
  else if (C[d0] < minB) novel = 'cold';

  let mapped: number | null = null;
  let phaseFallback = false;
  if (!extinct) {
    const all = crossings(C, target);
    let pool = all.filter((c) => c.sign === phase || phase === 0);
    if (pool.length === 0) {
      pool = all;
      phaseFallback = true;
    }
    let best: Crossing | null = null;
    let bestDist = Infinity;
    for (const c of pool) {
      const dist = Math.abs(circularDelta(d0, c.day));
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    mapped = best ? wrap(best.day) : null;
  }

  return {
    doy: d0,
    target,
    mapped,
    shiftDays: mapped === null ? null : circularDelta(d0, mapped),
    warming: C[d0] - B[d0],
    extinct,
    novel,
    phaseFallback,
  };
}

/** Whole-year summary: how many baseline days have vanished, how many current days are new. */
export function yearSummary(city: Climatology) {
  const minC = Math.min(...city.current);
  const maxC = Math.max(...city.current);
  const minB = Math.min(...city.baseline);
  const maxB = Math.max(...city.baseline);
  let extinctDays = 0;
  let novelDays = 0;
  let sumWarming = 0;
  for (let d = 0; d < N; d++) {
    if (city.baseline[d] < minC || city.baseline[d] > maxC) extinctDays++;
    if (city.current[d] > maxB || city.current[d] < minB) novelDays++;
    sumWarming += city.current[d] - city.baseline[d];
  }
  return { extinctDays, novelDays, meanWarming: sumWarming / N };
}

// --- date helpers -----------------------------------------------------------

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(month: number) {
  return MONTH_DAYS[month];
}

/** month 0-11, day 1-31 → 0-based day-of-year on a 365-day calendar. */
export function toDoy(month: number, day: number): number {
  let d = 0;
  for (let m = 0; m < month; m++) d += MONTH_DAYS[m];
  return d + Math.min(day, MONTH_DAYS[month]) - 1;
}

/** Fractional 0-based day-of-year → { month, day } (rounded to nearest day). */
export function fromDoy(doy: number): { month: number; day: number } {
  let d = wrap(Math.round(doy));
  for (let m = 0; m < 12; m++) {
    if (d < MONTH_DAYS[m]) return { month: m, day: d + 1 };
    d -= MONTH_DAYS[m];
  }
  return { month: 11, day: 31 };
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** "14th of March"; callers add "the". */
export function formatDoy(doy: number): string {
  const { month, day } = fromDoy(doy);
  return `${ordinal(day)} of ${MONTHS[month]}`;
}
