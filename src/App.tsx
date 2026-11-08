import { useEffect, useMemo, useState } from "react";
import { loadData, type Data } from "./data";
import { buildHeadline, buildSummary, buildTiles } from "./insights";
import { pick } from "./chapter";
import { AbroadSection, BudgetSection, BusinessSection, CostSection, DebtSection, GrowthSection, JobsSection, RatesSection, RupeeSection } from "./sections";
import { StatTile } from "./components/ui";
import { RangeContext, useRangeState } from "./range";
import { TopBar } from "./TopBar";
import { TokensContext, useThemeState, type ThemePref } from "./theme";

const SERIES = [
  "cpi_yoy", "cpi_index", "cpi_urban_yoy", "cpi_rural_yoy", "wpi_yoy", "spi_yoy", "cpi_food_yoy", "cpi_housing_yoy", "cpi_transport_yoy", "cpi_annual_wb",
  "core_nfne_urban", "core_trimmed_urban", "core_nfne_rural",
  "policy_rate", "policy_ceiling", "policy_floor", "lending_rate_new", "deposit_rate_new", "credit_private_yoy", "credit_government_yoy", "credit_private", "credit_government",
  "usd_pkr", "reserves_sbp", "reserves_banks", "reserves_total",
  "remittances_m", "remittances_12m", "exports_12m", "imports_12m", "current_account_12m", "current_account_m", "fdi_12m",
  "gdp_growth", "gdp_quarterly",
  "fy_total_revenue", "fy_total_expenditure", "fy_overall_balance", "fy_balance_pct_gdp", "fy_revenue_pct_gdp", "fy_expenditure_pct_gdp", "fy_tax_pct_gdp", "fy_markup_pct_gdp", "fy_defence_pct_gdp", "fy_markup", "fy_defence",
  "debt_central_total", "debt_central_domestic", "debt_central_external", "external_debt_total", "imf_debt", "gross_public_debt",
  "lsm_yoy", "cci", "inflation_expect",
];
const BUNDLES = [
  "cpi_groups", "spi_items", "daily_wages", "unemployment_by_group", "labour_summary", "remittances_by_country",
  "exports_by_group", "imports_by_group", "gdp_by_sector", "revenue_mix", "spending_mix", "budget_fy27", "imf_programme", "misc", "open_market_rate",
];

const NEXT_THEME: Record<ThemePref, ThemePref> = { auto: "light", light: "dark", dark: "auto" };
const THEME_LABEL: Record<ThemePref, string> = { auto: "Theme: auto", light: "Theme: light", dark: "Theme: dark" };

export default function App() {
  const { pref, setPref, tokens } = useThemeState();
  const { range, setRange, start } = useRangeState();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData(SERIES, BUNDLES).then(setData, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!data || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [data]);

  const tiles = useMemo(() => (data ? buildTiles(data) : []), [data]);
  const updated = data
    ? new Date(data.manifest.generated).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  const missing = data ? [...SERIES.filter((id) => !data.series[id]), ...BUNDLES.filter((id) => !data.bundles[id])] : [];
  const problems = data ? (data.manifest.errors?.length ?? 0) + (data.manifest.stale?.length ?? 0) + (data.manifest.warnings?.length ?? 0) : 0;

  return (
    <TokensContext.Provider value={tokens}>
      <div className="page">
        <header className="site-header">
          <div>
            <h1>Pakistan's economy, in plain English</h1>
            <p className="tagline">How the country makes and spends money, how things are going, and what it means for daily life. Built from State Bank of Pakistan, Pakistan Bureau of Statistics and Finance Ministry data.</p>
          </div>
          <button type="button" className="theme-toggle" onClick={() => setPref(NEXT_THEME[pref])}>{THEME_LABEL[pref]}</button>
        </header>

        {error && <p className="status-msg">Couldn't load the data. Please refresh the page, or try again shortly.</p>}
        {!data && !error && <p className="status-msg">Loading the latest numbers…</p>}

        {data && <TopBar range={range} onRange={setRange} />}

        {data && (
          <main>
            <section id="overview" className="overview" aria-label="Overview">
              <div className="summary">
                <h2>In short</h2>
                <p className="headline">{buildHeadline(data)}</p>
                <details className="full-summary">
                  <summary>Read the full summary</summary>
                  <p>{buildSummary(data).join(" ")}</p>
                </details>
                <div className="meta">Figures last checked against official sources on {updated}. {problems === 0 ? "No problems were recorded on that check." : ""}</div>
                {problems > 0 && (
                  <p className="notice">On the last check, {problems} {problems === 1 ? "item was" : "items were"} not refreshed, so some charts show earlier data.</p>
                )}
                {missing.length > 0 && (
                  <p className="notice">Some charts aren't showing because their data didn't load. Please refresh the page.</p>
                )}
                <p className="meta">Official figures run behind events: the latest figures here are from before today, and some by months. The date on each chart says where its data ends.</p>
              </div>

              <div className="tiles tiles-headline">
                {pick(tiles, "inflation", "policy_rate", "rupee", "reserves").map((tile) => <StatTile key={tile.label} {...tile} />)}
              </div>
            </section>

            <RangeContext.Provider value={{ range, start }}>
              <CostSection data={data} tiles={tiles} />
              <JobsSection data={data} tiles={tiles} />
              <RatesSection data={data} tiles={tiles} />
              <RupeeSection data={data} tiles={tiles} />
              <AbroadSection data={data} tiles={tiles} />
              <GrowthSection data={data} tiles={tiles} />
              <BudgetSection data={data} tiles={tiles} />
              <DebtSection data={data} tiles={tiles} />
              <BusinessSection data={data} tiles={tiles} />
            </RangeContext.Provider>
          </main>
        )}

        <footer className="site-footer" id="sources">
          <p>Sources: State Bank of Pakistan, Pakistan Bureau of Statistics, Ministry of Finance, and (for long-run CPI only) the World Bank, labelled on that chart. Pakistan Bureau of Statistics data are released under an open licence; the State Bank and Finance Ministry publish without stated reuse terms and are credited on each chart.</p>
          <p>A large part of Pakistan's economy is informal, so tax, jobs and business figures miss a lot. The stock market index is not shown because the exchange's terms don't allow automated collection.</p>
          <p>This site describes official statistics. It is not financial advice, and it takes no position on governments, parties, the military or the IMF.</p>
        </footer>
      </div>
    </TokensContext.Provider>
  );
}
