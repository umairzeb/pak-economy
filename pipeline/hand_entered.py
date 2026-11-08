"""Figures entered by hand. Only used where a number exists solely in an official document.

Each entry records the document and table, and `next_due`. The health check
fails once `next_due` has passed, so a hand-entered figure cannot quietly go out of date.
"""
from __future__ import annotations

LFS_DOC = {"name": "Pakistan Bureau of Statistics", "dataset": "Labour Force Survey 2024-25, Annual Report (Executive Summary)",
           "url": "https://www.pbs.gov.pk/labour-force-statistics/"}

BUDGET_DOC = {"name": "Ministry of Finance", "dataset": "Budget in Brief 2026-27, Tables 1 and 3",
              "url": "https://www.finance.gov.pk/fb_2026_27.html"}

# LFS 2024-25 report, Executive Summary, pages VII-VIII of the document
# (printed page numbers; file pages 8-9). Rates use the 13th ICLS definition
# because that is what the report compares across years.
LFS = {
    "survey": "2024-25",
    "previous_survey": "2020-21",
    "next_due": "2028-06-30",  # PBS has not announced a date; surveys were 2020-21 and 2024-25.
    "unemployment_rate": 6.9, "unemployment_rate_prev": 6.3,
    "unemployment_19th_icls": 7.1,
    "by_group": [
        {"label": "All", "now": 6.9, "prev": 6.3},
        {"label": "Men", "now": 5.9, "prev": 5.5},
        {"label": "Women", "now": 9.7, "prev": 8.9},
        {"label": "Urban", "now": 8.0, "prev": 7.3},
        {"label": "Rural", "now": 6.3, "prev": 5.8},
    ],
    "participation": 47.7, "participation_prev": 44.9,
    "participation_men": 69.8, "participation_women": 24.4,
    "labour_force_m": 85.6, "labour_force_m_prev": 71.8,
    "employed_m": 79.7, "employed_m_prev": 67.3,
    "unemployed_m": 5.9, "unemployed_m_prev": 4.5,
    # Average monthly wage of paid employees, same report.
    "avg_monthly_wage": 39042, "avg_monthly_wage_prev": 24028,
    "source": LFS_DOC,
}

# Budget in Brief 2026-27 (June 2026), Table 1 "Budget 2026-27 at a Glance" and
# Table 3 "BE & RE FY2025-26 and BE FY2026-27". Rs billion. These are ESTIMATES.
BUDGET = {
    "year": "2026-27",
    "next_due": "2027-06-30",  # the next budget is presented each June.
    "gross_revenue_fbr": 15264, "non_tax": 5336, "provincial_share": -8848, "net_federal_revenue": 11751,
    "expenditure": {
        "Interest payments": 8054, "Defence affairs and services": 3000, "Grants and transfers": 2680,
        "Pensions": 1169, "Running of civil government": 1071, "Subsidies": 1091,
        "Emergency and other provisions": 430, "Federal development and net lending": 1276,
    },
    "expenditure_total": 18771,
    "overall_deficit": -5226, "overall_deficit_pct": -3.6, "primary_surplus": 2828, "primary_surplus_pct": 2.0, "nominal_gdp": 143604,
    # FY2025-26 for comparison: budget and revised estimates in the same table.
    "fy26_budget_expenditure": 17573, "fy26_revised_expenditure": 15642,
    "source": BUDGET_DOC,
}

# IMF programme facts, from the IMF's own Country Report 26/101 as republished by the
# Finance Ministry (https://www.finance.gov.pk/mefp/imf_country_report_may2026.pdf).
# Board press release of 8 May 2026 (page 2). The EFF approval date and size are in
# IMF Country Report 24/310 (finance.gov.pk/mefp/extended_Fund_Facility_October_2024.pdf).
IMF_PROGRAMME = {
    "next_due": "2027-05-31",  # reviews happen roughly every six months.
    "items": [
        {"key": "eff", "label": "Extended Fund Facility, approved 25 Sep 2024", "value": "about US$7bn", "note": "37 months, SDR 5,320 million (IMF)"},
        {"key": "paid", "label": "Paid out so far, EFF and RSF", "value": "about US$4.8bn", "note": "After the third EFF review, 8 May 2026"},
        {"key": "latest", "label": "Latest Board review", "value": "Third EFF, 8 May 2026", "note": "Allowed about US$1.1bn (EFF) and US$220m (RSF)"},
    ],
    "notes": "The IMF programme is a loan with conditions. SBP's October 2026 statement says a further staff-level agreement has been reached, which still needs IMF Board approval. Amounts are rounded by the IMF.",
    "source": {"name": "IMF, published by the Finance Ministry", "dataset": "Country Report 26/101 (May 2026), press release", "url": "https://www.finance.gov.pk/imf.html"},
}

# The SBP inflation target is stated in each Monetary Policy Statement. Copied from the latest.
INFLATION_TARGET = (5.0, 7.0)
TARGET_SOURCE = "State Bank of Pakistan Monetary Policy Statement, 26 Oct 2026"

# Dated Monetary Policy Committee decision days. Listed by hand from the SBP
# calendar for FY27 (https://www.sbp.org.pk/our-operations/monetary-policy).
# The health check fails when these run out.
MPC_DATES = ["2026-07-27", "2026-09-14", "2026-10-26", "2026-12-14", "2027-01-25", "2027-03-08", "2027-04-26", "2027-06-17"]
