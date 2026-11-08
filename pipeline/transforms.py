"""Operations on point lists: [[iso_date, value], ...], oldest first."""
from __future__ import annotations


def value_at_or_before(pts: list[list], date: str):
    v = None
    for d, x in pts:
        if d <= date:
            v = x
        else:
            break
    return v


def year_ago_date(d: str) -> str:
    return f"{int(d[:4]) - 1}{d[4:]}"


def yoy(pts: list[list], digits: int = 2) -> list[list]:
    """Percent change on the same period a year earlier."""
    lookup = {d[:7]: v for d, v in pts}
    out = []
    for d, v in pts:
        prev = lookup.get(year_ago_date(d)[:7])
        if prev not in (None, 0):
            out.append([d, round((v / prev - 1) * 100, digits)])
    return out


def rolling_sum(pts: list[list], n: int = 12) -> list[list]:
    out = []
    for i in range(n - 1, len(pts)):
        out.append([pts[i][0], round(sum(v for _, v in pts[i - n + 1 : i + 1]), 3)])
    return out


def splice(old: list[list], new: list[list]) -> list[list]:
    """Old points up to where new starts, then new."""
    if not new:
        return old
    start = new[0][0]
    return [p for p in old if p[0] < start] + new


def difference(a: list[list], b: list[list]) -> list[list]:
    """a minus b on dates present in both."""
    m = dict(b)
    return [[d, round(v - m[d], 3)] for d, v in a if d in m]


def rescale(pts: list[list], factor: float, digits: int = 3) -> list[list]:
    return [[d, round(v * factor, digits)] for d, v in pts]
