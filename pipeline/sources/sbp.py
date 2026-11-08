"""State Bank of Pakistan. Excel archives (and the one PDF that has no Excel twin).

Index a person can read: https://www.sbp.org.pk/economic-data
Files: https://www.sbp.org.pk/assets/document/<file>
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime
from functools import lru_cache

import pandas as pd
import pdfplumber

from ..util import MONTHS, get_file, get, month_end, to_month_end, to_number, workbook

BASE = "https://www.sbp.org.pk/assets/document/"
PAGE = "https://www.sbp.org.pk/economic-data"
SURVEY_PAGE = "https://www.sbp.org.pk/our-operations/state-bank-surveys"
POLICY_PAGE = "https://www.sbp.org.pk/our-operations/monetary-policy"


@lru_cache(maxsize=None)
def book(name: str) -> pd.ExcelFile:
    return workbook(BASE + name)


def sheet(name: str, sh) -> pd.DataFrame:
    return book(name).parse(sh, header=None)


def _is_date(v) -> bool:
    return isinstance(v, (datetime, date, pd.Timestamp)) and not pd.isna(v)


# --- Policy rate ------------------------------------------------------------

def _rate_date(s: str) -> str:
    d, mon, y = s.split("-")
    y2 = int(y)
    return date(1900 + y2 if y2 > 50 else 2000 + y2, MONTHS[mon.lower()], int(d)).isoformat()


@lru_cache(maxsize=None)
def rate_history() -> list[dict]:
    """Every SBP rate change since 1991, from SBP's own history table (PDF only).

    Rows look like '27-Oct-26 13.00% 11.00% 12.00%'. Column 1 is the reverse
    repo (ceiling) rate, column 2 the repo (floor) rate from Aug 2009, column 3
    the policy (target) rate from 25 May 2015.
    """
    rows = []
    with pdfplumber.open(io.BytesIO(get_file(BASE + "OVR-Repo-History.pdf"))) as pdf:
        for page in pdf.pages:
            for line in (page.extract_text() or "").splitlines():
                m = re.match(r"^(\d{2}-[A-Za-z]{3}-\d{2})\s+(\d+\.\d+)%(?:\s+(\d+\.\d+)%)?(?:\s+(\d+\.\d+)%)?\s*$", line.strip())
                if m:
                    rows.append({"date": _rate_date(m[1]), "ceiling": float(m[2]),
                                 "floor": float(m[3]) if m[3] else None,
                                 "target": float(m[4]) if m[4] else None})
    if len(rows) < 80:
        raise ValueError(f"policy rate table: only {len(rows)} rows, layout changed?")
    rows.sort(key=lambda r: r["date"])
    return rows


def policy_rate() -> dict[str, list[list]]:
    """The rate SBP treated as its policy rate on each date, with ceiling and floor."""
    r = rate_history()
    policy = [[x["date"], x["target"] if x["target"] is not None else x["ceiling"]] for x in r]
    ceiling = [[x["date"], x["ceiling"]] for x in r]
    floor = [[x["date"], x["floor"]] for x in r if x["floor"] is not None]
    return {"policy": policy, "ceiling": ceiling, "floor": floor}


# --- Reserves ---------------------------------------------------------------

def reserves_weekly() -> dict[str, list[list]]:
    df = sheet("Forex_Arch.xlsx", "Week-end")
    out = {"sbp": [], "banks": [], "total": []}
    for _, r in df.iterrows():
        if not _is_date(r[1]):
            continue
        d = pd.Timestamp(r[1]).date().isoformat()
        vals = [to_number(r[2]), to_number(r[3]), to_number(r[4])]
        if all(v is not None for v in vals):
            out["sbp"].append([d, round(vals[0], 1)])
            out["banks"].append([d, round(vals[1], 1)])
            out["total"].append([d, round(vals[2], 1)])
    return {k: sorted(v) for k, v in out.items()}


# --- Exchange rate ----------------------------------------------------------

def usd_pkr() -> list[list]:
    """Interbank US$ rate, monthly average, from Jan 1957."""
    df = sheet("IBF_Arch.xls", "Monthly Avg. Ex. Rates in PKR")
    hdr = [str(h).upper().strip().replace(".", "") for h in df.iloc[7].tolist()]
    col = next(i for i, h in enumerate(hdr) if h.startswith("USA"))
    out = []
    for _, r in df.iterrows():
        y = str(r[1]).strip()
        mon = str(r[0]).strip()[:3].lower()
        if re.fullmatch(r"\d{4}", y) and mon in MONTHS:
            v = to_number(r[col])
            if v is not None:
                out.append([month_end(int(y), MONTHS[mon]), round(v, 2)])
    return sorted(out)


def open_market_usd() -> dict:
    """Latest open-market closing US$ rate (kerb), from the daily PDF linked on the index page."""
    html = get(PAGE, retries=1).text
    m = re.findall(r'href="[^"]*?/([\w\-]*open-market-closing-exchange-rates[\w\-]*\.pdf)"', html)
    if not m:
        raise ValueError("open-market PDF link not found")
    pdf_bytes = get_file(BASE + m[0])
    dm = re.search(r"(\d{1,2})-([A-Za-z]+)-(\d{4})", m[0])
    d = date(int(dm[3]), MONTHS[dm[2][:3].lower()], int(dm[1])).isoformat() if dm else None
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    line = next(l for l in text.splitlines() if re.search(r"\bUSD\b|U\.?S\.?\s*Dollar", l, re.I))
    nums = re.findall(r"\d+\.\d+", line)
    if len(nums) < 2:
        raise ValueError(f"open-market: could not read a rate from {line!r}")
    return {"date": d, "buy": float(nums[0]), "sell": float(nums[1])}


# --- Remittances ------------------------------------------------------------

def _dates_from_row(row) -> dict[int, str]:
    out = {}
    for j, v in enumerate(row):
        d = to_month_end(v) if j > 1 else None
        if d:
            out[j] = d
    return out


def remittances() -> tuple[list[list], list[dict]]:
    """Total monthly remittances (Jul 1972 on) and the latest 12 months by country.

    Three sheets, one per period. The newest sheet has rows for each country
    (numbered) with sub-rows for emirates and EU members. Only numbered rows are
    summed, so parents and children are never double counted.
    """
    wb = book("Homeremit_Arch.xlsx")
    today_iso = date.today().isoformat()
    total: dict[str, float] = {}
    countries: list[dict] = []
    for sh in wb.sheet_names:
        df = wb.parse(sh, header=None)
        hdr = _dates_from_row(df.iloc[4].tolist())
        # SBP's newest sheet has stray 'Aug-27' and 'Aug-28' duplicate columns and FY total
        # columns; only real months up to today are kept, so these drop out.
        hdr = {j: d for j, d in hdr.items() if d <= today_iso}
        total_row = next(i for i in range(5, len(df)) if str(df.iloc[i, 0]).startswith("Total") or str(df.iloc[i, 1]).strip() == "Total")
        for j, d in hdr.items():
            v = to_number(df.iloc[total_row, j])
            if v is not None:
                total[d] = round(v, 2)
        if sh == wb.sheet_names[-1]:
            cols = sorted(hdr)[-12:]
            for i in range(5, total_row):
                num = str(df.iloc[i, 1]).strip()
                name = str(df.iloc[i, 2]).strip()
                if re.fullmatch(r"\d+", num):
                    parts = []
                    j = i + 1
                    while j < total_row and not re.fullmatch(r"\d+", str(df.iloc[j, 1]).strip()) and pd.notna(df.iloc[j, 2]):
                        parts.append({"label": str(df.iloc[j, 2]).strip(), "value": round(sum(to_number(df.iloc[j, c]) or 0 for c in cols), 1)})
                        j += 1
                    countries.append({"label": name.replace("*", "").replace("#", ""),
                                      "value": round(sum(to_number(df.iloc[i, c]) or 0 for c in cols), 1),
                                      "parts": parts})
    return sorted([[d, v] for d, v in total.items()]), countries


# --- Balance of payments ----------------------------------------------------

BOP_ROWS = {
    "current_account": r"^Current account balance\s*$",
    "exports": r"^Exports of goods",
    "imports": r"^Imports of goods",
    "goods_balance": r"^Balance on trade in goods\s*$",
    "exports_services": r"^Exports of services",
    "imports_services": r"^Imports of services",
    "remittances": r"^Workers' remittances",
    "fdi_in": r"^Direct investment\s+in Pakistan",
    "sbp_gross_reserves": r"SBP Gross\s+Reserves",
}


def bop() -> dict[str, list[list]]:
    df = sheet("BPM6_Ach_M.xlsx", "Sheet1")
    hdr = _dates_from_row(df.iloc[3].tolist())
    hdr = {j: d for j, d in hdr.items() if j > 0}
    out: dict[str, list[list]] = {}
    for key, pat in BOP_ROWS.items():
        for i in range(4, len(df)):
            if isinstance(df.iloc[i, 0], str) and re.search(pat, df.iloc[i, 0].strip()):
                out[key] = sorted([d, round(v, 1)] for j, d in hdr.items() if (v := to_number(df.iloc[i, j])) is not None)
                break
        else:
            raise KeyError(f"BoP row not found: {key}")
    return out


def trade_groups(direction: str) -> list[dict]:
    """Exports or imports by commodity group, last 12 months against the 12 months before.

    The file holds groups (A., B., ...) with commodities under them (numbered),
    in thousands of US dollars. Only group rows are compared, so no double counting.
    """
    name = {"exports": "Export_Receipts_by_Commodities_and_Groups_Arch.xls",
            "imports": "Import_Payments_by_Commodities_and_Groups_Arch.xls"}[direction]
    wb = book(name)
    df = wb.parse(wb.sheet_names[-1], header=None)
    hdr_row = next(i for i in range(0, 8) if str(df.iloc[i, 0]).strip().startswith("Commodity"))
    hdr = _dates_from_row(df.iloc[hdr_row].tolist())
    hdr = {j: d for j, d in hdr.items() if j > 0}
    cols = sorted(hdr, key=lambda j: hdr[j])
    last12, prev12 = cols[-12:], cols[-24:-12]
    if len(prev12) < 12:
        raise ValueError("not enough months for a 12-month comparison")
    def row_sum(i, cs):
        return sum(to_number(df.iloc[i, c]) or 0 for c in cs)
    groups: list[dict] = []
    current = None
    for i in range(hdr_row + 1, len(df)):
        label = str(df.iloc[i, 0]).strip()
        if re.match(r"^[A-Z]\.\s", label) and re.search(r"Food Group|Machinery Group|Transport Group|Petroleum Group|Textile Group|Agri\.|Other Manufacture|Metal Group|Miscellaneous Group|All Others", label):
            current = {"label": re.sub(r"^[A-Z]\.\s*", "", label), "value": round(row_sum(i, last12) / 1e6, 3),
                       "prev": round(row_sum(i, prev12) / 1e6, 3), "parts": []}
            groups.append(current)
        elif current and re.match(r"^\d+\.?\s", label):
            current["parts"].append({"label": re.sub(r"^\d+\.?\s*", "", label).strip(), "value": round(row_sum(i, last12) / 1e6, 3)})
        elif re.match(r"^I\.?\s*(Total Export|Imports? Payments)", label):
            total = row_sum(i, last12) / 1e6
            got = sum(g["value"] for g in groups)
            if abs(got - total) > 0.01 * total:
                raise ValueError(f"{direction} groups sum to {got:.2f}, file total is {total:.2f}")
            break
    return groups


# --- Rates charged and credit -----------------------------------------------

def lending_rates() -> dict[str, list[list]]:
    """Scheduled banks' weighted average rates on NEW loans and NEW deposits.

    Both exclude zero-markup items and interbank business. From Jan 2011; the
    format changed in Jul 2022 ('All Banks' became '1. Scheduled Banks').
    Columns: 2-5 gross disbursements, 6-9 outstanding loans, 10-13 fresh
    deposits, 14-17 outstanding deposits; within each, incl/excl zero markup and
    incl/excl interbank. So column 5 = new loans ex zero ex interbank, column 13
    = new deposits ex zero ex interbank.
    """
    wb = book("Lendingdepositrates_Arch.xls")
    new_loans: dict[str, float] = {}
    new_dep: dict[str, float] = {}
    for sh in wb.sheet_names:
        if "11" not in sh and "22" not in sh:
            continue
        df = wb.parse(sh, header=None)
        current = None
        for i in range(len(df)):
            a = df.iloc[i, 0]
            b = df.iloc[i, 1]
            d = to_month_end(a) if (pd.notna(a) and str(a).strip() not in ("Items",)) else None
            if d:
                current = d
            if current and pd.notna(b) and re.match(r"(All Banks|1\.\s*Scheduled Banks)", str(b).strip()):
                L = to_number(df.iloc[i, 5])
                D = to_number(df.iloc[i, 13])
                if L is not None:
                    new_loans[current] = round(L, 2)
                if D is not None:
                    new_dep[current] = round(D, 2)
    return {"new_loans": sorted(map(list, new_loans.items())), "new_deposits": sorted(map(list, new_dep.items()))}


def credit() -> dict[str, list[list]]:
    """Bank and SBP credit to government and private sector, month-end stock (Rs million), from 2006."""
    wb = book("CreditLoans-arch.xls")
    gov: dict[str, float] = {}
    pvt: dict[str, float] = {}
    for sh in ("WEB COPY-Archive", "Archive ISIC 4"):
        df = wb.parse(sh, header=None)
        hrow = next(i for i in range(0, 8) if "Description" in str(df.iloc[i, 1]))
        hdr = {j: to_month_end(v) for j, v in enumerate(df.iloc[hrow].tolist()) if j > 1 and to_month_end(v)}
        for i in range(hrow + 1, len(df)):
            label = str(df.iloc[i, 1]).strip()
            target = gov if label.startswith("1. Credit to Government") else pvt if re.match(r"III\.?\s*Credit to Private Sector", label) else None
            if target is not None:
                for j, d in hdr.items():
                    v = to_number(df.iloc[i, j])
                    if v is not None:
                        target[d] = v
    return {"government": sorted(map(list, gov.items())), "private": sorted(map(list, pvt.items()))}


# --- Debt -------------------------------------------------------------------

def _debt_rows(df, patterns: dict[str, str]) -> dict[str, list[list]]:
    hrow = next(i for i in range(0, 10) if any(to_month_end(v) for v in df.iloc[i].tolist()[2:]))
    hdr = {j: to_month_end(v) for j, v in enumerate(df.iloc[hrow].tolist()) if j > 1 and to_month_end(v)}
    out: dict[str, list[list]] = {}
    for key, pat in patterns.items():
        for i in range(hrow + 1, len(df)):
            if isinstance(df.iloc[i, 1], str) and re.search(pat, df.iloc[i, 1].strip()):
                out[key] = [[d, v] for j, d in hdr.items() if (v := to_number(df.iloc[i, j])) is not None]
                break
    return out


def central_gov_debt() -> dict[str, list[list]]:
    """Central government domestic and external debt, month-end, Rs billion, Jun 2010 on."""
    wb = book("CenGovDebt-Archive.xls")
    pats = {"domestic": r"^A\.\s*Central Government Domestic Debt", "external": r"^B\.\s*Central Government External Debt"}
    combined: dict[str, dict[str, float]] = {"domestic": {}, "external": {}}
    for sh in wb.sheet_names:
        r = _debt_rows(wb.parse(sh, header=None), pats)
        for k, pts in r.items():
            combined[k].update(dict(pts))
    res = {k: sorted(map(list, v.items())) for k, v in combined.items()}
    dom = dict(res["domestic"])
    res["total"] = [[d, round(dom[d] + v, 1)] for d, v in res["external"] if d in dom]
    return res


def external_debt() -> dict[str, list[list]]:
    """Total external debt & liabilities and IMF debt, US$ million, quarterly."""
    wb = book("pakdebt_Arch.xls")
    tot: dict[str, float] = {}
    imf: dict[str, float] = {}
    for sh in ("Old Archive", "New Archive"):
        df = wb.parse(sh, header=None)
        hrow = next(i for i in range(0, 8) if str(df.iloc[i, 0]).strip() == "ITEM")
        hdr = {j: to_month_end(v) for j, v in enumerate(df.iloc[hrow].tolist()) if j > 0 and to_month_end(v)}
        for i in range(hrow + 1, len(df)):
            label = str(df.iloc[i, 0]).strip()
            if re.match(r"(Total external debt|Total External Debt)", label):
                for j, d in hdr.items():
                    v = to_number(df.iloc[i, j])
                    if v is not None:
                        tot[d] = v
            if re.match(r"2\.\s*From IMF", label) or re.match(r"2\.\s*.*IMF", label):
                for j, d in hdr.items():
                    v = to_number(df.iloc[i, j])
                    if v is not None:
                        imf[d] = v
    if not tot or not imf:
        raise ValueError("external debt: expected rows not found")
    return {"total": sorted(map(list, tot.items())), "imf": sorted(map(list, imf.items()))}


def debt_summary() -> dict:
    """Pakistan's Debt and Liabilities Summary (PDF, because Summary.xls truncates).

    Gross Public Debt is the headline: Rs billion for the last 5 quarter-ends,
    and % of GDP for the last two year-ends.
    """
    with pdfplumber.open(io.BytesIO(get_file(BASE + "Summary.pdf"))) as pdf:
        text = pdf.pages[0].extract_text() or ""
    lines = text.splitlines()
    hdr = next(l for l in lines if re.search(r"Jun-\d{2}.*Jun-\d{2}", l))
    dates = re.findall(r"([A-Z][a-z]{2}-\d{2})", hdr)
    if len(dates) != 5:
        raise ValueError(f"debt summary: expected 5 periods, got {dates}")
    iso = [to_month_end(d) for d in dates]
    out: dict = {"dates": iso}
    def nums(l):
        return [float(x) for x in re.findall(r"\d[\d,]*\.\d+", l.replace(",", ""))]
    for key, pat in {"gross_public": r"^A\.\s*Gross Public Debt", "frdla": r"^B\.\s*Total Debt of the Government",
                     "external_liabilities": r"^C\.\s*Total External Debt", "imf": r"^III\.\s*Debt from IMF"}.items():
        l = next(x for x in lines if re.match(pat, x))
        v = nums(l.split(")")[-1] if ")" in l else l)
        v = v[-5:]
        if len(v) != 5:
            raise ValueError(f"debt summary: {key} gave {v}")
        out[key] = [[d, n] for d, n in zip(iso, v)]
    pct = next((l for l in lines if re.match(r"^Gross Public Debt\s+\d", l)), None)
    if pct is None:
        raise ValueError("debt summary: % of GDP line not found")
    # The PDF sometimes splits a number's digits ("70.6 6 8.3" means 70.6 and 68.3).
    joined = re.sub(r"(?<![\d.])(\d)\s+(\d+\.\d)", r"\1\2", pct)
    p = [float(x) for x in re.findall(r"\d+\.\d", joined)]
    out["pct_gdp_gross_public"] = p[-2:]
    return out


# --- Activity ---------------------------------------------------------------

def quarterly_gdp() -> list[list]:
    """Quarterly real growth of total GVA (PBS figures in SBP's table)."""
    df = sheet("QGDP.xlsx", "Growth_Q")
    row = next(i for i in range(7, len(df)) if isinstance(df.iloc[i, 2], str) and "Total of GVA" in df.iloc[i, 2])
    out = []
    fy = None
    for j in range(3, df.shape[1]):
        h = df.iloc[5, j]
        if isinstance(h, str) and re.search(r"\d{4}\s*-\s*\d{2}", h):
            fy = int(re.search(r"(\d{4})", h)[1])
        q = df.iloc[6, j]
        v = to_number(df.iloc[row, j])
        if isinstance(q, str) and q.strip() in ("Q1", "Q2", "Q3", "Q4") and fy and v is not None:
            n = int(q.strip()[1])
            m, y = (9, fy) if n == 1 else (12, fy) if n == 2 else (3, fy + 1) if n == 3 else (6, fy + 1)
            out.append([month_end(y, m), round(v, 2)])
    return sorted(out)


def lsm_index() -> list[list]:
    """Large-scale manufacturing quantum index, monthly levels, base 2015-16, from Jul 2016."""
    df = sheet("Productselect.xlsx", "LSM_OP")
    hrow = next(i for i in range(0, len(df)) if str(df.iloc[i, 2]).strip() == "Period" or str(df.iloc[i, 3]).strip() == "Period")
    months = {}
    for j, v in enumerate(df.iloc[hrow].tolist()):
        if isinstance(v, str) and v.strip()[:3].lower() in MONTHS:
            months[j] = MONTHS[v.strip()[:3].lower()]
    out = []
    for i in range(hrow + 1, len(df)):
        fy = next((str(x).strip() for x in df.iloc[i].tolist()[:5] if re.fullmatch(r"\d{4}-\d{2}", str(x).strip())), None)
        if not fy:
            continue
        start = int(fy[:4])
        for j, m in months.items():
            v = to_number(df.iloc[i, j])
            if v is not None:
                y = start if m >= 7 else start + 1
                out.append([month_end(y, m), round(v, 2)])
    return sorted(out)


def confidence() -> dict[str, list[list]]:
    """SBP-IBA consumer confidence index and inflation expectations (monthly since 2012, gaps early on)."""
    df = sheet("Overall-Indices.xlsx", "Overall-Indices")
    cci, ie = [], []
    for _, r in df.iterrows():
        if _is_date(r[0]):
            d = pd.Timestamp(r[0])
            iso = month_end(d.year, d.month)
            if (v := to_number(r[2])) is not None:
                cci.append([iso, round(v, 1)])
            if (v := to_number(r[4])) is not None:
                ie.append([iso, round(v, 1)])
    return {"cci": sorted(cci), "ie": sorted(ie)}
