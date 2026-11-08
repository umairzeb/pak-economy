// Types and loaders for the JSON written by the Python pipeline (public/data).

export type Point = [string, number];

export interface Source {
  name: string;
  dataset: string;
  url: string;
}

export interface Series {
  id: string;
  title: string;
  unit: string;
  freq: string;
  section: string;
  points: Point[];
  source: Source;
  notes?: string;
  target_band?: [number, number];
  target_source?: string;
  provisional_latest?: boolean;
  step?: boolean;
  breaks?: { date: string; label: string }[];
  forecast_from?: string | null;
  updated: string;
}

export interface BundleItem {
  key: string;
  label: string;
  value: number;
  share?: number;
  weight?: number;
  unit?: string;
  prev?: number;
  last_week?: number;
  year_ago?: number;
  cities?: number;
  note?: string;
  change?: number | null;
  change_pct?: number | null;
  /** Per cent change over the latest quarter. */
  change_q?: number;
  as_of?: string;
  full_label?: string;
  entry_rate?: number;
  exit_rate?: number;
  /** Official sub-items, e.g. excise by product. */
  parts?: { label: string; value: number; share?: number }[];
  /** What a vague category covers, when the source names it but gives no amounts. */
  description?: string;
  /** The same, as a list. */
  contains?: string[];
}

export interface Bundle {
  id: string;
  title: string;
  unit: string;
  section: string;
  as_of: string;
  total?: number;
  period?: string;
  change_unit?: string;
  kind?: string;
  extra?: Record<string, number>;
  items: BundleItem[];
  source: Source;
  notes?: string;
  updated: string;
}

export interface Manifest {
  generated: string;
  errors: { id: string; error: string }[];
  warnings: string[];
  stale?: { file: string }[];
  blocked?: { id: string; publisher: string; files: number; last_checked?: string | null }[];
  hand_entered?: Record<string, { next_due: string }>;
}

export interface Data {
  manifest: Manifest;
  series: Record<string, Series>;
  bundles: Record<string, Bundle>;
}

const BASE = `${import.meta.env.BASE_URL}data/`;

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function loadData(seriesIds: string[], bundleIds: string[]): Promise<Data> {
  const [manifest, series, bundles] = await Promise.all([
    getJSON<Manifest>("manifest.json"),
    Promise.all(seriesIds.map((id) => getJSON<Series>(`series/${id}.json`).catch(() => null))),
    Promise.all(bundleIds.map((id) => getJSON<Bundle>(`bundles/${id}.json`).catch(() => null))),
  ]);
  const byId = <T extends { id: string }>(xs: (T | null)[]) =>
    Object.fromEntries(xs.filter((x): x is T => x !== null).map((x) => [x.id, x]));
  return { manifest, series: byId(series), bundles: byId(bundles) };
}

// --- Point helpers ---

export const last = (s: Series): Point => s.points[s.points.length - 1];

/** Value at the latest date on or before `date`. */
export function valueAt(s: Series, date: string): number | undefined {
  let v: number | undefined;
  for (const [d, x] of s.points) {
    if (d <= date) v = x;
    else break;
  }
  return v;
}

export function yearAgo(s: Series, from?: string): number | undefined {
  const d = from ?? last(s)[0];
  return valueAt(s, `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`);
}

export const since = (pts: Point[], start: string): Point[] => pts.filter(([d]) => d >= start);

/** Actual (non-forecast) points of a budget series. */
export const actuals = (s: Series): Point[] =>
  s.forecast_from ? s.points.filter(([d]) => d < s.forecast_from!) : s.points;
