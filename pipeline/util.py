"""Shared helpers: HTTP, period/date normalisation, JSON output."""
from __future__ import annotations

import io
import json
import re
import time
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"

USER_AGENT = "Mozilla/5.0 (compatible; pak-economy-dashboard/0.1)"

_session: requests.Session | None = None


def http() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({"User-Agent": USER_AGENT, "Accept": "*/*", "Accept-Language": "en;q=0.9"})
    return _session


def get(url: str, retries: int = 2, **kwargs) -> requests.Response:
    """GET with retries on timeouts, dropped connections and 5xx errors."""
    kwargs.setdefault("timeout", 90)
    for attempt in range(retries + 1):
        try:
            r = http().get(url, **kwargs)
            if r.status_code < 500 or attempt == retries:
                r.raise_for_status()
                return r
        except (requests.Timeout, requests.ConnectionError, requests.exceptions.ChunkedEncodingError):
            if attempt == retries:
                raise
        time.sleep(5 * (attempt + 1))
    raise AssertionError("unreachable")


MAGIC = {"xlsx": b"PK", "xls": b"\xd0\xcf", "pdf": b"%PDF"}


def get_file(url: str, retries: int = 2) -> bytes:
    """Download a data file and refuse anything that is not the promised type.

    SBP's and PBS's old links answer with HTTP 200 and a normal web page, so a
    status check alone would happily parse a home page as data.
    """
    kind = url.rsplit(".", 1)[-1].lower()
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            content = get(url, retries=0).content
            if content.startswith(MAGIC.get(kind, b"")):
                return content
            last_err = ValueError(f"{url}: not a real .{kind} file ({len(content)} bytes)")
        except Exception as e:  # noqa: BLE001
            last_err = e
        time.sleep(4 * (attempt + 1))
    raise last_err  # type: ignore[misc]


def workbook(url: str) -> pd.ExcelFile:
    return pd.ExcelFile(io.BytesIO(get_file(url)), engine="calamine")


MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def month_end(y: int, m: int) -> str:
    return pd.Period(f"{y:04d}-{m:02d}", "M").end_time.date().isoformat()


def to_month_end(v) -> str | None:
    """Month-end ISO date from a datetime, 'Oct-26', 'October 2026', 'Sep-26 (P)' or 'Sep 26 R'."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (datetime, date, pd.Timestamp)):
        return month_end(v.year, v.month)
    s = str(v).strip()
    if m := re.match(r"(\d{4})-(\d{2})-\d{2}", s):
        return month_end(int(m[1]), int(m[2]))
    if m := re.match(r"([A-Za-z]{3})[a-z]*[\s,.\-]+(\d{4}|\d{2})(?!\d)", s):
        if m[1].lower() in MONTHS:
            y = int(m[2])
            y = (2000 + y if y < 50 else 1900 + y) if y < 100 else y
            return month_end(y, MONTHS[m[1].lower()])
    return None


def fiscal_end(label) -> str | None:
    """'2025-26', '2025-26P', 'FY26' -> '2026-06-30'."""
    s = str(label).strip()
    m = re.match(r"(\d{4})\s*[-–]\s*(\d{2}|\d{4})", s)
    if m:
        return f"{int(m[1]) + 1}-06-30"
    m = re.match(r"FY\s*(\d{2})\b", s, re.I)
    if m:
        y = int(m[1])
        return f"{2000 + y if y < 60 else 1900 + y}-06-30"
    return None


def to_number(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return None if pd.isna(v) else float(v)
    s = str(v).strip().replace(",", "").replace("%", "")
    s = re.sub(r"\s+", "", s)
    if s in ("", "-", "--", "...", "..", "na", "n.a.", "NA", "nan", "—", "–"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
