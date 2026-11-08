"""Ministry of Finance: Consolidated fiscal operations (actual outturns, PDF only).

Page a person can read: https://www.finance.gov.pk/fiscal_main.html
"""
from __future__ import annotations

import io
import re
from functools import lru_cache
from urllib.parse import urljoin

import pdfplumber

from ..util import get, get_file

FISCAL_PAGE = "https://www.finance.gov.pk/fiscal_main.html"
BASE = "https://www.finance.gov.pk/"


@lru_cache(maxsize=None)
def fiscal_links() -> dict[str, str]:
    """{'2025-26': absolute_url}, for full-year (July-June) PDFs since FY2012-13."""
    html = get(FISCAL_PAGE, retries=1).text
    found: dict[str, str] = {}
    for m in re.finditer(r'href="([^"]+)"[^>]*>\s*July\s*to\s*June\s*([0-9]{4})-([0-9]{2})', html, re.I | re.S):
        fy = f"{m[2]}-{m[3]}"
        found.setdefault(fy, urljoin(FISCAL_PAGE, m[1]))
    return found


def _num(s: str) -> float:
    return float(s.replace(",", "").replace(" ", ""))


def _last_value(line: str) -> float | None:
    # Column values can be broken by the PDF ('4 ,065'); glue a lone digit to a following comma group.
    # In some years a digit is split from its number: '1 6,154,950', '2 ,016,977', '4 ,065'.
    cleaned = re.sub(r"(?<![\d,.])(\d)\s+,(\d)", r"\1,\2", line)
    cleaned = re.sub(r"(?<![\d,.])(\d)\s+(\d{1,2},\d{3})", r"\1\2", cleaned)
    cleaned = re.sub(r"(\s-)\s+(\d)", r"\1\2", cleaned)
    m = re.findall(r"-?\d[\d,]*(?:\.\d+)?", cleaned)
    return _num(m[-1]) if m else None


LABELS_T1 = {
    "total_revenue": r"^(1\.\s*)?Total Revenue",
    "tax_revenue": r"^(\(a\)\s*)?Tax Revenue",
    "non_tax": r"^(\(b\)\s*)?Non-Tax",
    "total_expenditure": r"^(2\.\s*)?Total Expenditure",
    "current": r"^(\(a\)\s*)?Current Expenditure",
    "markup": r"^Of which\s*:?\s*Mark-up",
    "defence": r"^Defence\b",
    "development": r"^(\(b\)\s*)?Development Expenditure",
    "discrepancy": r"^(\(c\)\s*)?Statistical Discrepancy",
    "overall_balance": r"^(3\.\s*)?(Overall Budget Balance|Budget Deficit)",
    "primary_balance": r"^(4\.\s*)?Primary Balance",
}


def parse_summary(text: str) -> dict:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    out: dict = {}
    memo_i = next((i for i, l in enumerate(lines) if l.startswith("Memo Items")), len(lines))
    for key, pat in LABELS_T1.items():
        for l in lines[:memo_i]:
            if re.match(pat, l):
                v = _last_value(l)
                if v is not None:
                    if key == "overall_balance" and "Budget Deficit" in l:
                        v = -abs(v)  # older tables state the deficit as a positive number
                    out[key] = round(v / 1000, 1)  # million to billion
                break
    memo = lines[memo_i:]
    for key, pat in {"revenue_gdp": r"^Total Revenue", "tax_gdp": r"^Tax Revenue", "expenditure_gdp": r"^Total Expenditure",
                     "markup_gdp": r"^Of which\s*:?\s*Mark-up", "defence_gdp": r"^Defence", "deficit_gdp": r"^Budget (deficit|Deficit)",
                     "primary_gdp": r"^Primary Balance"}.items():
        for l in memo:
            if re.match(pat, l):
                # Memo rows repeat a label then quarterly cumulative columns.
                nums = re.findall(r"-?\d+\.\d", re.sub(r"(\d)\s\.(\d)", r"\1.\2", l))
                if nums:
                    out[key] = float(nums[-1])
                break
    gdp_line = next((l for l in lines if l.startswith("GDP (Rs. in Billion)")), None)
    if gdp_line:
        out["gdp_billion"] = _last_value(gdp_line)
    return out


@lru_cache(maxsize=None)
def fiscal_year(fy: str) -> tuple[dict, list[str]]:
    """(summary, pages_text) for one financial year."""
    url = fiscal_links()[fy]
    with pdfplumber.open(io.BytesIO(get_file(url))) as pdf:
        pages = [p.extract_text() or "" for p in pdf.pages]
    s = parse_summary(pages[0])
    s["url"] = url
    return s, pages


def fiscal_history(years: list[str]) -> dict[str, dict]:
    out = {}
    for fy in years:
        s, pages = fiscal_year(fy)
        s["provisional"] = "provisional" in pages[0].lower()[:200]
        out[fy] = s
    return out


_PDF_RE = re.compile(r"-?\d[\d,]*")


def fiscal_mix(fy: str) -> dict:
    """Latest-year revenue and spending by line (Tables 2 and 3). Rs billion."""
    _, pages = fiscal_year(fy)
    def table(n):
        return next(p for p in pages if re.search(rf"^\s*(Provisional\s+)?Table {n}\b", p, re.M))
    t2, t3 = table(2), table(3)
    def val(text, pat):
        l = next(x.strip() for x in text.splitlines() if re.match(pat, x.strip()))
        v = _last_value(l)
        return round(v / 1000, 1)
    revenue = {
        "Direct taxes (income, corporate)": val(t2, r"^Direct Taxes"),
        "Sales tax": val(t2, r"^Sales Tax\b"),
        "Customs duties": val(t2, r"^Taxes on international trade"),
        "Federal excise duty": val(t2, r"^Federal Excise"),
        "Provincial taxes": val(t2, r"^\(b\)\s*Provincial"),
        "Petroleum levy": val(t2, r"^Petroleum Levy\s+\d"),
        "SBP profit": val(t2, r"^Surplus Profit of State Bank"),
    }
    non_tax_total = val(t2, r"^2\.\s*Non-Tax Revenue")
    revenue["Other non-tax revenue"] = round(non_tax_total - revenue["Petroleum levy"] - revenue["SBP profit"], 1)
    total_rev = val(t2, r"^Total Revenue")
    spend = {
        "Interest (mark-up) payments": val(t3, r"^Mark-up Payments"),
        "Provincial current spending": val(t3, r"^\(b\)\s*Provincial"),
        "Defence": val(t3, r"^Defence Affairs and Services"),
        "Development and net lending": val(t3, r"^2\.\s*Development Expenditure"),
        "Grants to others": val(t3, r"^Grants to Others"),
        "Pensions": val(t3, r"^Pension"),
        "Running of civil government": val(t3, r"^Running of Civil"),
        "Subsidies": val(t3, r"^Subsidies"),
    }
    total_spend = val(t3, r"^Total Expenditure")
    return {"revenue": revenue, "spend": spend, "total_revenue": total_rev, "total_spend": total_spend}
