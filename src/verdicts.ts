// One plain-English line per chapter, worked out from the data. Descriptive only, never advice.
import { last, valueAt, yearAgo, type Data } from "./data";
import { fmt, pct, periodLabel, rsBn, usdM } from "./format";

/** ", up from 3.6% a year ago" */
function sinceYearAgo(now: number, ago: number | undefined, dp: number): string {
  if (ago === undefined) return "";
  return Math.abs(now - ago) < 0.5 * 10 ** -dp ? ", unchanged on a year ago" : `, ${now > ago ? "up" : "down"} from ${pct(ago, dp)} a year ago`;
}

export function costVerdict(d: Data): string | undefined {
  const c = d.series.cpi_yoy;
  if (!c) return undefined;
  const now = last(c)[1];
  const prev = c.points.at(-2)?.[1];
  const move = prev === undefined ? "" : now > prev ? `, up from ${pct(prev)} the month before` : now < prev ? `, down from ${pct(prev)} the month before` : ", the same as the month before";
  return `Prices rose ${pct(now)} in the year to ${periodLabel(last(c)[0])}${move}.`;
}

export function jobsVerdict(d: Data): string | undefined {
  const b = d.bundles.unemployment_by_group;
  if (!b) return undefined;
  const all = b.items.find((i) => i.key === "All");
  if (!all) return undefined;
  const prev = all.prev as number | undefined;
  return `The latest count is ${pct(all.value)} unemployed in the ${b.period} survey${prev === undefined ? "" : `, against ${pct(prev)} in the previous survey four years earlier`}. It says little about the past 12 months.`;
}

export function ratesVerdict(d: Data): string | undefined {
  const pol = d.series.policy_rate;
  if (!pol) return undefined;
  const now = last(pol)[1];
  const today = new Date().toISOString().slice(0, 10);
  const ago = valueAt(pol, `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`);
  const lr = d.series.lending_rate_new;
  return `The policy rate is ${pct(now, 2)}${sinceYearAgo(now, ago, 2)}${lr ? `, and banks charged an average of ${pct(last(lr)[1], 1)} on new loans in ${periodLabel(last(lr)[0])}` : ""}.`;
}

export function rupeeVerdict(d: Data): string | undefined {
  const fx = d.series.usd_pkr;
  const res = d.series.reserves_sbp;
  if (!fx) return undefined;
  const v = last(fx)[1];
  const ago = yearAgo(fx);
  const r = ago === undefined ? "" : ` (${v > ago ? "weaker" : v < ago ? "stronger" : "unchanged"} than Rs ${fmt(ago, 2)} a year ago)`;
  return `A US dollar averaged Rs ${fmt(v, 2)} in ${periodLabel(last(fx)[0])}${r}${res ? `, and the State Bank's reserves are ${usdM(last(res)[1])}` : ""}.`;
}

export function abroadVerdict(d: Data): string | undefined {
  const r = d.series.remittances_12m;
  const ca = d.series.current_account_12m;
  if (!r || !ca) return undefined;
  const v = last(ca)[1];
  return `Remittances brought in ${usdM(last(r)[1])} over 12 months, and the current account showed a ${v < 0 ? "deficit" : "surplus"} of ${usdM(Math.abs(v))}.`;
}

export function growthVerdict(d: Data): string | undefined {
  const g = d.series.gdp_growth;
  if (!g) return undefined;
  const v = last(g)[1];
  const prev = g.points.at(-2)?.[1];
  return `The economy ${v >= 0 ? "grew" : "shrank"} ${pct(Math.abs(v))} in FY${periodLabel(last(g)[0], "FY")}${prev === undefined ? "" : `, after ${pct(prev)} the year before`}.`;
}

export function budgetVerdict(d: Data): string | undefined {
  const b = d.series.fy_overall_balance;
  const p = d.series.fy_balance_pct_gdp;
  if (!b) return undefined;
  const [date, v] = last(b);
  const share = p ? last(p)[1] : undefined;
  return `In FY${periodLabel(date, "FY")}${b.provisional_latest ? " (provisional)" : ""}, federal and provincial governments together ran a ${v < 0 ? "deficit" : "surplus"} of ${rsBn(Math.abs(v), 1)}${share === undefined ? "" : ` (${pct(Math.abs(share))} of GDP)`}.`;
}

export function debtVerdict(d: Data): string | undefined {
  const g = d.series.gross_public_debt;
  if (!g) return undefined;
  return `Gross public debt stood at ${rsBn(last(g)[1], 1)} in ${periodLabel(last(g)[0])}, on the State Bank's definition.`;
}

export function businessVerdict(d: Data): string | undefined {
  const l = d.series.lsm_yoy;
  const c = d.series.cci;
  const parts: string[] = [];
  if (l) parts.push(`large-scale factory output ${last(l)[1] >= 0 ? "rose" : "fell"} ${pct(Math.abs(last(l)[1]))} on a year earlier in ${periodLabel(last(l)[0])}`);
  if (c) parts.push(`consumer confidence is ${fmt(last(c)[1], 1)}, where 50 means evenly split`);
  return parts.length ? `${parts[0][0].toUpperCase()}${parts[0].slice(1)}${parts.length > 1 ? `, and ${parts[1]}` : ""}.` : undefined;
}
