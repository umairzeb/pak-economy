// Change on a year earlier, in the unit that suits the measure.
import type { Point, Series } from "./data";
import { signed } from "./format";

export type ChangeFn = (date: string) => string | undefined;

const DAY = 864e5;
/** A year-earlier value further than this from its target means the series has a gap there. */
const MAX_GAP = 100 * DAY;

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Index of the last date on or before `target`, or -1. Dates are sorted ISO strings. */
function lastOnOrBefore(dates: string[], target: string): number {
  let lo = 0;
  let hi = dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= target) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Rates change in percentage points; prices and counts in per cent. A series that
 * reaches zero or below has no meaningful per cent change, so it uses its own unit.
 */
export function yearChange(s: Series, points: Point[], yFormat: (v: number) => string): ChangeFn {
  const isRate = s.unit.startsWith("%") || s.unit === "pp";
  const reachesZero = points.some(([, v]) => v <= 0);
  // Rates published to 2 decimals move in steps like 0.25, so keep both. Otherwise points
  // use as many decimals as the chart shows for the value itself, and at least one.
  const rawDecimals = Math.max(0, ...points.map(([, v]) => String(v).split(".")[1]?.length ?? 0));
  const shown = points.length ? yFormat(points[points.length - 1][1]) : "";
  const dp = rawDecimals === 2 ? 2 : Math.max(/\.(\d+)/.exec(shown)?.[1].length ?? 0, 1);
  const dates = points.map(([d]) => d);
  const byDate = new Map(points);
  return (date) => {
    // A cash rate decision stays in force until the next one, so any date has a value.
    const inForce = s.freq === "event" ? lastOnOrBefore(dates, date) : -1;
    const now = inForce >= 0 ? points[inForce][1] : byDate.get(date);
    if (now === undefined) return undefined;
    const target = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
    const i = lastOnOrBefore(dates, target);
    if (i < 0) return undefined;
    if (s.freq !== "event" && Date.parse(date) - Date.parse(dates[i]) - 365 * DAY > MAX_GAP) return undefined;
    const ago = points[i][1];
    if (isRate) return signed(round(now - ago, dp), dp, " pts");
    if (reachesZero) {
      const d = now - ago;
      return `${d > 0 ? "+" : d < 0 ? "−" : ""}${yFormat(Math.abs(d))}`;
    }
    return signed(round((now / ago - 1) * 100, 1), 1, "%");
  };
}
