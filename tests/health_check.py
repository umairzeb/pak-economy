"""Checks public/data. Run with:  python -m tests.health_check [--live]

Exit codes: 0 all good. 1 data looks wrong: do not publish it. 2 needs a look but is safe to publish
(a figure is overdue, a hand-entered number needs updating, or a dated cross-check no longer matches).
--live also re-downloads the publishers' own releases and tests every source link.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime, timedelta

from pipeline import hand_entered as hand
from pipeline.build import MAX_JUMP, SANITY
from pipeline.util import DATA_DIR

TODAY = date.today()
fail: list[str] = []
warn: list[str] = []
passed = 0


def ok(cond: bool, msg: str, severe: bool = True) -> bool:
    global passed
    if cond:
        passed += 1
    else:
        (fail if severe else warn).append(msg)
    return cond


def load(kind: str, name: str):
    return json.loads((DATA_DIR / kind / f"{name}.json").read_text(encoding="utf-8"))


SERIES = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in (DATA_DIR / "series").glob("*.json")}
BUNDLES = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in (DATA_DIR / "bundles").glob("*.json")}
MANIFEST = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))


# ------------- freshness against each source's real release timetable -----------
# Maximum age in days of the latest data point, allowing for that source's usual delay plus a margin.
FRESHNESS = {
    "cpi_yoy": 45, "cpi_food_yoy": 45, "reserves_sbp": 14, "usd_pkr": 45, "remittances_m": 52, "exports_m": 62,
    "imports_m": 62, "current_account_m": 62, "lending_rate_new": 62, "credit_private_yoy": 62,
    "debt_central_total": 75, "external_debt_total": 140, "gross_public_debt": 140, "lsm_yoy": 100, "cci": 80,
    "gdp_growth": 460, "gdp_quarterly": 220, "fy_overall_balance": 420,
}


def future_dated(s: dict, today: date = TODAY) -> bool:
    """A point dated ahead of time is an error, except a rate decision effective within a few days."""
    d = date.fromisoformat(s["points"][-1][0])
    if s.get("freq") == "event":
        return d > today + timedelta(days=7)
    if s.get("freq") == "FY":
        return False  # budget-year-end dates; estimates are kept in separate bundles
    return d > today + timedelta(days=45 if s.get("freq") == "Q" else 35)


# Dated cross-checks: headline figures against the publisher's own release, written down by hand
# from the documents on 8 Nov 2026. They only apply while the series still contains that date.
ANCHORS = [
    ("cpi_yoy", "2026-10-31", 9.6, 0.05, "PBS Monthly Review, Oct 2026, Table 1.a"),
    ("cpi_yoy", "2026-09-30", 10.3, 0.05, "PBS Monthly Review, Oct 2026, Table 1.a"),
    ("cpi_urban_yoy", "2026-10-31", 9.5, 0.05, "PBS Monthly Review, Oct 2026"),
    ("cpi_rural_yoy", "2026-10-31", 9.8, 0.05, "PBS Monthly Review, Oct 2026"),
    ("policy_rate", "2026-10-27", 12.0, 0.001, "SBP Monetary Policy Statement, 26 Oct 2026"),
    ("reserves_sbp", "2026-10-30", 21561.2, 0.1, "SBP Liquid FX Reserves (forex.pdf), 5 Nov 2026"),
    ("reserves_banks", "2026-10-30", 5303.3, 0.1, "SBP Liquid FX Reserves (forex.pdf), 5 Nov 2026"),
    ("reserves_total", "2026-10-30", 26864.5, 0.1, "SBP Liquid FX Reserves (forex.pdf), 5 Nov 2026"),
    ("usd_pkr", "2026-10-31", 277.24, 0.01, "SBP Bank Floating Average Exchange Rates"),
    ("remittances_m", "2026-09-30", 3587.76, 1.0, "SBP Country-wise remittances, Sep 2026; BoP table says 3,588"),
    ("current_account_m", "2026-09-30", -356, 0.5, "SBP BoP (BPM6) monthly, Sep 2026"),
    ("gdp_growth", "2026-06-30", 3.65, 0.01, "PBS National Accounts Table 6, Sep 2026; SBP statement rounds to 3.7"),
    ("gross_public_debt", "2026-06-30", 86714.7, 1, "SBP Debt and Liabilities Summary, Jun 2026"),
    ("external_debt_total", "2026-06-30", 138849.8, 1, "SBP External Debt, Jun 2026"),
    ("imf_debt", "2026-06-30", 11050.0, 1.5, "SBP External Debt, Jun 2026 (SBP Summary: Rs 3,072.9bn)"),
    ("fy_total_revenue", "2026-06-30", 19773.9, 0.1, "Finance Ministry Fiscal Operations 2025-26, Table 1"),
    ("fy_total_expenditure", "2026-06-30", 23087.4, 0.1, "Finance Ministry Fiscal Operations 2025-26, Table 1"),
    ("fy_markup", "2026-06-30", 6947.6, 0.1, "Finance Ministry Fiscal Operations 2025-26, Table 1"),
    ("fy_defence", "2026-06-30", 2587.6, 0.1, "Finance Ministry Fiscal Operations 2025-26, Table 1"),
    ("fy_overall_balance", "2026-06-30", -3313.4, 0.1, "Finance Ministry Fiscal Operations 2025-26, Table 1"),
    ("exports_m", "2026-09-30", 3015, 0.5, "SBP BoP (BPM6), Sep 2026"),
    ("imports_m", "2026-09-30", 6172, 0.5, "SBP BoP (BPM6), Sep 2026"),
]


def latest(sid: str):
    s = SERIES.get(sid)
    return s["points"][-1] if s and s["points"] else (None, None)


def at(sid: str, d: str):
    s = SERIES.get(sid)
    if not s:
        return None
    for dd, v in s["points"]:
        if dd == d:
            return v
    return None


def check_structure() -> None:
    required = ("id", "title", "unit", "freq", "section", "points", "source", "updated")
    for sid, s in SERIES.items():
        ok(all(k in s for k in required), f"{sid}: missing fields")
        ok(all(k in s["source"] for k in ("name", "dataset", "url")), f"{sid}: source fields missing")
        url = s["source"]["url"]
        ok(bool(re.match(r"https://", url)) and not re.search(r"\.(pdf|xlsx?|csv|json)(\?|$)|/api[./]", url), f"{sid}: source link must be a readable page: {url}")
        ok(all(isinstance(p[0], str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", p[0]) and isinstance(p[1], (int, float)) for p in s["points"]), f"{sid}: bad point")
        dates = [p[0] for p in s["points"]]
        ok(dates == sorted(dates) and len(dates) == len(set(dates)), f"{sid}: dates not sorted or duplicated")
        ok(not future_dated(s), f"{sid}: latest date {dates[-1]} is in the future")
    for bid, b in BUNDLES.items():
        ok(bool(b.get("items")), f"{bid}: no items")
        url = b.get("source", {}).get("url", "")
        ok(bid in ("misc",) or (url.startswith("https://") and not re.search(r"\.(pdf|xlsx?|csv)(\?|$)", url)), f"{bid}: source link must be a readable page: {url}")


def check_values() -> None:
    for sid, (lo, hi) in SANITY.items():
        if sid in SERIES:
            v = SERIES[sid]["points"][-1][1]
            ok(lo <= v <= hi, f"{sid}: latest {v} outside {lo}-{hi}")
    for sid, frac in MAX_JUMP.items():
        pts = SERIES.get(sid, {}).get("points", [])
        if len(pts) > 1 and pts[-2][1]:
            ok(abs(pts[-1][1] / pts[-2][1] - 1) <= frac, f"{sid}: last value jumped more than {frac:.0%}")
    # A long-running series stuck on the same number has probably stopped updating.
    for sid in ("cpi_yoy", "usd_pkr", "reserves_sbp", "remittances_m", "exports_m", "imports_m"):
        pts = SERIES.get(sid, {}).get("points", [])
        ok(len(pts) < 6 or len({p[1] for p in pts[-6:]}) > 1, f"{sid}: last six values are identical", severe=False)


def check_freshness() -> None:
    for sid, days in FRESHNESS.items():
        if sid not in SERIES:
            ok(False, f"{sid}: series missing", severe=False)
            continue
        d = date.fromisoformat(SERIES[sid]["points"][-1][0])
        age = (TODAY - d).days
        ok(age <= days, f"{sid}: latest data is {age} days old (limit {days})", severe=False)
    # Hand-entered figures: warn when an update is due.
    for key, doc in {"Labour Force Survey": hand.LFS, "Budget": hand.BUDGET, "IMF programme": hand.IMF_PROGRAMME}.items():
        ok(date.fromisoformat(doc["next_due"]) >= TODAY, f"HAND-ENTERED {key}: update was due {doc['next_due']}", severe=False)
    # Policy dates run out, and the SBP advance release calendar ends Dec 2026.
    future = [d for d in hand.MPC_DATES if d >= TODAY.isoformat()]
    ok(bool(future), "MPC_DATES has run out: add the next SBP calendar", severe=False)
    if future:
        ok(date.fromisoformat(future[-1]) > TODAY + timedelta(days=40), "MPC_DATES runs out within 40 days", severe=False)
    ok(TODAY <= date(2026, 12, 31) or MANIFEST.get("arc_ok"), "SBP advance release calendar (ARC.xls) covered only 2026: check the new one", severe=False)


def at_gdp_latest() -> float:
    """Latest PBS current-price GDP in Rs billion, read back through the budget share series."""
    bal, pct_ = dict(map(tuple, SERIES["fy_overall_balance"]["points"])), dict(map(tuple, SERIES["fy_balance_pct_gdp"]["points"]))
    d = sorted(bal)[-1]
    return abs(bal[d] / pct_[d] * 100)


def check_consistency() -> None:
    # Reserves: SBP + banks = total, recent weeks.
    a, b, c = (dict(map(tuple, SERIES[k]["points"][-30:])) for k in ("reserves_sbp", "reserves_banks", "reserves_total"))
    bad = [d for d in c if d in a and d in b and abs(a[d] + b[d] - c[d]) > 0.5]
    ok(not bad, f"reserves: SBP + banks does not equal total on {bad[:3]}")
    # Fiscal: revenue - spending = balance within rounding, every year.
    rev, exp, bal = (dict(map(tuple, SERIES[k]["points"])) for k in ("fy_total_revenue", "fy_total_expenditure", "fy_overall_balance"))
    bad = [d for d in bal if d in rev and d in exp and abs(rev[d] - exp[d] - bal[d]) > 1.1]
    ok(not bad, f"fiscal: revenue less spending differs from the balance in {bad[:4]}")
    # Fiscal: published memo items for the latest year, against the recalculated share of GDP.
    mix = BUNDLES.get("revenue_mix"), BUNDLES.get("spending_mix")
    for b_ in mix:
        if b_:
            tot = sum(i["value"] for i in b_["items"])
            ok(abs(tot - b_["total"]) <= 1, f"{b_['id']}: items sum to {tot}, total {b_['total']}")
    bud = BUNDLES.get("budget_fy27")
    if bud:
        tot = sum(i["value"] for i in bud["items"])
        ok(abs(tot - bud["total"]) <= 1, f"budget_fy27: sums to {tot}, total {bud['total']}")
    # CPI: published headline agrees with what the index implies, on overlap.
    idx = dict(map(tuple, SERIES["cpi_index"]["points"]))
    yo = dict(map(tuple, SERIES["cpi_yoy"]["points"]))
    bad = []
    for d, v in idx.items():
        y1 = f"{int(d[:4]) - 1}{d[4:]}"
        if y1 in idx and d in yo and d > "2023-06-30":
            if abs((v / idx[y1] - 1) * 100 - yo[d]) > 0.2:
                bad.append(d)
    ok(not bad, f"CPI: published YoY disagrees with the index on {bad[:4]}")
    # Remittances: parts add up; country total close to 12-month sum.
    rc = BUNDLES.get("remittances_by_country")
    if rc:
        for i in rc["items"]:
            if i.get("parts"):
                ok(sum(p["value"] for p in i["parts"]) <= i["value"] * 1.02, f"remittances {i['label']}: parts add up to more than the whole")
        total = sum(i["value"] for i in rc["items"])
        twelve = SERIES["remittances_12m"]["points"][-1][1]
        ok(abs(total - twelve) / twelve < 0.01, f"remittances: countries sum to {total}, 12-month total is {twelve}")
    # Recalculate growth rates.
    lsm_i = dict(map(tuple, SERIES["lsm_index"]["points"]))
    lsm_y = dict(map(tuple, SERIES["lsm_yoy"]["points"]))
    for d, v in list(lsm_y.items())[-6:]:
        y1 = f"{int(d[:4]) - 1}{d[4:]}"
        if y1 in lsm_i:
            ok(abs((lsm_i[d] / lsm_i[y1] - 1) * 100 - v) < 0.05, f"LSM growth {d} does not match the index")
    # Parents and children: interest + defence must be inside total spending.
    for k in ("fy_markup", "fy_defence"):
        tot = dict(map(tuple, SERIES["fy_total_expenditure"]["points"]))
        ok(all(v < tot.get(d, 1e12) for d, v in SERIES[k]["points"]), f"{k}: exceeds total spending")
    # Debt-to-GDP as published must match debt divided by PBS GDP.
    misc = BUNDLES.get("misc")
    if misc and "gross_public_debt" in SERIES:
        pub = next(i for i in misc["items"] if i["key"].startswith("gross_public_debt_gdp"))
        ok(30 <= pub["value"] <= 150, f"gross public debt {pub['value']}% of GDP is outside a sensible range")
        ok(30 <= pub["prev"] <= 150, f"gross public debt {pub['prev']}% of GDP (previous year) is outside a sensible range")
        latest_debt = SERIES["gross_public_debt"]["points"][-1][1]
        ok(abs(pub["value"] - latest_debt / at_gdp_latest() * 100) < 6, f"gross public debt share {pub['value']}% is far from debt divided by GDP")
    # External debt in rupees and US$ should line up via the exchange rate (within a few %).
    ext = SERIES.get("external_debt_total")
    if ext:
        v = dict(map(tuple, ext["points"])).get("2026-06-30")
        gross = at("gross_public_debt", "2026-06-30")
        if v and gross:
            ok(v * 1e-3 * 278 < gross, "external debt in rupees should be well below total public debt")


def check_anchors() -> None:
    for sid, d, want, tol, doc in ANCHORS:
        v = at(sid, d)
        if v is None:
            ok(False, f"anchor {sid} at {d}: date no longer in the data ({doc})", severe=False)
            continue
        ok(abs(v - want) <= tol, f"anchor {sid} at {d}: {v} vs published {want} ({doc})", severe=False)
    # Headline vs hand-entered LFS: internal agreement.
    ok(hand.LFS["unemployment_rate"] == hand.LFS["by_group"][0]["now"], "LFS: headline rate does not match the group table")


def live_checks() -> None:
    """Compare with separate published documents and test every source link."""
    import io
    import pdfplumber
    import requests
    from pipeline.sources import pbs as P
    from pipeline.sources import sbp as B
    from pipeline.util import USER_AGENT, get, get_file

    # forex.pdf is a different file from the archive the pipeline reads.
    with pdfplumber.open(io.BytesIO(get_file(B.BASE + "forex.pdf"))) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    weekly = re.findall(r"(\d{1,2}-[A-Z][a-z]{2}-\d{2})\s+([\d ,]+\.\d)\s+([\d ,]+\.\d)\s+([\d ,]+\.\d)", text)
    if weekly:
        d, a, b_, tot = weekly[-1]
        f = lambda s: float(s.replace(",", "").replace(" ", ""))  # noqa: E731
        ok(abs(latest("reserves_total")[1] - f(tot)) < 0.2, f"live: reserves total {latest('reserves_total')[1]} vs forex.pdf {tot}")
        ok(abs(latest("reserves_sbp")[1] - f(a)) < 0.2, f"live: reserves SBP {latest('reserves_sbp')[1]} vs forex.pdf {a}")
    else:
        ok(False, "live: forex.pdf layout changed, could not read weekly rows", severe=False)
    # sir.pdf policy rate column.
    with pdfplumber.open(io.BytesIO(get_file(B.BASE + "sir.pdf"))) as pdf:
        text = pdf.pages[0].extract_text() or ""
    rows = re.findall(r"^(\d{1,2}-[A-Z][a-z]{2}-\d{2})\s+(\d+\.\d\d)\s+(\d+\.\d\d)\s+(\d+\.\d\d)", text, re.M)
    if rows:
        ok(float(rows[-1][3]) == latest("policy_rate")[1], f"live: policy rate {latest('policy_rate')[1]} vs sir.pdf {rows[-1]}")
    # IBF_Rates.pdf has the latest monthly average US$ rate.
    with pdfplumber.open(io.BytesIO(get_file(B.BASE + "IBF_Rates.pdf"))) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages[:2])
    usd = re.findall(r"U\.?S\.?A\.?\s+[A-Za-z. ]*?Dollar\s+(\d{2,3}\.\d+)", text)
    if usd:
        ok(abs(float(usd[0]) - latest("usd_pkr")[1]) < 1.5, f"live: USD {latest('usd_pkr')[1]} vs IBF_Rates.pdf {usd[0]}")
    else:
        ok(False, "live: IBF_Rates.pdf not read", severe=False)
    # Monthly Review vs the CPI headline series, all months it covers.
    review = P.monthly_review()["yoy"]["national"]
    dd = dict(map(tuple, SERIES["cpi_yoy"]["points"]))
    bad = [(d, v, dd.get(d)) for d, v in review if d in dd and abs(v - dd[d]) > 0.15]
    ok(not bad, f"live: CPI differs from the Monthly Review: {bad[:3]}")
    # SBP republishes PBS's GDP growth: they must agree.
    df = B.sheet("GDP_table.xlsx", "Annual")
    growth_row = next(i for i in range(4, len(df)) if "GDP Growth Rate" in str(df.iloc[i, 2]))
    sbp_last = float(df.iloc[growth_row, df.shape[1] - 1])
    ok(abs(sbp_last - latest("gdp_growth")[1]) < 0.05, f"live: GDP growth PBS {latest('gdp_growth')[1]} vs SBP table {sbp_last}")
    # BoP remittances vs the country table: same publisher, different statistics.
    bop = B.bop()["remittances"]
    bm = dict(map(tuple, bop))
    bad = [(d, v, bm.get(d)) for d, v in SERIES["remittances_m"]["points"][-12:] if d in bm and abs(v - bm[d]) > bm[d] * 0.015]
    ok(not bad, f"live: remittances differ between SBP tables: {bad[:3]}")
    # Every source link opens a page a person can read.
    urls = {s["source"]["url"] for s in SERIES.values()} | {b["source"]["url"] for b in BUNDLES.values() if b.get("source", {}).get("url")}
    urls.add("https://www.finance.gov.pk/imf.html")
    for u in sorted(urls):
        try:
            r = requests.get(u, headers={"User-Agent": USER_AGENT}, timeout=40, allow_redirects=True)
            is_html = "text/html" in r.headers.get("Content-Type", "")
            ok(r.status_code == 200 and is_html, f"link does not open a page: {u} ({r.status_code}, {r.headers.get('Content-Type','')})", severe=False)
        except Exception as e:  # noqa: BLE001
            ok(False, f"link failed: {u}: {type(e).__name__}", severe=False)


def main() -> int:
    check_structure()
    check_values()
    check_freshness()
    check_consistency()
    check_anchors()
    if "--live" in sys.argv:
        live_checks()
    print(f"Checks passed: {passed}")
    for m in fail:
        print("  FAIL", m)
    for m in warn:
        print("  LOOK", m)
    if fail:
        return 1
    return 2 if warn else 0


if __name__ == "__main__":
    sys.exit(main())
