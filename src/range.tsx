// Page-wide time range for every time-series chart, set by one control above the charts.
import { createContext, useContext, useEffect, useState } from "react";

export type Range = "5y" | "10y" | "30y" | "max";

const OPTIONS: { value: Range; label: string; short: string }[] = [
  { value: "5y", label: "Last 5 years", short: "5 yrs" },
  { value: "10y", label: "Last 10 years", short: "10 yrs" },
  { value: "30y", label: "Last 30 years", short: "30 yrs" },
  { value: "max", label: "All available history", short: "All" },
];

const YEARS: Record<Range, number | null> = { "5y": 5, "10y": 10, "30y": 30, max: null };
const KEY = "pak-economy:range";

/** ISO date the charts start from. */
export function rangeStart(r: Range, today = new Date()): string {
  const y = YEARS[r];
  if (y === null) return "1900-01-01";
  const d = new Date(today);
  d.setFullYear(d.getFullYear() - y);
  return d.toISOString().slice(0, 10);
}

function stored(): Range {
  try {
    const v = localStorage.getItem(KEY);
    return OPTIONS.some((o) => o.value === v) ? (v as Range) : "10y";
  } catch {
    return "10y";
  }
}

export function useRangeState() {
  const [range, setRange] = useState<Range>(stored);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, range);
    } catch {
      /* storage unavailable: choice lasts for this visit only */
    }
  }, [range]);
  return { range, setRange, start: rangeStart(range) };
}

export interface RangeCtx {
  range: Range;
  start: string;
}

export const RangeContext = createContext<RangeCtx>({ range: "10y", start: rangeStart("10y") });
export const useRange = () => useContext(RangeContext);

export function RangeBar({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="range-bar" role="group" aria-label="Time range for all charts">
      <span className="range-label">Charts show</span>
      <div className="segmented">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" aria-pressed={range === o.value} title={o.label}
            onClick={() => onChange(o.value)}>
            {o.short}
          </button>
        ))}
      </div>
    </div>
  );
}
