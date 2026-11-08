// Plain-English numbers worked out from the data. Descriptive only, never advice.
import { last, since, valueAt, yearAgo, type Data, type Series } from "./data";
import { fmt, pct, periodLabel, rsBn, signed, usdM } from "./format";
import type { TileProps, Tone } from "./components/ui";

const pts = (v: number, dp = 1) => `${signed(v, dp)} pts`;

function yoyDelta(s: Series, upIsGood: boolean | null, unit: (v: number) => string = pts): TileProps["delta"] {
  const now = last(s)[1];
  const ago = yearAgo(s);
  if (ago === undefined) return undefined;
  const d = now - ago;
  const tone = upIsGood === null || Math.abs(d) < 1e-9 ? "neutral" : (d > 0) === upIsGood ? "good" : "bad";
  return { text: unit(d), tone, vs: "vs a year ago" };
}

const spark = (s: Series, years = 5) => {
  const [d] = last(s);
  return since(s.points, `${Number(d.slice(0, 4)) - years}${d.slice(4)}`);
};

const asOf = (s: Series) => periodLabel(last(s)[0], s.freq);

/** A rate only has points when it changes, so extend it to today for sparklines and year-ago lookups. */
export function withToday(s: Series): Series {
  const today = new Date().toISOString().slice(0, 10);
  const [d, v] = last(s);
  return d >= today ? s : { ...s, points: [...s.points, [today, v]] };
}

const perCent = (v: number) => signed(v, 1, "%");

export function buildTiles(data: Data): TileProps[] {
  const S = data.series;
  const tiles: TileProps[] = [];

  const cpi = S.cpi_yoy;
  if (cpi) {
    const v = last(cpi)[1];
    const [lo, hi] = (cpi.target_band as [number, number]) ?? [5, 7];
    const band = `the State Bank's ${lo}–${hi}% target`;
    const chip: { tone: Tone; text: string } =
      v > hi ? { tone: "serious", text: `Above ${band}` }
        : v < lo ? { tone: "warning", text: `Below ${band}` }
          : { tone: "good", text: `Within ${band}` };
    tiles.push({ id: "inflation", label: "Inflation", href: "#chart-inflation", value: pct(v), delta: yoyDelta(cpi, false), chip,
      read: "How much prices rose over the past year (national CPI).", spark: spark(cpi), asOf: asOf(cpi) });
  }

  const pol = S.policy_rate;
  if (pol) {
    const v = last(pol)[1];
    const withNow = withToday(pol);
    const ago = valueAt(pol, `${Number(withNow.points.at(-1)![0].slice(0, 4)) - 1}${withNow.points.at(-1)![0].slice(4)}`);
    const d = ago === undefined ? undefined : v - ago;
    tiles.push({ id: "policy_rate", label: "Policy rate", href: "#chart-policy", value: pct(v, 2),
      delta: d === undefined ? undefined : { text: pts(d, 2), tone: "neutral", vs: "vs a year ago" },
      chip: { tone: "neutral", text: d === undefined || Math.abs(d) < 0.01 ? "Unchanged on a year ago" : d > 0 ? "Higher than a year ago" : "Lower than a year ago" },
      read: "The rate set by the State Bank, which guides what banks charge.",
      spark: spark(withNow), asOf: `Last change ${periodLabel(last(pol)[0], "event")}` });
  }

  const fx = S.usd_pkr;
  if (fx) {
    const v = last(fx)[1];
    const ago = yearAgo(fx);
    tiles.push({ id: "rupee", label: "Rupee per US dollar", href: "#chart-rupee", value: `Rs ${fmt(v, 2)}`,
      delta: ago === undefined ? undefined : { text: perCent((v / ago - 1) * 100), tone: "neutral", vs: "vs a year ago" },
      chip: { tone: "neutral", text: ago !== undefined && v > ago * 1.005 ? "Dollar costs more than a year ago" : ago !== undefined && v < ago * 0.995 ? "Dollar costs less than a year ago" : "Little changed on a year ago" },
      read: "Interbank monthly average. More rupees per dollar means a weaker rupee.", spark: spark(fx), asOf: asOf(fx) });
  }

  const res = S.reserves_sbp;
  if (res) {
    const v = last(res)[1];
    const ago = yearAgo(res);
    tiles.push({ id: "reserves", label: "State Bank's reserves", href: "#chart-reserves", value: usdM(v),
      delta: ago === undefined ? undefined : { text: perCent((v / ago - 1) * 100), tone: "neutral", vs: "vs a year ago" },
      chip: { tone: "neutral", text: ago !== undefined && v > ago * 1.02 ? "Higher than a year ago" : ago !== undefined && v < ago * 0.98 ? "Lower than a year ago" : "Little changed on a year ago" },
      read: "Net foreign exchange held by the State Bank. Includes deposits lent by friendly countries.", spark: spark(res, 3), asOf: `Week ended ${periodLabel(last(res)[0], "event")}` });
  }

  const gdp = S.gdp_growth;
  if (gdp) {
    const v = last(gdp)[1];
    tiles.push({ id: "gdp", label: "Economic growth", href: "#chart-gdp", value: pct(v), delta: yoyDelta(gdp, true),
      chip: { tone: "neutral", text: "Real GDP, latest financial year" }, read: "How much more the country produced than the year before, after inflation.",
      spark: gdp.points.slice(-8), asOf: `FY${periodLabel(last(gdp)[0], "FY")}` });
  }

  const ca = S.current_account_12m;
  if (ca) {
    const v = last(ca)[1];
    tiles.push({ id: "current_account", label: "Current account, 12 months", href: "#chart-current-account", value: usdM(v), chip: { tone: "neutral", text: v < 0 ? "Deficit: more money out than in" : "Surplus: more money in than out" },
      read: "Trade, remittances and income from abroad combined.", spark: spark(ca, 3), asOf: `12 months to ${periodLabel(last(ca)[0])}` });
  }

  const rem = S.remittances_12m;
  if (rem) {
    const v = last(rem)[1];
    const ago = yearAgo(rem);
    tiles.push({ id: "remittances", label: "Remittances, 12 months", href: "#chart-remittances", value: usdM(v),
      delta: ago === undefined ? undefined : { text: perCent((v / ago - 1) * 100), tone: "neutral", vs: "vs the 12 months before" },
      read: "Money sent home by Pakistanis working abroad.", spark: spark(rem, 3), asOf: `12 months to ${periodLabel(last(rem)[0])}` });
  }

  const debt = S.gross_public_debt;
  if (debt) {
    const v = last(debt)[1];
    const pctGdp = data.bundles.misc?.items.find((i) => i.key === "gross_public_debt_gdp_fy26");
    tiles.push({ id: "public_debt", label: "Gross public debt", href: "#chart-debt", value: rsBn(v, 1),
      chip: pctGdp ? { tone: "neutral", text: `${pct(pctGdp.value)} of GDP in the latest year (${pct(pctGdp.prev as number)} the year before)` } : undefined,
      read: "Government domestic and external debt, plus debt from the IMF (SBP definition).", spark: debt.points, asOf: periodLabel(last(debt)[0]) });
  }

  const cci = S.cci;
  if (cci) {
    const v = last(cci)[1];
    const ago = yearAgo(cci);
    tiles.push({ id: "confidence", label: "Consumer confidence", href: "#chart-confidence", value: fmt(v, 1),
      delta: ago === undefined ? undefined : { text: pts(v - ago, 1), tone: "neutral", vs: "vs a year ago" },
      chip: { tone: v >= 50 ? "good" : "warning", text: v >= 50 ? "More optimists than pessimists" : "More pessimists than optimists" },
      read: "A survey by the State Bank and IBA. 50 means evenly split.", spark: spark(cci, 3), asOf: asOf(cci) });
  }

  return tiles;
}

export function buildHeadline(data: Data): string {
  const S = data.series;
  const parts: string[] = [];
  if (S.cpi_yoy) parts.push(`Prices rose ${pct(last(S.cpi_yoy)[1])} over the year to ${periodLabel(last(S.cpi_yoy)[0])}`);
  if (S.policy_rate) parts.push(`the State Bank's policy rate is ${pct(last(S.policy_rate)[1], 2)}`);
  if (S.reserves_sbp) parts.push(`its reserves are ${usdM(last(S.reserves_sbp)[1])}`);
  return parts.length ? `${parts.join(", ")}.` : "The latest figures are shown below.";
}

export function buildSummary(data: Data): string[] {
  const S = data.series;
  const out: string[] = [];
  const say = (x: string | undefined) => x && out.push(x);
  if (S.cpi_yoy) {
    const v = last(S.cpi_yoy)[1];
    const [lo, hi] = (S.cpi_yoy.target_band as [number, number]) ?? [5, 7];
    say(`National CPI inflation was ${pct(v)} in ${periodLabel(last(S.cpi_yoy)[0])}, ${v > hi ? "above" : v < lo ? "below" : "within"} the State Bank's ${lo}–${hi}% target.`);
  }
  if (S.policy_rate && S.lending_rate_new) say(`The policy rate is ${pct(last(S.policy_rate)[1], 2)}; banks charged an average of ${pct(last(S.lending_rate_new)[1], 1)} on new loans in ${periodLabel(last(S.lending_rate_new)[0])}.`);
  if (S.usd_pkr && S.reserves_sbp) say(`A US dollar averaged Rs ${fmt(last(S.usd_pkr)[1], 2)} on the interbank market in ${periodLabel(last(S.usd_pkr)[0])}, and the State Bank held ${usdM(last(S.reserves_sbp)[1])} in net reserves in the week ended ${periodLabel(last(S.reserves_sbp)[0], "event")}.`);
  if (S.current_account_12m && S.remittances_12m) say(`Over the 12 months to ${periodLabel(last(S.current_account_12m)[0])}, remittances brought in ${usdM(last(S.remittances_12m)[1])} and the current account showed a ${last(S.current_account_12m)[1] < 0 ? "deficit" : "surplus"} of ${usdM(Math.abs(last(S.current_account_12m)[1]))}.`);
  if (S.gdp_growth) say(`Real GDP grew ${pct(last(S.gdp_growth)[1])} in FY${periodLabel(last(S.gdp_growth)[0], "FY")}, a figure PBS may still revise.`);
  if (S.fy_overall_balance) {
    const v = last(S.fy_overall_balance)[1];
    say(`Consolidated federal and provincial finances showed a ${v < 0 ? "deficit" : "surplus"} of ${rsBn(Math.abs(v), 1)} in FY${periodLabel(last(S.fy_overall_balance)[0], "FY")}.`);
  }
  return out;
}
