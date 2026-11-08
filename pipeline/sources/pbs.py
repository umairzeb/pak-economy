"""Pakistan Bureau of Statistics: prices, national accounts.

Pages: https://www.pbs.gov.pk/price-statistics/ and /national-accounts-2/
Data files live under wp-content/uploads/2020/07/ with names that change each
month, so links are read from the page.
"""
from __future__ import annotations

import io
import re
import xml.etree.ElementTree as ET
from functools import lru_cache
from urllib.parse import urljoin

import pandas as pd
import pdfplumber

from ..util import MONTHS, fiscal_end, get, get_file, month_end, to_month_end, to_number, workbook

UPLOADS = "https://www.pbs.gov.pk/wp-content/uploads/2020/07/"
PRICE_PAGE = "https://www.pbs.gov.pk/price-statistics/"
NA_PAGE = "https://www.pbs.gov.pk/national-accounts-2/"
CPI_FEED = "https://www.pbs.gov.pk/cpi"


@lru_cache(maxsize=None)
def _page(url: str) -> str:
    return get(url, retries=1).text


def _find(page_url: str, pattern: str) -> str:
    links = re.findall(r'href="([^"]+)"', _page(page_url))
    hits = [urljoin(page_url, l) for l in links if re.search(pattern, l, re.I)]
    if not hits:
        raise ValueError(f"no link matching {pattern!r} on {page_url}")
    return hits[0]


@lru_cache(maxsize=None)
def cpi_feed() -> dict[str, dict[str, list]]:
    """National CPI by group: {indicator: {'pts': [[iso, index], ...]}} from Jul 2022."""
    r = get(CPI_FEED, retries=1)
    root = ET.fromstring(r.content)
    out: dict[str, list] = {}
    for el in root.iter():
        if el.tag.split("}")[-1] == "Series":
            ind = el.attrib["INDICATOR"]
            pts = []
            for o in el:
                y, m = o.attrib["TIME_PERIOD"].split("-")
                pts.append([month_end(int(y), int(m)), float(o.attrib["OBS_VALUE"])])
            out[ind] = sorted(pts)
    if "PCPI_IX" not in out:
        raise ValueError("CPI feed has no headline index")
    return out


COICOP = {
    "01": "Food and non-alcoholic drinks", "02": "Alcohol and tobacco", "03": "Clothing and footwear",
    "04": "Housing, water, electricity, gas", "05": "Furnishings and household items", "06": "Health",
    "07": "Transport", "08": "Communication", "09": "Recreation and culture", "10": "Education",
    "11": "Restaurants and hotels", "12": "Other goods and services",
}


@lru_cache(maxsize=None)
def historical() -> dict[str, list[list]]:
    """National, urban, rural and WPI, index and YoY %, from PBS's history file.

    Lines look like '2022 7 183.3 ... ' for indices and for YoY tables. The
    first half of the file is indices, the second half growth rates, marked by
    'Historical Inflation Rate' headings.
    """
    b = get_file(UPLOADS + "indices_and_growth_rates_historical-1.pdf")
    idx = {k: {} for k in ("national", "urban", "rural", "wpi")}
    yoy = {k: {} for k in ("national", "urban", "rural", "wpi")}
    with pdfplumber.open(io.BytesIO(b)) as pdf:
        section = "index"
        for page in pdf.pages:
            for line in (page.extract_text() or "").splitlines():
                if "Inflation Rate" in line:
                    section = "yoy"
                m = re.match(r"^(\d{4})\s+(\d{1,2})\s+(-?\d+\.\d)\s+(-?\d+\.\d)\s+(-?\d+\.\d)\s+(-?\d+\.\d)", line.strip())
                if m:
                    d = month_end(int(m[1]), int(m[2]))
                    target = idx if section == "index" else yoy
                    for k, g in zip(("national", "urban", "rural", "wpi"), (3, 4, 5, 6)):
                        target[k][d] = float(m[g])
    if len(yoy["national"]) < 60:
        raise ValueError(f"CPI history: only {len(yoy['national'])} YoY rows, layout changed?")
    return {f"{k}_index": sorted(map(list, v.items())) for k, v in idx.items()} | \
           {f"{k}_yoy": sorted(map(list, v.items())) for k, v in yoy.items()}


@lru_cache(maxsize=None)
def monthly_review() -> dict:
    """Latest Monthly Review: table 1.a (22 months of YoY by category) and core inflation."""
    url = _find(PRICE_PAGE, r"Monthly-Review-[A-Za-z]+-?\d{4}\.pdf")
    with pdfplumber.open(io.BytesIO(get_file(url))) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages[:6])
    columns = ("national", "national_mom", "urban", "urban_mom", "rural", "rural_mom", "food_urban", "food_urban_mom",
               "food_rural", "food_rural_mom", "nonfood_urban", "nonfood_urban_mom", "nonfood_rural", "nonfood_rural_mom",
               "spi", "spi_mom", "wpi", "wpi_mom")
    table: dict[str, dict] = {c: {} for c in columns}
    lines = text.splitlines()
    for line in lines:
        m = re.match(r"^([A-Z][a-z]+)-(\d{2})((?:\s+-?\d+\.\d\*?){18})\s*$", line.strip())
        if m:
            d = month_end(2000 + int(m[2]), MONTHS[m[1][:3].lower()])
            vals = [float(x.replace("*", "")) for x in m[3].split()]
            for c, v in zip(columns, vals):
                table[c][d] = v
    if len(table["national"]) < 12:
        raise ValueError("Monthly Review table 1.a not parsed, layout changed?")
    core: dict[str, dict] = {k: {} for k in ("nfne_urban", "nfne_rural", "trimmed_urban", "trimmed_rural")}
    for line in lines:
        m = re.match(r"^([A-Z][a-z]+)-(\d{2})((?:\s+-?\d+\.\d\*?){8})\s*$", line.strip())
        if m:
            d = month_end(2000 + int(m[2]), MONTHS[m[1][:3].lower()])
            v = [float(x.replace("*", "")) for x in m[3].split()]
            core["nfne_urban"][d], core["nfne_rural"][d] = v[0], v[2]
            core["trimmed_urban"][d], core["trimmed_rural"][d] = v[4], v[6]
    return {"url": url, "yoy": {c: sorted(map(list, table[c].items())) for c in columns if not c.endswith("_mom")},
            "mom": {c: sorted(map(list, table[c].items())) for c in columns if c.endswith("_mom")},
            "core": {k: sorted(map(list, v.items())) for k, v in core.items()}}


@lru_cache(maxsize=None)
def weekly_spi() -> dict:
    """Latest weekly SPI: 51 items' prices for this week, last week and a year earlier."""
    url = _find(PRICE_PAGE, r"SPI-Report-\d{2}\.\d{2}\.\d{4}\.xlsx")
    xl = pd.ExcelFile(io.BytesIO(get_file(url)), engine="calamine")
    df = xl.parse("Page 2", header=None)
    items = []
    for _, r in df.iterrows():
        vals = r.dropna().tolist()
        if len(vals) >= 8 and re.fullmatch(r"\d{1,2}", str(vals[0]).strip()) and not re.fullmatch(r"\d+", str(vals[1]).strip()):
            name, unit = str(vals[1]).strip(), str(vals[2]).strip()
            now, week, year = to_number(vals[3]), to_number(vals[4]), to_number(vals[5])
            if now is None or year is None:
                continue
            items.append({"label": name, "unit": unit, "value": now, "last_week": week, "year_ago": year,
                          "change_pct": round((now / year - 1) * 100, 2) if year else None})
    m = re.search(r"SPI-Report-(\d{2})\.(\d{2})\.(\d{4})", url)
    week_end = f"{m[3]}-{m[2]}-{m[1]}"
    if len(items) < 40:
        raise ValueError(f"weekly SPI: only {len(items)} items, layout changed?")
    return {"week_end": week_end, "items": items, "url": url}


@lru_cache(maxsize=None)
def daily_wages() -> list[dict]:
    """PBS's published average daily wage for each trade, latest month (Items 52-66 sheet)."""
    url = _find(PRICE_PAGE, r"SPI-Monthly-Prices-Annex-10\.xlsx")
    wb = workbook(url)
    df = wb.parse("Items 52-66", header=None)
    header = [str(x).strip() for x in df.iloc[1].tolist()]
    avg_col = next(i for i, h in enumerate(header) if h.lower().startswith("average"))
    city_cols = [i for i in range(3, avg_col)]
    out = []
    for _, r in df.iterrows():
        name = str(r[1]).strip()
        if re.search(r"Wage Rate", name) or name.startswith("Unskilled Labour"):
            avg = to_number(r[avg_col])  # PBS's own average across cities
            n = sum(1 for i in city_cols if to_number(r[i]) is not None)
            if avg is not None:
                out.append({"label": name.replace(" Wage Rate", "").replace(" Labour", " labourer"), "value": round(avg), "cities": n})
    if not out:
        raise ValueError("wage rows not found")
    return out


@lru_cache(maxsize=None)
def national_accounts_book() -> pd.ExcelFile:
    url = _find(NA_PAGE, r"National-Accounts-Annual-Tables[\w\-]*\.xlsx")
    return workbook(url)


def _na_table(sheet: str) -> dict[str, dict[str, float]]:
    """{sector label: {fy_end: value}} for a PBS national accounts table with years across row 2."""
    df = national_accounts_book().parse(sheet, header=None)
    hdr = {j: fiscal_end(v) for j, v in enumerate(df.iloc[2].tolist()) if fiscal_end(v)}
    out: dict[str, dict[str, float]] = {}
    for i in range(3, len(df)):
        lab = df.iloc[i, 1]
        if isinstance(lab, str) and lab.strip():
            out[re.sub(r"\s+", " ", lab.strip())] = {d: v for j, d in hdr.items() if (v := to_number(df.iloc[i, j])) is not None}
    return out


def gdp_growth() -> list[list]:
    t = _na_table("Table 6")
    row = next(v for k, v in t.items() if k.startswith("GDP {Total of GVA") or "GDP" in k and "GVA" in k)
    return sorted([d, round(v, 2)] for d, v in row.items())


def gdp_current() -> list[list]:
    """GDP at current market prices, Rs billion (PBS Table 4), for % of GDP calculations."""
    t = _na_table("Table 4")
    row = next(v for k, v in t.items() if re.match(r"GDP\b.*(Current|mp)", k) and ("Current" in k or "mp" in k))
    return sorted([d, round(v / 1000, 1)] for d, v in row.items())


def population() -> list[list]:
    """Population (millions) from PBS Table 5, using the 2023-census series where it exists."""
    t = _na_table("Table 5")
    census = next((v for k, v in t.items() if k.startswith("Population (million no.) 2023")), {})
    older = next(v for k, v in t.items() if k.startswith("Population (million no.) 2017"))
    return sorted([d, round(census.get(d, v), 2)] for d, v in {**older, **census}.items())


def sector_growth_latest() -> dict:
    """Latest year's real growth by sector and share of GVA (constant prices)."""
    growth, level = _na_table("Table 6"), _na_table("Table 5")
    fy = max(d for v in growth.values() for d in v)
    def get_row(table, prefix):
        return next(v for k, v in table.items() if k.lower().startswith(prefix))
    groups = {
        "Agriculture, forestry and fishing": ("agriculture, forestry", [("Crops", "1. crops"), ("Livestock", "2. livestock"), ("Forestry", "3. forestry"), ("Fishing", "4. fishing")]),
        "Industry": ("industrial activities", [("Mining and quarrying", "1. mining"), ("Manufacturing", "2. manufacturing"), ("Electricity, gas, water", "3 electricity"), ("Construction", "4. construction")]),
        "Services": ("services (", [("Wholesale and retail trade", "1. wholesale"), ("Transport and storage", "2. transportation"), ("Hotels and food services", "3. accommodation"), ("Information and communication", "4. information"), ("Finance and insurance", "5. financial"), ("Real estate", "6. real estate"), ("Government admin and social security", "7. public admin"), ("Education", "8. education"), ("Health and social work", "9. human health"), ("Other private services", "10. other private")]),
    }
    total = get_row(level, "gdp {total")[fy]
    items = []
    for name, (key, subs) in groups.items():
        v = get_row(level, key)[fy]
        items.append({"label": name, "value": round(get_row(growth, key)[fy], 2), "share": round(v / total * 100, 1),
                      "parts": [{"label": lab, "value": round(get_row(growth, pref)[fy], 1), "share": round(get_row(level, pref)[fy] / total * 100, 1)} for lab, pref in subs]})
    return {"fy": fy, "items": items}
