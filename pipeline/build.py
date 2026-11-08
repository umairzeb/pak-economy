"""Fetch every source and write public/data. Run with:  python -m pipeline.build

One failing source never stops the run. Its last good file is kept, and the
failure is recorded in the manifest so the page can say so. Data that looks
wrong is refused the same way. The exit code is non-zero only when a problem
needs a person (see end of main).
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import traceback
from datetime import datetime, timezone

from . import hand_entered as hand
from .sources import mof, pbs, sbp, worldbank
from .transforms import difference, rescale, rolling_sum, splice, value_at_or_before, yoy
from .util import DATA_DIR, fiscal_end, now_iso, write_json

STALE_DAYS = 21

# Plausible range for each headline's latest value. Catches unit mistakes and format changes.
SANITY = {
    "cpi_yoy": (-5, 60), "cpi_food_yoy": (-10, 80), "policy_rate": (3, 30), "usd_pkr": (100, 600),
    "reserves_sbp": (1000, 60000), "reserves_total": (2000, 80000), "remittances_m": (500, 8000), "remittances_12m": (10000, 80000),
    "exports_m": (500, 8000), "imports_m": (1000, 16000), "current_account_12m": (-30000, 15000), "fdi_12m": (-1000, 8000),
    "lending_rate_new": (3, 35), "deposit_rate_new": (0.5, 25), "credit_private": (1, 60), "credit_government": (1, 150),
    "gdp_growth": (-10, 12), "lsm_index": (40, 250), "cci": (10, 80),
    "debt_central_total": (10000, 300000), "external_debt_total": (40000, 300000), "imf_debt": (1000, 40000),
}

# A point moving more than this from the one before is refused, on series where that cannot
# happen legitimately. Rates change in whole points; this catches a misread column.
MAX_JUMP = {"usd_pkr": 0.30, "reserves_total": 0.45}

SBP = "State Bank of Pakistan"
PBS = "Pakistan Bureau of Statistics"
MOF = "Ministry of Finance"
WB = "World Bank"


def src(name, dataset, url):
    return {"name": name, "dataset": dataset, "url": url}


def sbp_src(dataset):
    return src(SBP, dataset, sbp.PAGE)


def s(id, title, unit, freq, section, points, source, **extra):
    return {"id": id, "title": title, "unit": unit, "freq": freq, "section": section, "points": points, "source": source} | extra


def rejected(sr: dict, previous: dict | None) -> str | None:
    pts = sr["points"]
    if not pts:
        return "no data"
    lo_hi = SANITY.get(sr["id"])
    if lo_hi and not lo_hi[0] <= pts[-1][1] <= lo_hi[1]:
        return f"latest {pts[-1][1]} outside {lo_hi}"
    jump = MAX_JUMP.get(sr["id"])
    if jump and len(pts) > 1 and pts[-2][1] and abs(pts[-1][1] / pts[-2][1] - 1) > jump:
        return f"latest {pts[-1][1]} jumped more than {jump:.0%} from {pts[-2][1]}"
    if previous and previous.get("points"):
        old = previous["points"]
        if len(pts) < len(old) * 0.9:
            return f"only {len(pts)} points, was {len(old)}"
        if pts[-1][0] < old[-1][0]:
            return f"latest date went back from {old[-1][0]} to {pts[-1][0]}"
    return None


def rejected_bundle(b: dict, previous: dict | None) -> str | None:
    if not b.get("items"):
        return "no items"
    if previous and len(b["items"]) < len(previous.get("items", [])) * 0.5:
        return f"only {len(b['items'])} items, was {len(previous['items'])}"
    return None


# ----------------------------- series builders ------------------------------


def prices() -> list[dict]:
    feed = pbs.cpi_feed()
    hist = pbs.historical()
    review = pbs.monthly_review()
    price = src(PBS, "Price statistics, CPI (base 2015-16)", pbs.PRICE_PAGE)
    # Headline: published PBS YoY history (2017 on) spliced with the unrounded index
    # from the data feed; a year's change needs 13 months of the feed (from Jul 2023).
    feed_yoy = yoy(feed["PCPI_IX"], 1)
    yoy_national = splice(hist["national_yoy"], feed_yoy)
    index = splice(hist["national_index"], rescale(feed["PCPI_IX"], 1, 2))
    urban = splice(hist["urban_yoy"], review["yoy"]["urban"])
    rural = splice(hist["rural_yoy"], review["yoy"]["rural"])
    wpi = splice(hist["wpi_yoy"], review["yoy"]["wpi"])
    out = [
        s("cpi_yoy", "CPI inflation, national", "%", "M", "cost", yoy_national, price,
          notes="CPI National (General), 2015-16 base. From PBS's published history until the data feed has 13 months, then worked out from the feed's index.",
          target_band=list(hand.INFLATION_TARGET), target_source=hand.TARGET_SOURCE),
        s("cpi_index", "CPI index, national (2015-16 = 100)", "index", "M", "cost", index, price,
          notes="Published from July 2017 on the 2015-16 base. Earlier CPI on the older base is not joined on."),
        s("cpi_urban_yoy", "CPI inflation, urban", "%", "M", "cost", urban, price),
        s("cpi_rural_yoy", "CPI inflation, rural", "%", "M", "cost", rural, price),
        s("wpi_yoy", "Wholesale prices (WPI)", "%", "M", "cost", wpi, price),
        s("spi_yoy", "Weekly SPI, year-on-year, monthly reading", "%", "M", "cost", review["yoy"]["spi"], price,
          notes="SPI for the lowest income group (Q1), as published in the Monthly Review."),
    ]
    for code, name in [("01", "food"), ("04", "housing"), ("07", "transport")]:
        out.append(s(f"cpi_{name}_yoy", f"CPI {name}", "%", "M", "cost", yoy(feed[f"PCPI_CP_{code}_IX"], 1), price))
    for key in ("nfne_urban", "trimmed_urban", "nfne_rural"):
        out.append(s(f"core_{key}", f"Core inflation ({key})", "%", "M", "cost", review["core"][key], price, hidden=True))
    return out


def world_history() -> list[dict]:
    cpi = worldbank.indicator("FP.CPI.TOTL.ZG")
    return [s("cpi_annual_wb", "CPI inflation, annual (World Bank)", "%", "A", "cost", cpi,
              src(WB, "World Development Indicators FP.CPI.TOTL.ZG", "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=PK"),
              notes="International series, calendar-year averages, for the long view only. Pakistan's own CPI on one consistent base starts 2017.")]


def rates() -> list[dict]:
    r = sbp.policy_rate()
    lr = sbp.lending_rates()
    src_policy = sbp_src("SBP's Reverse Repo, Repo and Policy Rates (history table)") | {"url": sbp.POLICY_PAGE}
    src_lend = sbp_src("Weighted Average Lending and Deposit Rates (scheduled banks)")
    return [
        s("policy_rate", "SBP policy rate", "%", "event", "rates", r["policy"], src_policy, step=True,
          breaks=[{"date": "2015-05-25", "label": "Policy rate introduced"}],
          notes="Each point is the date a change took effect. Before 25 May 2015 the reverse repo (ceiling) rate was SBP's policy rate. Before Aug 2009 that was the 3-day repo rate."),
        s("policy_ceiling", "SBP ceiling rate", "%", "event", "rates", r["ceiling"], src_policy, step=True, hidden=True),
        s("policy_floor", "SBP floor rate", "%", "event", "rates", r["floor"], src_policy, step=True, hidden=True),
        s("lending_rate_new", "Average rate on new bank loans", "%", "M", "rates", lr["new_loans"], src_lend,
          notes="Scheduled banks, new loans, excluding zero-markup loans and interbank lending."),
        s("deposit_rate_new", "Average rate on new deposits", "%", "M", "rates", lr["new_deposits"], src_lend,
          notes="Scheduled banks, new deposits, excluding zero-markup deposits and interbank deposits."),
    ]


def rupee_and_reserves() -> list[dict]:
    res = sbp.reserves_weekly()
    sr = sbp_src("Liquid Foreign Exchange Reserves (weekly)")
    usd = sbp.usd_pkr()
    return [
        s("usd_pkr", "Rupees per US dollar (interbank, monthly average)", "Rs", "M", "rupee", usd,
          sbp_src("Bank Floating Average Exchange Rates"),
          notes="Monthly average of the interbank rate, from Jan 1957."),
        s("reserves_sbp", "SBP's liquid reserves (net)", "US$ million", "W", "rupee", res["sbp"], sr,
          notes="Net liquid foreign exchange held by SBP. Includes deposits lent by friendly countries, which SBP does not separate in this table."),
        s("reserves_banks", "Commercial banks' liquid reserves (net)", "US$ million", "W", "rupee", res["banks"], sr),
        s("reserves_total", "Total liquid reserves", "US$ million", "W", "rupee", res["total"], sr),
    ]


def abroad() -> tuple[list[dict], list]:
    b = sbp.bop()
    rem, countries = sbp.remittances()
    sb = sbp_src("Summary Balance of Payments (BPM6), monthly")
    sr = sbp_src("Country-wise Workers' Remittances")
    def m(k):
        return b[k]
    out = [
        s("remittances_m", "Workers' remittances, monthly", "US$ million", "M", "abroad", rem, sr),
        s("remittances_12m", "Workers' remittances, 12-month total", "US$ million", "M", "abroad", rolling_sum(rem), sr),
        s("exports_m", "Goods exports, monthly", "US$ million", "M", "abroad", m("exports"), sb),
        s("imports_m", "Goods imports, monthly", "US$ million", "M", "abroad", m("imports"), sb),
        s("exports_12m", "Goods exports, 12-month total", "US$ million", "M", "abroad", rolling_sum(m("exports")), sb),
        s("imports_12m", "Goods imports, 12-month total", "US$ million", "M", "abroad", rolling_sum(m("imports")), sb),
        s("current_account_m", "Current account, monthly", "US$ million", "M", "abroad", m("current_account"), sb),
        s("current_account_12m", "Current account, 12-month total", "US$ million", "M", "abroad", rolling_sum(m("current_account")), sb),
        s("fdi_12m", "Foreign direct investment into Pakistan, 12-month total", "US$ million", "M", "abroad", rolling_sum(m("fdi_in")), sb),
        s("services_exports_12m", "Services exports, 12-month total", "US$ million", "M", "abroad", rolling_sum(m("exports_services")), sb),
    ]
    return out, countries


def growth() -> list[dict]:
    na = src(PBS, "National Accounts Annual Tables", pbs.NA_PAGE)
    return [
        s("gdp_growth", "Real GDP growth", "%", "A", "growth", pbs.gdp_growth(), na,
          notes="Total of GVA at basic prices, 2015-16 base. Stored at the 30 June end of each financial year. PBS revises recent years."),
        s("gdp_quarterly", "Quarterly real growth, total GVA", "%", "Q", "growth", sbp.quarterly_gdp(),
          sbp_src("Quarterly GDP of Pakistan (PBS figures)"), notes="Q1 is Jul-Sep. Change on the same quarter a year earlier."),
    ]


FISCAL_YEARS_FROM = "2013-14"


def budget() -> tuple[list[dict], dict, dict]:
    links = mof.fiscal_links()
    years = sorted(y for y in links if y >= FISCAL_YEARS_FROM)
    hist = mof.fiscal_history(years)
    gdp = dict(pbs.gdp_current())
    fsrc = src(MOF, "Summary of Consolidated Federal and Provincial Fiscal Operations (actuals)", mof.FISCAL_PAGE)
    latest = years[-1]
    series: dict[str, list[list]] = {k: [] for k in ("total_revenue", "tax_revenue", "total_expenditure", "markup", "defence", "development", "overall_balance", "primary_balance", "balance_pct_gdp", "revenue_pct_gdp", "expenditure_pct_gdp", "markup_pct_gdp", "defence_pct_gdp", "tax_pct_gdp", "primary_pct_gdp")}
    for fy in years:
        f = hist[fy]
        end = fiscal_end(fy)
        g = gdp.get(end)
        def add(key, val):
            if val is not None:
                series[key].append([end, round(val, 1)])
        add("total_revenue", f.get("total_revenue"))
        add("tax_revenue", f.get("tax_revenue"))
        add("total_expenditure", f.get("total_expenditure"))
        add("markup", f.get("markup"))
        add("defence", f.get("defence"))
        add("development", f.get("development"))
        add("overall_balance", f.get("overall_balance"))
        add("primary_balance", f.get("primary_balance"))
        if g:
            def add_pct(key, val):
                if val is not None:
                    series[key].append([end, round(val / g * 100, 1)])
            add_pct("balance_pct_gdp", f.get("overall_balance"))
            add_pct("revenue_pct_gdp", f.get("total_revenue"))
            add_pct("expenditure_pct_gdp", f.get("total_expenditure"))
            add_pct("tax_pct_gdp", f.get("tax_revenue"))
            add_pct("markup_pct_gdp", f.get("markup"))
            add_pct("defence_pct_gdp", f.get("defence"))
            add_pct("primary_pct_gdp", f.get("primary_balance"))
    latest_prov = hist[latest]["provisional"]
    prov_note = f" FY{latest} is provisional."if latest_prov else ""
    common = {"notes": f"Actual outturns from the Finance Ministry, federal plus provinces. Rs billion unless stated.{prov_note}", "provisional_latest": latest_prov}
    def fs(id, title, unit, section="budget", **extra):
        return s(id, title, unit, "FY", section, series[id.replace("fy_", "")], fsrc, **common, **extra)
    pct_notes = "Percent of GDP worked out from Finance Ministry rupee figures and PBS's current-price GDP, so all years use one GDP series. The Ministry's own table uses GDP as it stood at the time."
    out = [
        fs("fy_total_revenue", "Total revenue", "Rs billion"),
        fs("fy_tax_revenue", "Tax revenue", "Rs billion"),
        fs("fy_total_expenditure", "Total spending", "Rs billion"),
        fs("fy_markup", "Interest (mark-up) payments", "Rs billion"),
        fs("fy_defence", "Defence", "Rs billion"),
        fs("fy_development", "Development and net lending", "Rs billion"),
        fs("fy_overall_balance", "Overall budget balance", "Rs billion"),
        s("fy_balance_pct_gdp", "Budget balance, % of GDP", "% of GDP", "FY", "budget", series["balance_pct_gdp"], fsrc | {"dataset": fsrc["dataset"] + " and PBS GDP"}, notes=pct_notes),
        s("fy_revenue_pct_gdp", "Revenue, % of GDP", "% of GDP", "FY", "budget", series["revenue_pct_gdp"], fsrc, notes=pct_notes),
        s("fy_expenditure_pct_gdp", "Spending, % of GDP", "% of GDP", "FY", "budget", series["expenditure_pct_gdp"], fsrc, notes=pct_notes),
        s("fy_tax_pct_gdp", "Tax revenue, % of GDP", "% of GDP", "FY", "budget", series["tax_pct_gdp"], fsrc, notes=pct_notes),
        s("fy_markup_pct_gdp", "Interest, % of GDP", "% of GDP", "FY", "budget", series["markup_pct_gdp"], fsrc, notes=pct_notes),
        s("fy_defence_pct_gdp", "Defence, % of GDP", "% of GDP", "FY", "budget", series["defence_pct_gdp"], fsrc, notes=pct_notes),
        s("fy_primary_pct_gdp", "Primary balance, % of GDP", "% of GDP", "FY", "budget", series["primary_pct_gdp"], fsrc, notes=pct_notes),
    ]
    return out, hist, {"latest": latest}


def debt() -> tuple[list[dict], dict]:
    cgd = sbp.central_gov_debt()
    ext = sbp.external_debt()
    summ = sbp.debt_summary()
    c = sbp_src("Central Government Debt")
    d = sbp_src("Pakistan's External Debt and Liabilities")
    sm = sbp_src("Pakistan Debt and Liabilities - Summary")
    out = [
        s("debt_central_total", "Central government debt (domestic + external)", "Rs billion", "M", "debt", cgd["total"], c),
        s("debt_central_domestic", "Central government domestic debt", "Rs billion", "M", "debt", cgd["domestic"], c),
        s("debt_central_external", "Central government external debt", "Rs billion", "M", "debt", cgd["external"], c),
        s("external_debt_total", "Total external debt and liabilities", "US$ million", "Q", "debt", ext["total"], d, notes="Includes government, IMF, public enterprise, bank and private sector debt owed abroad."),
        s("imf_debt", "Debt owed to the IMF", "US$ million", "Q", "debt", ext["imf"], d),
        s("gross_public_debt", "Gross public debt", "Rs billion", "Q", "debt", summ["gross_public"], sm,
          notes="SBP's 'Gross Public Debt' (domestic + external government debt + IMF), last 5 quarter-ends."),
    ]
    return out, summ


def activity() -> list[dict]:
    idx = sbp.lsm_index()
    conf = sbp.confidence()
    cr = sbp.credit()
    return [
        s("lsm_index", "Large-scale manufacturing index (2015-16 = 100)", "index", "M", "business", idx, sbp_src("Production of Selected Large-scale Manufacturing"), hidden=True),
        s("lsm_yoy", "Large-scale manufacturing, year on year", "%", "M", "business", yoy(idx), sbp_src("Quantum Index of Large-scale Manufacturing (PBS)"), notes="Worked out from the index. Base 2015-16."),
        s("cci", "Consumer confidence index", "index", "M", "business", conf["cci"], src(SBP, "Consumer Confidence Survey (SBP and IBA)", sbp.SURVEY_PAGE),
          notes="Above 50 means more optimists than pessimists. The survey is a sample of households, not a count."),
        s("inflation_expect", "Consumers expecting higher prices, index", "index", "M", "business", conf["ie"], src(SBP, "Consumer Confidence Survey (SBP and IBA)", sbp.SURVEY_PAGE)),
        s("credit_private", "Bank credit to the private sector", "Rs trillion", "M", "rates", rescale(cr["private"], 1e-6), sbp_src("Credit/Loans Classified by Borrowers"), notes="Month-end stock of lending and securities held by banks, from 2006."),
        s("credit_government", "Bank and SBP credit to government", "Rs trillion", "M", "rates", rescale(cr["government"], 1e-6), sbp_src("Credit/Loans Classified by Borrowers"), notes="Net of government deposits. Includes bank holdings of government securities."),
        s("credit_private_yoy", "Bank credit to private sector, change on a year earlier", "%", "M", "rates", yoy(cr["private"], 1), sbp_src("Credit/Loans Classified by Borrowers")),
        s("credit_government_yoy", "Credit to government, change on a year earlier", "%", "M", "rates", yoy(cr["government"], 1), sbp_src("Credit/Loans Classified by Borrowers")),
    ]


# ----------------------------- bundles ------------------------------


def bundle(id, title, unit, section, as_of, items, source, **extra):
    return {"id": id, "title": title, "unit": unit, "section": section, "as_of": as_of, "items": items, "source": source} | extra


def cpi_bundles() -> list[dict]:
    feed = pbs.cpi_feed()
    price = src(PBS, "Price statistics, CPI (base 2015-16)", pbs.PRICE_PAGE)
    items = []
    weight_lookup = {}
    last = feed["PCPI_IX"][-1][0]
    for code, label in pbs.COICOP.items():
        idx = feed[f"PCPI_CP_{code}_IX"]
        wt = feed[f"PCPI_CP_{code}_WT"][-1][1]
        change = value_at_or_before(yoy(idx, 1), last)
        items.append({"key": code, "label": label, "value": change, "weight": round(wt, 2)})
    return [bundle("cpi_groups", "Where prices rose, by CPI group", "%", "cost", last, items, price, notes="Year-on-year change in each CPI group. Weights show the share of a typical household budget in the 2015-16 base.")]


def spi_bundle() -> list[dict]:
    spi = pbs.weekly_spi()
    price = src(PBS, "Weekly Sensitive Price Indicator (SPI)", pbs.PRICE_PAGE)
    wages = pbs.daily_wages()
    return [
        bundle("spi_items", "What things cost now and a year ago", "Rs", "cost", spi["week_end"], spi["items"], price,
               notes="Average prices from PBS's weekly survey in 17 cities. Quantities shown as PBS records them."),
        bundle("daily_wages", "Daily wage rates, construction trades", "Rs per day", "jobs", spi["week_end"], wages, src(PBS, "Average Monthly SPI Items Prices", pbs.PRICE_PAGE),
               notes="PBS's average across the cities it surveys, latest month only. These are construction trades, not all of Pakistan's workers."),
    ]


def remittance_bundle(countries: list[dict], last_date: str) -> dict:
    items = [{"key": c["label"], "label": c["label"], "value": c["value"], "parts": c["parts"]} for c in countries]
    return bundle("remittances_by_country", "Where remittances come from", "US$ million", "abroad", last_date, items,
                  sbp_src("Country-wise Workers' Remittances"), period="Latest 12 months", notes="Total of the latest 12 months. Gulf and European detail opens from the arrow.")


def trade_bundles(as_of: str) -> list[dict]:
    out = []
    for direction, title in (("exports", "What Pakistan sells abroad"), ("imports", "What Pakistan buys from abroad")):
        groups = sbp.trade_groups(direction)
        total = sum(g["value"] for g in groups)
        items = [{"key": g["label"], "label": g["label"].replace(" Group", "").replace("Agri. & Other Chemical", "Chemicals and fertiliser").replace("Other Manufacture", "Other manufactures"), "value": g["value"],
                  "share": round(g["value"] / total * 100, 1), "change_pct": round((g["value"] / g["prev"] - 1) * 100, 1) if g["prev"] else None, "parts": g["parts"]} for g in groups]
        out.append(bundle(f"{direction}_by_group", title, "US$ billion", "abroad", as_of, items,
                          sbp_src("Export Receipts by Commodities and Groups" if direction == "exports" else "Import Payments by Commodities and Groups"),
                          period="Latest 12 months", total=round(total, 2), notes="Banks' records of payments, latest 12 months. Change compares with the 12 months before."))
    return out


def gdp_bundle() -> dict:
    d = pbs.sector_growth_latest()
    items = [{"key": x["label"], "label": x["label"], "value": x["value"], "share": x["share"], "parts": x["parts"]} for x in d["items"]]
    return bundle("gdp_by_sector", "Growth by sector", "%", "growth", d["fy"], items, src(PBS, "National Accounts Annual Tables", pbs.NA_PAGE),
                  notes="Real growth in the latest financial year, and each sector's share of the economy at 2015-16 prices. PBS revises recent years.")


def fiscal_bundles(latest: str, prov: bool) -> list[dict]:
    mix = mof.fiscal_mix(latest)
    fsrc = src(MOF, "Summary of Consolidated Federal and Provincial Fiscal Operations (Tables 2 and 3)", mof.FISCAL_PAGE)
    def items(d, tot):
        return sorted([{"key": k, "label": k, "value": v, "share": round(v / tot * 100, 1)} for k, v in d.items()], key=lambda x: -x["value"])
    label = f"FY{latest}{' (provisional)' if prov else ''}"
    other_contains = ["Dividends", "Royalties on oil and gas", "Provincial non-tax receipts", "Other federal receipts"]
    rev_items = items(mix["revenue"], mix["total_revenue"])
    for x in rev_items:
        if x["label"].startswith("Other"):
            x["contains"] = other_contains
    budget = hand.BUDGET
    bdoc = budget["source"]
    bud_items = sorted([{"key": k, "label": k, "value": v, "share": round(v / budget["expenditure_total"] * 100, 1)} for k, v in budget["expenditure"].items()], key=lambda x: -x["value"])
    return [
        bundle("revenue_mix", f"Where the money comes from, {label}", "Rs billion", "budget", fiscal_end(latest), rev_items, fsrc, period=label, total=mix["total_revenue"], notes="Federal and provincial combined, actual outturn."),
        bundle("spending_mix", f"Where the money goes, {label}", "Rs billion", "budget", fiscal_end(latest), items(mix["spend"], mix["total_spend"]), fsrc, period=label, total=mix["total_spend"], notes="Federal and provincial combined, actual outturn, before statistical discrepancy."),
        bundle("budget_fy27", f"Federal Budget {budget['year']}: estimates", "Rs billion", "budget", "2027-06-30", bud_items, bdoc, period=f"FY{budget['year']}", total=budget["expenditure_total"], kind="estimate",
               notes="These are budget estimates for the current financial year, not actual spending. Federal government only, so not comparable with the combined federal and provincial figures above."),
    ]


def jobs_bundles() -> list[dict]:
    l = hand.LFS
    return [bundle("unemployment_by_group", "Unemployment by group", "%", "jobs", "2025-06-30",
                   [{"key": g["label"], "label": g["label"], "value": g["now"], "change": round(g["now"] - g["prev"], 1), "prev": g["prev"]} for g in l["by_group"]],
                   l["source"], period=l["survey"], notes=f"Labour Force Survey {l['survey']}, compared with {l['previous_survey']}. The survey counts people aged 10 and over. Most work is informal and many people earn a little without counting as unemployed."),
            bundle("labour_summary", "Labour force in numbers", "million", "jobs", "2025-06-30",
                   [{"key": k, "label": label, "value": l[k], "prev": l[f"{k}_prev"]} for k, label in [("labour_force_m", "Labour force"), ("employed_m", "Employed"), ("unemployed_m", "Unemployed")]],
                   l["source"], period=l["survey"], extra={"participation": l["participation"], "avg_monthly_wage": l["avg_monthly_wage"], "avg_monthly_wage_prev": l["avg_monthly_wage_prev"]})]


def pakistan_summary_bundle(budget_hist: dict, summ: dict) -> dict:
    """Numbers the page's cards need that are not time series."""
    items = [{"key": "gross_public_debt_gdp_fy26", "label": "Gross public debt, % of GDP (Jun 2026)", "value": summ["pct_gdp_gross_public"][-1], "prev": summ["pct_gdp_gross_public"][0]}]
    return bundle("misc", "Headline extras", "", "misc", "2026-06-30", items, sbp_src("Pakistan Debt and Liabilities - Summary"))


def open_market_bundle() -> dict:
    om = sbp.open_market_usd()
    return bundle("open_market_rate", "Open-market US dollar rate", "Rs", "rupee", om["date"],
                  [{"key": "buy", "label": "Buying", "value": om["buy"]}, {"key": "sell", "label": "Selling", "value": om["sell"]}],
                  sbp_src("Open Market Closing Exchange Rates"))


# The Finance Ministry's website refuses GitHub's servers (HTTP 403, first seen 8 Nov 2026), though it
# opens normally from an ordinary connection. We respect that and don't try to get past it. Its figures
# are full-year actuals published once a year, so they wait for a refresh from an ordinary connection,
# and tests.health_check (fy_overall_balance) says when a new year is overdue. Any other source being
# refused still counts as a failure.
KNOWN_CLOUD_BLOCKS = {"budget": MOF}


def refused_cloud(e: Exception, env=os.environ) -> bool:
    """True when this is a run on GitHub's servers and the website refused it outright."""
    response = getattr(e, "response", None)
    return env.get("GITHUB_ACTIONS") == "true" and response is not None and response.status_code == 403


def sort_kept_files(files: dict[str, dict], blocked_publishers: set[str], now: datetime) -> tuple[list, list, list]:
    """Files not rewritten this run: (stale, too_stale, waiting on a known block)."""
    stale, too_stale, waiting = [], [], []
    for rel, data in files.items():
        if (data.get("source") or {}).get("name") in blocked_publishers:
            waiting.append(rel)
            continue
        updated = data.get("updated")
        age = (now - datetime.fromisoformat(updated)).days if updated else None
        stale.append({"file": rel, "updated": updated, "age_days": age})
        if age is None or age > STALE_DAYS:
            too_stale.append(rel)
    return stale, too_stale, waiting


def main() -> int:
    t0 = time.time()
    built: dict[str, dict] = {}
    manifest = {"generated": now_iso(), "series": [], "bundles": [], "errors": [], "blocked": []}

    def record_error(what: str, e: Exception):
        if what in KNOWN_CLOUD_BLOCKS and refused_cloud(e):
            manifest["blocked"].append({"id": what, "publisher": KNOWN_CLOUD_BLOCKS[what]})
            print(f"  BLOCKED {what}: {KNOWN_CLOUD_BLOCKS[what]} refused this server; keeping its last good files")
            return
        manifest["errors"].append({"id": what, "error": f"{type(e).__name__}: {e}"})
        print(f"  FAIL {what}: {type(e).__name__}: {e}", file=sys.stderr)
        if "-v" in sys.argv:
            traceback.print_exc()

    def keep(s_: dict):
        if not s_.get("points"):
            raise ValueError(f"{s_['id']}: no data points")
        built[s_["id"]] = s_

    bundle_list: list[dict] = []
    def add_bundles(res):
        nonlocal bundle_list
        bundle_list += res if isinstance(res, list) else [res]

    def run(name, f, on_ok=None):
        try:
            r = f()
            if on_ok:
                on_ok(r)
            return r
        except Exception as e:  # noqa: BLE001
            record_error(name, e)
            return None

    print("Prices"); run("prices", prices, lambda r: [keep(x) for x in r])
    run("world_history", world_history, lambda r: [keep(x) for x in r])
    run("cpi_groups", cpi_bundles, add_bundles)
    run("spi", spi_bundle, add_bundles)
    print("Rates and rupee"); run("rates", rates, lambda r: [keep(x) for x in r])
    run("rupee", rupee_and_reserves, lambda r: [keep(x) for x in r])
    run("open_market", open_market_bundle, add_bundles)
    print("Abroad")
    def do_abroad():
        series, countries = abroad()
        [keep(x) for x in series]
        last_date = built["remittances_m"]["points"][-1][0]
        add_bundles(remittance_bundle(countries, last_date))
        add_bundles(trade_bundles(built["exports_m"]["points"][-1][0]))
    run("abroad", do_abroad)
    print("Growth"); run("growth", growth, lambda r: [keep(x) for x in r])
    run("gdp_by_sector", gdp_bundle, add_bundles)
    print("Budget")
    budget_hist = None
    def do_budget():
        nonlocal budget_hist
        series, hist, info = budget()
        budget_hist = hist
        [keep(x) for x in series]
        add_bundles(fiscal_bundles(info["latest"], hist[info["latest"]]["provisional"]))
    run("budget", do_budget)
    print("Debt")
    def do_debt():
        series, summ = debt()
        [keep(x) for x in series]
        add_bundles(pakistan_summary_bundle(budget_hist or {}, summ))
    run("debt", do_debt)
    print("Activity"); run("activity", activity, lambda r: [keep(x) for x in r])
    run("jobs", jobs_bundles, add_bundles)
    add_bundles(bundle("imf_programme", "The IMF programme", "", "debt", "2026-05-08", hand.IMF_PROGRAMME["items"], hand.IMF_PROGRAMME["source"], notes=hand.IMF_PROGRAMME["notes"]))

    # Hand-entered figures
    manifest["hand_entered"] = {"lfs": {"survey": hand.LFS["survey"], "next_due": hand.LFS["next_due"]},
                                "budget": {"year": hand.BUDGET["year"], "next_due": hand.BUDGET["next_due"]},
                                "imf_programme": {"next_due": hand.IMF_PROGRAMME["next_due"]}}

    warnings = []
    rejected_ids: set[str] = set()
    for sid, sr in built.items():
        path = DATA_DIR / "series" / f"{sid}.json"
        previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        reason = rejected(sr, previous)
        if reason:
            warnings.append(f"{sid}: {reason}; kept the previous data")
            rejected_ids.add(f"series/{sid}.json")
            continue
        pts = sr["points"]
        d, v = pts[-1]
        ya = value_at_or_before(pts, f"{int(d[:4]) - 1}{d[4:]}")
        write_json(path, sr | {"updated": manifest["generated"]})
        manifest["series"].append({k: sr.get(k) for k in ("id", "title", "section", "unit", "freq", "hidden")} | {"source": sr["source"]["name"], "latest": {"date": d, "value": v}, "year_ago": ya, "first": pts[0][0], "count": len(pts)})

    for b in bundle_list:
        path = DATA_DIR / "bundles" / f"{b['id']}.json"
        reason = rejected_bundle(b, json.loads(path.read_text(encoding="utf-8")) if path.exists() else None)
        if reason:
            warnings.append(f"{b['id']}: {reason}; kept the previous data")
            rejected_ids.add(f"bundles/{b['id']}.json")
            continue
        write_json(path, b | {"updated": manifest["generated"]})
        manifest["bundles"].append({k: b.get(k) for k in ("id", "title", "section", "unit", "as_of", "period")} | {"items": len(b["items"])})

    written = ({f"series/{sid}.json" for sid in built} | {f"bundles/{b['id']}.json" for b in bundle_list}) - rejected_ids
    kept = {f.relative_to(DATA_DIR).as_posix(): json.loads(f.read_text(encoding="utf-8"))
            for f in sorted(DATA_DIR.glob("*/*.json")) if f.relative_to(DATA_DIR).as_posix() not in written}
    stale, too_stale, waiting = sort_kept_files(kept, {b["publisher"] for b in manifest["blocked"]}, datetime.now(timezone.utc))
    for b in manifest["blocked"]:
        b["files"] = len(waiting)

    manifest["warnings"] = warnings
    manifest["stale"] = stale
    write_json(DATA_DIR / "manifest.json", manifest)
    print(f"\n{len(built)} series, {len(bundle_list)} bundles, {len(manifest['errors'])} source errors, {len(stale)} stale files, {len(warnings)} warnings in {time.time() - t0:.0f}s")
    for w in warnings:
        print("  WARN", w)
    if stale:
        print(f"  STALE {len(stale)} files kept from earlier runs")
    if waiting:
        print(f"  WAITING {len(waiting)} files kept because their publisher refuses this server")
    unreplaced = bool(manifest["errors"]) and not stale
    return 1 if warnings or too_stale or unreplaced else 0


if __name__ == "__main__":
    sys.exit(main())
