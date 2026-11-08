// The chapters: each one a short verdict and the charts that back it up.
import type { ReactNode } from "react";
import { last, since, valueAt, yearAgo, type Bundle, type BundleItem, type Data, type Point, type Series } from "./data";
import { BarCard, ColumnCard, GroupedCard, LineCard } from "./cards";
import type { BarItem } from "./charts";
import { Chapter, pick } from "./chapter";
import { ChartCard, type TileProps } from "./components/ui";
import { fmt, pct, periodLabel, rsBn, signed, usdM } from "./format";
import { useTokens } from "./theme";
import { abroadVerdict, budgetVerdict, businessVerdict, costVerdict, debtVerdict, growthVerdict, jobsVerdict, ratesVerdict, rupeeVerdict } from "./verdicts";
import { withToday } from "./insights";

type Props = { data: Data; tiles: TileProps[] };

const rate = (dp = 1) => (v: number) => pct(v, dp);
const rupees = (v: number) => `Rs ${fmt(v, v >= 1000 ? 0 : 2)}`;
const millions = (v: number) => usdM(v);

function Mini({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="mini">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

/** Top n items, the rest folded into one "All other" bar. */
function topWithOther(b: Bundle, n: number, otherLabel: string, sorted = true): BundleItem[] {
  const base = sorted ? [...b.items].sort((x, y) => y.value - x.value) : b.items;
  const items = base.slice(0, n);
  const rest = base.slice(n);
  if (!rest.length) return items;
  const value = rest.reduce((a, i) => a + i.value, 0);
  const share = rest.reduce((a, i) => a + (i.share ?? 0), 0);
  return [...items, { key: "other", label: otherLabel, value: Math.round(value * 10) / 10, share: Math.round(share * 10) / 10, parts: rest.map((r) => ({ label: r.label, value: r.value })) }];
}

const partsExpand = (item: BundleItem, title: string, valueFmt: (v: number) => string, note?: string): BarItem["expand"] =>
  item.parts && item.parts.length > 0 ? { title, rows: item.parts.map((p) => ({ label: p.label, value: valueFmt(p.value) })), note } : undefined;

function useS(data: Data) {
  return data.series;
}

// Note-style card for a fact with no chart.
function FactCard({ title, children, source }: { title: string; children: ReactNode; source: { name: string; dataset: string; url: string } }) {
  return (
    <ChartCard title={title} sources={[source]}>
      <div className="fact-body">{children}</div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------- 1 Cost of living
export function CostSection({ data, tiles }: Props) {
  const S = useS(data);
  const t = useTokens();
  const groups = data.bundles.cpi_groups;
  const spi = data.bundles.spi_items;
  const staples = spi ? spi.items.filter((i) => /Wheat Flour|Rice Basmati|Milk fresh|Chicken|Eggs|Sugar|Cooking Oil|Tomatoes|Onions|Potatoes|Mutton|Beef/.test(i.label)) : [];
  const fuel = spi ? spi.items.filter((i) => /Petrol|Hi-Speed Diesel|LPG|Electricity|Gas/.test(i.label)) : [];
  const nfneU = S.core_nfne_urban;
  const trimU = S.core_trimmed_urban;
  return (
    <Chapter id="cost" verdict={costVerdict(data)} tiles={pick(tiles, "inflation")}>
      {S.cpi_yoy && (
        <LineCard anchor="chart-inflation" title="Inflation" subtitle="National CPI, change on a year earlier"
          takeaway={<>The shaded band is the State Bank's target of {S.cpi_yoy.target_band?.[0]}–{S.cpi_yoy.target_band?.[1]}%. Figures are on the 2015-16 base, published from July 2017.</>}
          note={S.cpi_urban_yoy ? <>Earlier national CPI used an older base (2007-08). It is not joined on, so this chart starts at July 2017.</> : undefined}
          lines={[{ s: S.cpi_yoy, name: "National CPI", color: t.s1 }]} yFormat={rate()} band={S.cpi_yoy.target_band as [number, number]} bandLabel="SBP's target" zeroLine
          glossary={{ title: "Terms", terms: [{ term: "CPI", text: "Consumer Price Index: the cost of a typical household's shopping basket." }, { term: "Year-on-year", text: "The change compared with the same month 12 months earlier." }] }} />
      )}
      {S.cpi_urban_yoy && S.cpi_rural_yoy && (
        <LineCard anchor="chart-urban-rural" title="Inflation in cities and villages" subtitle="Urban and rural CPI, change on a year earlier"
          takeaway={<>Rural inflation in {periodLabel(last(S.cpi_rural_yoy)[0])} was {last(S.cpi_rural_yoy)[1] > last(S.cpi_urban_yoy)[1] ? "higher than" : last(S.cpi_rural_yoy)[1] < last(S.cpi_urban_yoy)[1] ? "lower than" : "the same as"} urban inflation.</>}
          lines={[{ s: S.cpi_urban_yoy, name: "Urban", color: t.s1 }, { s: S.cpi_rural_yoy, name: "Rural", color: t.s2 }]} yFormat={rate()} zeroLine />
      )}
      {S.cpi_food_yoy && S.cpi_transport_yoy && S.cpi_housing_yoy && (
        <LineCard anchor="chart-food-energy" title="Food, housing and transport prices" subtitle="National CPI groups, change on a year earlier. Starts 2023, when PBS's group data begins"
          takeaway={<>Housing includes rent, electricity and gas. Transport includes petrol.</>}
          lines={[{ s: S.cpi_food_yoy, name: "Food", color: t.s1 }, { s: S.cpi_housing_yoy, name: "Housing and power", color: t.s2 }, { s: S.cpi_transport_yoy, name: "Transport", color: t.s3 }]} yFormat={rate()} zeroLine />
      )}
      {groups && (
        <BarCard anchor="chart-groups" title={`Where prices rose, ${periodLabel(groups.as_of)}`} subtitle="Change on a year earlier, by CPI group"
          takeaway={<>Bars show how fast each group's prices rose. Weights in the table show its share of a typical household's budget (2015-16 base).</>}
          items={[...groups.items].sort((a, b) => b.value - a.value).map((i) => ({ label: i.label, value: i.value, color: t.s1, extra: `Weight ${fmt(i.weight as number, 1)}% of the basket` }))}
          valueFormat={rate()} sources={[groups.source]} asOf={periodLabel(groups.as_of)}
          table={{ head: ["Group", "Change on a year earlier", "Weight"], rows: [...groups.items].sort((a, b) => b.value - a.value).map((i) => [i.label, pct(i.value), `${fmt(i.weight as number, 1)}%`]), num: [1, 2] }} />
      )}
      {spi && staples.length > 0 && (
        <BarCard anchor="chart-staples" title="What the staples cost" subtitle={`Change in the price on a year earlier. Week ended ${periodLabel(spi.as_of, "event")}`}
          takeaway={<>These are average prices from PBS's weekly survey of 17 cities. Tap a bar for the rupee price, or show the table for all 51 items.</>}
          items={staples.sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0)).map((i) => ({ label: i.label.replace(/\(.*?\)/g, "").trim(), value: i.change_pct ?? 0, color: (i.change_pct ?? 0) >= 0 ? t.s1 : t.divPos, extra: `Rs ${fmt(i.value, 0)} for ${i.unit}`, details: [`A year earlier: Rs ${fmt(i.year_ago as number, 0)}`] }))}
          valueFormat={(v) => signed(v, 0, "%")} sources={[spi.source]} asOf={`week ended ${periodLabel(spi.as_of, "event")}`}
          note={<>The weekly SPI is a narrower basket than CPI and is measured in cities only, so its figure differs from headline inflation.</>}
          table={{ head: ["Item", "Unit", "Now", "A year ago", "Change"], rows: spi.items.map((i) => [i.label, i.unit ?? "", rupees(i.value), rupees(i.year_ago as number), i.change_pct == null ? "–" : signed(i.change_pct, 1, "%")]), num: [2, 3, 4] }} />
      )}
      {spi && fuel.length > 0 && (
        <BarCard anchor="chart-fuel" title="Fuel and power prices" subtitle={`Change on a year earlier. Week ended ${periodLabel(spi.as_of, "event")}`}
          takeaway={<>Fuel and power prices change often, so the latest readings can differ from what is at the pump today.</>}
          items={[...fuel].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0)).map((i) => ({ label: i.label, value: i.change_pct ?? 0, color: (i.change_pct ?? 0) >= 0 ? t.s1 : t.divPos, extra: `Rs ${fmt(i.value, 2)} per ${i.unit}`, details: [`A year earlier: Rs ${fmt(i.year_ago as number, 2)}`] }))}
          valueFormat={(v) => signed(v, 0, "%")} sources={[spi.source]} asOf={`week ended ${periodLabel(spi.as_of, "event")}`}
          table={{ head: ["Item", "Now", "A year ago", "Change"], rows: fuel.map((i) => [`${i.label} (${i.unit})`, rupees(i.value), rupees(i.year_ago as number), i.change_pct == null ? "–" : signed(i.change_pct, 1, "%")]), num: [1, 2, 3] }} />
      )}
      {nfneU && trimU && (
        <FactCard title="Underlying inflation" source={nfneU.source}>
          <div className="mini-row">
            <Mini label="Excluding food and energy, urban" value={pct(last(nfneU)[1])} note={`${periodLabel(last(nfneU)[0])}, change on a year earlier`} />
            <Mini label="Trimmed mean, urban" value={pct(last(trimU)[1])} note={periodLabel(last(trimU)[0])} />
          </div>
          <p>PBS strips out the most volatile prices to show the underlying trend. Only the latest 13 months are published in one place, so this is not charted.</p>
        </FactCard>
      )}
      {S.cpi_annual_wb && (
        <LineCard anchor="chart-long-inflation" title="Inflation over the long run" subtitle="Annual average, calendar years. World Bank series, not Pakistan's own"
          takeaway={<>Use this for the long view only. It is an international series, the latest figure can lag by a year or more, and its years don't line up with Pakistan's July-to-June financial year.</>}
          lines={[{ s: S.cpi_annual_wb, name: "CPI inflation (World Bank)", color: t.s2 }]} yFormat={rate()} zeroLine events={false} />
      )}
    </Chapter>
  );
}

// ---------------------------------------------------------------- 2 Jobs and pay
export function JobsSection({ data }: Props) {
  const S = useS(data);
  const t = useTokens();
  const groups = data.bundles.unemployment_by_group;
  const lab = data.bundles.labour_summary;
  const wages = data.bundles.daily_wages;
  const wageChange = (() => {
    if (!lab || !S.cpi_index) return null;
    const extra = lab.extra as { avg_monthly_wage: number; avg_monthly_wage_prev: number; participation: number };
    const up = (extra.avg_monthly_wage / extra.avg_monthly_wage_prev - 1) * 100;
    const pts = S.cpi_index.points;
    const p0 = valueAt(S.cpi_index, "2021-06-30");
    const p1 = valueAt(S.cpi_index, "2025-06-30");
    const priceUp = p0 && p1 ? (p1 / p0 - 1) * 100 : null;
    return { ...extra, up, priceUp, latestCpiDate: pts.at(-1)?.[0] };
  })();
  return (
    <Chapter id="jobs" verdict={jobsVerdict(data)}>
      {groups && lab && (
        <>
          <GroupedCard anchor="chart-jobs" title={`Unemployment, ${groups.period} survey`} subtitle="Share of people in the labour force looking for work"
            takeaway={<>This is the latest official count. The survey is run only every few years, the last one in {groups.period}, so these figures don't reflect the past 12 months.</>}
            note={<>Pakistan's survey counts people aged 10 and over, and much of Pakistan's work is informal. Someone earning a little can count as employed while being far from secure.</>}
            categories={groups.items.map((i) => i.label)}
            series={[{ name: "2024-25 survey", color: t.s1, values: groups.items.map((i) => i.value) }, { name: "2020-21 survey", color: t.s2, values: groups.items.map((i) => i.prev as number) }]}
            valueFormat={rate()} sources={[groups.source]} asOf={`survey ${groups.period}`}
            table={{ head: ["Group", "2024-25", "2020-21", "Change"], rows: groups.items.map((i) => [i.label, pct(i.value), pct(i.prev as number), signed(i.change as number, 1, " pts")]), num: [1, 2, 3] }} />
          <FactCard title="The labour force in numbers" source={lab.source}>
            <div className="mini-row">
              {lab.items.map((i) => <Mini key={i.key} label={i.label} value={`${fmt(i.value, 1)}m`} note={`${fmt(i.prev as number, 1)}m in the 2020-21 survey`} />)}
              {wageChange && <Mini label="Share in the labour force" value={pct(wageChange.participation)} note="Aged 10 and over" />}
            </div>
            <p>Between the two surveys the labour force grew by about {fmt((lab.items[0].value - (lab.items[0].prev as number)) / 4, 1)} million a year, and the number in work by about {fmt((lab.items[1].value - (lab.items[1].prev as number)) / 4, 1)} million a year.</p>
          </FactCard>
        </>
      )}
      {wageChange && (
        <FactCard title="Average monthly pay" source={lab.source}>
          <div className="mini-row">
            <Mini label="Average monthly wage, paid employees" value={rupees(wageChange.avg_monthly_wage)} note={`2024-25 survey (${rupees(wageChange.avg_monthly_wage_prev)} in 2020-21)`} />
            <Mini label="Rise in the wage" value={signed(wageChange.up, 0, "%")} note="Between the two surveys" />
            {wageChange.priceUp !== null && <Mini label="Rise in prices (CPI)" value={signed(wageChange.priceUp, 0, "%")} note="June 2021 to June 2025" />}
          </div>
          <p>Only paid employees count here, a minority of workers, and only people who answered the wage question. There is no official wage index in Pakistan.</p>
        </FactCard>
      )}
      {wages && (
        <BarCard anchor="chart-wages" title="Daily wages in construction trades" subtitle={`Rupees per day, ${wages.source.dataset.includes("Monthly") ? "latest month" : ""} across ${wages.items[0]?.cities ?? ""} cities`}
          takeaway={<>Averages of the rates PBS records for each trade: a guide to pay in construction, not across the country.</>}
          items={[...wages.items].sort((a, b) => b.value - a.value).map((i) => ({ label: i.label, value: i.value, color: t.s1 }))}
          valueFormat={(v) => rupees(v)} sources={[wages.source]} asOf={periodLabel(wages.as_of, "event")}
          table={{ head: ["Trade", "Rs per day"], rows: wages.items.map((i) => [i.label, rupees(i.value)]), num: [1] }}
          note={<>PBS records these for its SPI work. Only the latest month is published in this file, so no trend is shown.</>} />
      )}
    </Chapter>
  );
}

// ---------------------------------------------------------------- 3 Interest rates and loans
export function RatesSection({ data, tiles }: Props) {
  const S = useS(data);
  const t = useTokens();
  // Real rate: policy rate at each month-end minus that month's CPI inflation.
  const realRate: Point[] = (() => {
    if (!S.policy_rate || !S.cpi_yoy) return [];
    return S.cpi_yoy.points.map(([d, v]) => [d, Math.round(((valueAt(S.policy_rate!, d) ?? 0) - v) * 10) / 10] as Point);
  })();
  const realSeries = realRate.length ? ({ ...S.cpi_yoy, id: "real_rate", title: "Real policy rate", unit: "%", points: realRate, source: { ...S.policy_rate.source, dataset: "Policy rate (SBP) minus CPI inflation (PBS)" } } as Series) : undefined;
  return (
    <Chapter id="rates" verdict={ratesVerdict(data)} tiles={pick(tiles, "policy_rate")}>
      {S.policy_rate && (
        <LineCard anchor="chart-policy" title="The State Bank's policy rate" subtitle="Dated from the day each change took effect"
          takeaway={<>Decisions are made by the Monetary Policy Committee, usually about every 6 to 8 weeks. Banks' own rates move with it.</>}
          note={<>Before 25 May 2015 the State Bank's ceiling (reverse repo) rate served as its policy rate; before August 2009 that was the 3-day repo rate.</>}
          lines={[{ s: S.policy_rate, name: "Policy rate", color: t.s1, step: true, points: withToday(S.policy_rate).points }]} yFormat={rate(2)} breaks
          glossary={{ title: "Terms", terms: [{ term: "Policy rate", text: "The interest rate the State Bank targets for short-term lending between banks." }, { term: "Corridor", text: "The ceiling and floor rates either side of the policy rate, which banks pay to borrow from or lend to the State Bank overnight." }] }} />
      )}
      {realSeries && (
        <LineCard anchor="chart-real-rate" title="Interest rates after inflation" subtitle="Policy rate minus national CPI inflation, in percentage points"
          takeaway={<>A positive figure means the policy rate is above inflation, a negative one means prices are rising faster than the rate.</>}
          note={<>Calculated from the policy rate at the end of each month and that month's CPI inflation. Worked out here, not published by the State Bank.</>}
          lines={[{ s: realSeries, name: "Real policy rate", color: t.s1 }]} yFormat={(v) => `${signed(v, 1)} pts`} zeroLine />
      )}
      {S.lending_rate_new && S.deposit_rate_new && (
        <LineCard anchor="chart-lending" title="What banks charge and pay" subtitle="Average rates on new loans and new deposits, scheduled banks. Starts January 2011"
          takeaway={<>Figures leave out interest-free loans and deposits and lending between banks. They are averages; rates on individual loans can be far higher.</>}
          lines={[{ s: S.lending_rate_new, name: "New loans", color: t.s1 }, { s: S.deposit_rate_new, name: "New deposits", color: t.s2 }]} yFormat={rate()} />
      )}
      {S.credit_private_yoy && S.credit_government_yoy && (
        <LineCard anchor="chart-credit" title="Who banks lend to" subtitle="Change in credit outstanding on a year earlier"
          takeaway={<>Credit to government includes banks' holdings of government securities. In {periodLabel(last(S.credit_private_yoy)[0])} private-sector credit was {signed(last(S.credit_private_yoy)[1], 1, "%")} on a year earlier and credit to government {signed(last(S.credit_government_yoy)[1], 1, "%")}.</>}
          lines={[{ s: S.credit_private_yoy, name: "Private sector", color: t.s1 }, { s: S.credit_government_yoy, name: "Government", color: t.s2 }]} yFormat={rate()} zeroLine />
      )}
    </Chapter>
  );
}

// ---------------------------------------------------------------- 4 Rupee and reserves
export function RupeeSection({ data, tiles }: Props) {
  const S = useS(data);
  const t = useTokens();
  const om = data.bundles.open_market_rate;
  const fx = S.usd_pkr;
  const ib = fx ? last(fx)[1] : undefined;
  const omSell = om?.items.find((i) => i.key === "sell")?.value;
  return (
    <Chapter id="rupee" verdict={rupeeVerdict(data)} tiles={pick(tiles, "rupee", "reserves")}>
      {fx && (
        <LineCard anchor="chart-rupee" title="Rupees per US dollar" subtitle="Interbank market, monthly average. A higher line means a weaker rupee"
          takeaway={<>The rate banks trade at with each other, averaged over each month.</>}
          lines={[{ s: fx, name: "Rs per US$", color: t.s1 }]} yFormat={(v) => `Rs ${fmt(v, 0)}`}
          glossary={{ title: "Terms", terms: [{ term: "Interbank", text: "The market where banks trade currency with each other. This is the official reference rate." }, { term: "Open market", text: "The cash rate at exchange companies, usually a little higher." }] }} />
      )}
      {om && ib !== undefined && (
        <FactCard title="Interbank and open market" source={om.source}>
          <div className="mini-row">
            <Mini label="Interbank monthly average" value={`Rs ${fmt(ib, 2)}`} note={fx ? periodLabel(last(fx)[0]) : undefined} />
            <Mini label="Open market, selling" value={omSell ? `Rs ${fmt(omSell, 2)}` : "–"} note={`Close on ${periodLabel(om.as_of, "event")}`} />
            {omSell && <Mini label="Gap" value={`Rs ${fmt(omSell - ib, 2)}`} note="Selling rate minus interbank average" />}
          </div>
          <p>The open-market figure is for one day, and the interbank figure is a monthly average, so they are not like for like. The State Bank's file has no open-market history.</p>
        </FactCard>
      )}
      {S.reserves_sbp && S.reserves_total && (
        <LineCard anchor="chart-reserves" title="Foreign exchange reserves" subtitle="Weekly, starts May 2011"
          takeaway={<>Reserves are money from abroad held by the State Bank and commercial banks. Part of the State Bank's total is deposits lent by friendly countries, which it does not list separately in this table.</>}
          lines={[{ s: S.reserves_sbp, name: "State Bank (net)", color: t.s1 }, { s: S.reserves_banks, name: "Commercial banks (net)", color: t.s2 }]} yFormat={millions}
          note={<>The State Bank notes that latest weeks are provisional and can be revised.</>} />
      )}
    </Chapter>
  );
}

// ---------------------------------------------------------------- 5 Remittances and trade
export function AbroadSection({ data, tiles }: Props) {
  const S = useS(data);
  const t = useTokens();
  const rc = data.bundles.remittances_by_country;
  const ex = data.bundles.exports_by_group;
  const im = data.bundles.imports_by_group;
  const groupBar = (b: Bundle, label: string) =>
    b.items.map((i) => ({ label: i.label, value: i.value, color: i.label.startsWith("All") ? t.s2 : t.s1, extra: `${pct(i.share as number, 0)} of ${label}${i.change_pct == null ? "" : ` · ${signed(i.change_pct, 0, "%")} on the 12 months before`}`, expand: partsExpand(i, `What's inside ${i.label}`, (v) => `$${fmt(v, 2)}bn`) }));
  return (
    <Chapter id="abroad" verdict={abroadVerdict(data)} tiles={pick(tiles, "remittances", "current_account")}>
      {S.remittances_12m && (
        <LineCard anchor="chart-remittances" title="Remittances" subtitle="12-month total, money sent home by workers abroad"
          takeaway={<>Over the same 12 months, goods imports were {S.imports_12m ? usdM(last(S.imports_12m)[1]) : "not available"}. A 12-month total smooths out the jump around Eid.</>}
          lines={[{ s: S.remittances_12m, name: "Remittances", color: t.s1 }]} yFormat={millions} />
      )}
      {rc && (
        <BarCard anchor="chart-remittance-countries" title="Where remittances come from" subtitle="Latest 12 months, by country or region"
          takeaway={<>The largest single source is {[...rc.items].sort((a, b) => b.value - a.value)[0].label}.</>}
          items={topWithOther(rc, 7, "Other countries").map((i) => ({ label: i.label, value: i.value, color: t.s1, expand: i.key === "other" ? { title: "Other countries", rows: (i.parts ?? []).map((p) => ({ label: p.label, value: usdM(p.value) })) } : partsExpand(i, `What's inside ${i.label}`, (v) => usdM(v)) }))}
          valueFormat={millions} sources={[rc.source]} asOf={`12 months to ${periodLabel(rc.as_of)}`}
          table={{ head: ["Country or region", "US$"], rows: rc.items.map((i) => [i.label, usdM(i.value)]), num: [1] }} />
      )}
      {S.exports_12m && S.imports_12m && (
        <LineCard anchor="chart-trade" title="Exports and imports of goods" subtitle="12-month totals. State Bank payments basis, not PBS customs figures"
          takeaway={<>The State Bank records goods when paid for and PBS when they cross customs, so the two sets of totals differ by month.</>}
          lines={[{ s: S.exports_12m, name: "Exports", color: t.s1 }, { s: S.imports_12m, name: "Imports", color: t.s2 }]} yFormat={millions} />
      )}
      {ex && (
        <BarCard anchor="chart-exports" title="What Pakistan sells" subtitle={`Latest 12 months. Total ${usdM(ex.total as number * 1000)}`}
          takeaway={<>{ex.items[0] ? `${[...ex.items].sort((a, b) => b.value - a.value)[0].label} is the biggest group, at ${pct([...ex.items].sort((a, b) => b.value - a.value)[0].share as number, 0)} of exports.` : ""}</>}
          items={groupBar(ex, "exports")} valueFormat={(v) => `$${fmt(v, 1)}bn`} sources={[ex.source]} asOf={`12 months to ${periodLabel(ex.as_of)}`}
          table={{ head: ["Group", "US$", "Share", "Change"], rows: ex.items.map((i) => [i.label, `$${fmt(i.value, 2)}bn`, pct(i.share as number, 0), i.change_pct == null ? "–" : signed(i.change_pct, 1, "%")]), num: [1, 2, 3] }} />
      )}
      {im && (
        <BarCard anchor="chart-imports" title="What Pakistan buys" subtitle={`Latest 12 months. Total ${usdM(im.total as number * 1000)}`}
          takeaway={<>{im.items[0] ? `${[...im.items].sort((a, b) => b.value - a.value)[0].label} is the biggest group, at ${pct([...im.items].sort((a, b) => b.value - a.value)[0].share as number, 0)} of imports.` : ""}</>}
          items={groupBar(im, "imports")} valueFormat={(v) => `$${fmt(v, 1)}bn`} sources={[im.source]} asOf={`12 months to ${periodLabel(im.as_of)}`}
          table={{ head: ["Group", "US$", "Share", "Change"], rows: im.items.map((i) => [i.label, `$${fmt(i.value, 2)}bn`, pct(i.share as number, 0), i.change_pct == null ? "–" : signed(i.change_pct, 1, "%")]), num: [1, 2, 3] }} />
      )}
      {S.current_account_12m && (
        <LineCard anchor="chart-current-account" title="The current account" subtitle="12-month total. Below zero means more money leaves than arrives"
          takeaway={<>Adds together trade in goods and services, income from abroad and remittances. A deficit has to be financed by borrowing, investment or drawing on reserves.</>}
          lines={[{ s: S.current_account_12m, name: "Current account", color: t.s1 }]} yFormat={millions} zeroLine />
      )}
      {S.fdi_12m && (
        <LineCard anchor="chart-fdi" title="Foreign direct investment" subtitle="12-month total of investment into Pakistan"
          takeaway={<>Money foreign companies put into businesses in Pakistan over the latest 12 months: {usdM(last(S.fdi_12m)[1])}.</>}
          lines={[{ s: S.fdi_12m, name: "FDI", color: t.s1 }]} yFormat={millions} zeroLine />
      )}
    </Chapter>
  );
}

// ---------------------------------------------------------------- 6 Growth
export function GrowthSection({ data, tiles }: Props) {
  const S = useS(data);
  const t = useTokens();
  const b = data.bundles.gdp_by_sector;
  const latest = b ? periodLabel(b.as_of, "FY") : "";
  return (
    <Chapter id="growth" verdict={growthVerdict(data)} tiles={pick(tiles, "gdp")}>
      {S.gdp_growth && (
        <ColumnCard anchor="chart-gdp" title="Real GDP growth" subtitle="Change on the previous financial year, July to June. PBS revises recent years, so the latest figure can change"
          takeaway={<>PBS estimates growth using a sample of activity. Much of Pakistan's economy is informal, and these estimates capture it only partly.</>}
          s={S.gdp_growth} name="Growth" yFormat={rate()} />
      )}
      {S.gdp_quarterly && (
        <LineCard anchor="chart-gdp-quarterly" title="Growth by quarter" subtitle="Total value added, change on the same quarter a year earlier"
          takeaway={<>Quarterly figures are volatile and PBS revises them. Q1 is July to September, so the last quarter of each year ends in June.</>}
          lines={[{ s: S.gdp_quarterly, name: "Quarterly growth", color: t.s1 }]} yFormat={rate()} zeroLine events={false} />
      )}
      {b && (
        <BarCard anchor="chart-sectors" title={`Growth by sector, FY${latest}`} subtitle="Real growth, with each sector's share of the economy"
          takeaway={<>The largest part of the economy is {[...b.items].sort((x, y) => (y.share as number) - (x.share as number))[0].label.toLowerCase()}, at {pct([...b.items].sort((x, y) => (y.share as number) - (x.share as number))[0].share as number, 0)} of output. Growth is on the previous financial year.</>}
          items={b.items.map((i) => ({ label: i.label, value: i.value, color: t.s1, extra: `${pct(i.share as number, 0)} of the economy (2015-16 prices)`, expand: partsExpand(i, `What's inside ${i.label}`, (v) => pct(v), "Share of the economy shown in the table.") }))}
          valueFormat={rate()} sources={[b.source]} asOf={`FY${latest}`}
          table={{ head: ["Sector", "Growth", "Share of the economy"], rows: [...b.items.map((i) => [i.label, pct(i.value), pct(i.share as number, 1)]), ...b.items.flatMap((i) => (i.parts ?? []).map((p) => [`— ${p.label}`, pct(p.value), pct(p.share as number, 1)]))], num: [1, 2] }} />
      )}
    </Chapter>
  );
}

// ---------------------------------------------------------------- 7 Budget
export function BudgetSection({ data }: Props) {
  const S = useS(data);
  const t = useTokens();
  const rev = data.bundles.revenue_mix;
  const spend = data.bundles.spending_mix;
  const fy27 = data.bundles.budget_fy27;
  const prov = S.fy_overall_balance?.provisional_latest as boolean | undefined;
  const bars = (b: Bundle) => b.items.map((i) => ({ label: i.label, value: i.value, color: t.s1, extra: pct(i.share as number, 0) + " of total", details: i.contains ? [`Includes: ${i.contains.join(", ")}`] : undefined }));
  const fyNote = <>Years before 2020-21 use the older layout of the Finance Ministry's table. Percent-of-GDP figures use PBS's current-price GDP for all years.</>;
  return (
    <Chapter id="budget" verdict={budgetVerdict(data)}>
      {S.fy_revenue_pct_gdp && S.fy_expenditure_pct_gdp && (
        <LineCard anchor="chart-budget" title="Government income and spending" subtitle={`Federal and provincial combined, % of GDP. ${prov ? "Latest year is provisional" : ""}`}
          takeaway={<>Actual outturns, not budget plans, from the Finance Ministry's fiscal operations tables.</>} note={fyNote}
          lines={[{ s: S.fy_revenue_pct_gdp, name: "Revenue", color: t.s1 }, { s: S.fy_expenditure_pct_gdp, name: "Spending", color: t.s2 }]} yFormat={rate()} events={false} />
      )}
      {S.fy_balance_pct_gdp && (
        <ColumnCard anchor="chart-balance" title="Budget balance" subtitle={`% of GDP, financial years. Below zero is a deficit${prov ? ". Latest year is provisional" : ""}`} takeaway={<>Governments spent {last(S.fy_balance_pct_gdp)[1] < 0 ? "more than they collected" : "less than they collected"} in the latest year shown.</>} s={S.fy_balance_pct_gdp} name="Balance" yFormat={rate()} />
      )}
      {S.fy_markup_pct_gdp && S.fy_defence_pct_gdp && (
        <LineCard anchor="chart-interest-defence" title="Interest and defence" subtitle="% of GDP, financial years"
          takeaway={<>Two of the largest lines in the budget, shown as any other.</>}
          lines={[{ s: S.fy_markup_pct_gdp, name: "Interest (mark-up) payments", color: t.s1 }, { s: S.fy_defence_pct_gdp, name: "Defence", color: t.s2 }]} yFormat={rate()} events={false} />
      )}
      {rev && (
        <BarCard anchor="chart-revenue-mix" title={rev.title} subtitle={`Total ${rsBn(rev.total as number, 1)}`} takeaway={<>The biggest single source was {rev.items[0].label.toLowerCase()}, at {pct(rev.items[0].share as number, 0)} of the total.</>} items={bars(rev)} valueFormat={(v) => rsBn(v, 0)} sources={[rev.source]} asOf={rev.period}
          table={{ head: ["Source", "Rs", "Share"], rows: rev.items.map((i) => [i.label, rsBn(i.value, 1), pct(i.share as number, 1)]), num: [1, 2] }}
          note={<>A large share of tax collected federally is passed to provinces, which is not shown here. Provinces' own revenue is included. Tax figures miss the informal economy.</>} />
      )}
      {spend && (
        <BarCard anchor="chart-spending-mix" title={spend.title} subtitle={`Total ${rsBn(spend.total as number, 1)}`} takeaway={<>The biggest single line was {spend.items[0].label.toLowerCase()}, at {pct(spend.items[0].share as number, 0)} of the total.</>} items={bars(spend)} valueFormat={(v) => rsBn(v, 0)} sources={[spend.source]} asOf={spend.period}
          table={{ head: ["Item", "Rs", "Share"], rows: spend.items.map((i) => [i.label, rsBn(i.value, 1), pct(i.share as number, 1)]), num: [1, 2] }} />
      )}
      {fy27 && (
        <BarCard anchor="chart-budget-27" title={fy27.title} subtitle={`Federal government only. Total ${rsBn(fy27.total as number, 1)}`}
          takeaway={<strong>Budget estimates for the year to June 2027. Not actual spending.</strong>}
          items={fy27.items.map((i) => ({ label: i.label, value: i.value, color: t.s2, extra: `${pct(i.share as number, 0)} of total` }))} valueFormat={(v) => rsBn(v, 0)} sources={[fy27.source]} asOf={`estimates for ${fy27.period}`}
          note={<>The Finance Ministry's budget figures are for the federal government only, so they cannot be added to the combined federal and provincial actuals above.</>}
          table={{ head: ["Item", "Budget estimate", "Share"], rows: fy27.items.map((i) => [i.label, rsBn(i.value, 1), pct(i.share as number, 1)]), num: [1, 2] }} />
      )}
    </Chapter>
  );
}

// ---------------------------------------------------------------- 8 Debt and the IMF
export function DebtSection({ data, tiles }: Props) {
  const S = useS(data);
  const t = useTokens();
  const imf = data.bundles.imf_programme;
  const debtPct = data.bundles.misc?.items.find((i) => i.key === "gross_public_debt_gdp_fy26");
  return (
    <Chapter id="debt" verdict={debtVerdict(data)} tiles={pick(tiles, "public_debt")}>
      {S.gross_public_debt && S.debt_central_total && (
        <LineCard anchor="chart-debt" title="Central government debt" subtitle="Rs billion, end of month. A narrower measure than gross public debt"
          takeaway={<>Gross public debt (Rs {fmt(last(S.gross_public_debt)[1] / 1000, 1)} trillion in {periodLabel(last(S.gross_public_debt)[0])}) adds IMF debt and is reported quarterly. Central government debt is shown here because its monthly history is long.</>}
          note={debtPct ? <>On SBP's figures, gross public debt was {pct(debtPct.value)} of GDP in June 2026 and {pct(debtPct.prev as number)} a year earlier.</> : undefined}
          lines={[{ s: S.debt_central_domestic, name: "Domestic", color: t.s1 }, { s: S.debt_central_external, name: "External", color: t.s2 }]} yFormat={(v) => rsBn(v, 0)} />
      )}
      {S.external_debt_total && S.imf_debt && (
        <LineCard anchor="chart-external-debt" title="What Pakistan owes abroad" subtitle="US$, quarterly. Total external debt and liabilities, all sectors"
          takeaway={<>Includes government, public enterprises, banks and private companies. Debt owed to the IMF is one part of it.</>}
          lines={[{ s: S.external_debt_total, name: "Total external debt and liabilities", color: t.s1 }, { s: S.imf_debt, name: "Owed to the IMF", color: t.s2 }]} yFormat={millions} />
      )}
      {imf && (
        <FactCard title="The IMF programme" source={imf.source}>
          <div className="mini-row">
            {imf.items.map((i) => <Mini key={i.key} label={i.label} value={String(i.value)} note={i.note as string} />)}
          </div>
          <p>{imf.notes}</p>
        </FactCard>
      )}
    </Chapter>
  );
}

// ---------------------------------------------------------------- 9 Business
export function BusinessSection({ data, tiles }: Props) {
  const S = useS(data);
  const t = useTokens();
  return (
    <Chapter id="business" verdict={businessVerdict(data)} tiles={pick(tiles, "confidence")}>
      {S.lsm_yoy && (
        <LineCard anchor="chart-lsm" title="Large-scale manufacturing" subtitle="Change in output on the same month a year earlier"
          takeaway={<>Covers big factories only (cement, textiles, cars and so on). Small workshops and the informal economy are not included.</>}
          lines={[{ s: S.lsm_yoy, name: "Output", color: t.s1 }]} yFormat={rate()} zeroLine
          glossary={{ title: "Terms", terms: [{ term: "Large-scale manufacturing", text: "PBS's monthly index of output from big factories, base 2015-16." }] }} />
      )}
      {S.cci && S.inflation_expect && (
        <LineCard anchor="chart-confidence" title="How consumers feel" subtitle="Survey by the State Bank and IBA"
          takeaway={<>Above 50 means more optimistic than pessimistic. The inflation line shows how many people expect prices to rise.</>}
          lines={[{ s: S.cci, name: "Confidence", color: t.s1 }, { s: S.inflation_expect, name: "Inflation expectations", color: t.s2 }]} yFormat={(v) => fmt(v, 0)} />
      )}
      <FactCard title="What is not here" source={{ name: "See the Sources section at the foot of this page", dataset: "", url: "#sources" }}>
        <p>The stock market index is left out because the exchange's terms don't allow automated collection. Business registration data is left out because the regulator's site can't be reached. Pakistan has no official monthly measure of pay, or of new businesses.</p>
      </FactCard>
    </Chapter>
  );
}

// Keep lint happy for these helpers used by callers above.
export { since, yearAgo };
