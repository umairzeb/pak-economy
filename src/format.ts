const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Human label for a period-end ISO date, given the series frequency. */
export function periodLabel(iso: string, freq = "M"): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  if (freq === "Q") return `${MONTHS[m - 1]} qtr ${y}`;
  if (freq === "FY") return `${y - 1}-${String(y).slice(2)}`;
  if (freq === "D" || freq === "event") return `${Number(iso.slice(8, 10))} ${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${y}`;
}

export const fmt = (v: number, dp = 1) =>
  v.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const pct = (v: number, dp = 1) => `${fmt(v, dp)}%`;

export const signed = (v: number, dp = 1, suffix = "") => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v), dp)}${suffix}`;

export const billions = (v: number, dp = 1) => `$${fmt(v, dp)}bn`;

/** Rupees: Rs 1.2tn at or above a trillion rupees, otherwise Rs 850bn. Input in Rs billion. */
export const rsBn = (v: number, dp = 1) => {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  return a >= 1000 ? `${sign}Rs ${fmt(a / 1000, a >= 10000 ? 1 : 2)}tn` : `${sign}Rs ${fmt(a, a >= 100 ? 0 : dp)}bn`;
};

/** US dollars. Input in US$ million. */
export const usdM = (v: number, dp = 1) => {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  return a >= 1000 ? `${sign}$${fmt(a / 1000, dp)}bn` : `${sign}$${fmt(a, 0)}m`;
};

/** Compact number: 27.9M, 292K, 1,284. */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${fmt(v / 1e9, 1)}B`;
  if (a >= 1e6) return `${fmt(v / 1e6, 1)}M`;
  if (a >= 1e4) return `${fmt(v / 1e3, 0)}K`;
  return fmt(v, 0);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
