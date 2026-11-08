"""World Bank open data API (CC BY 4.0). Used only where Pakistan's publishers have no history."""
from __future__ import annotations

from ..util import get


def indicator(code: str) -> list[list]:
    url = f"https://api.worldbank.org/v2/country/PAK/indicator/{code}?format=json&per_page=200&date=1960:2030"
    meta, rows = get(url, retries=1).json()
    out = [[f"{r['date']}-12-31", float(r["value"])] for r in rows if r["value"] is not None]
    if not out:
        raise ValueError(f"World Bank {code}: no data")
    return sorted(out)
