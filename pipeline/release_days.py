"""Decides whether a scheduled run should refresh the data now.

GitHub starts scheduled runs late, sometimes by hours, and sometimes drops them, so the
workflow wakes several times a day and asks this module whether a refresh is due. All times
are Pakistan Standard Time, UTC+5 all year (Pakistan has no daylight saving).

A refresh is due when a key moment has passed in Pakistan today and nothing has been tried since:
- 6:30pm every day: SBP and PBS post most files between about noon and 5pm
- on Monetary Policy Committee days, 7:30pm and 9:30pm too, after the policy statement

Standard library only: this runs before any packages are installed.
"""
from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from .hand_entered import MPC_DATES

PAKISTAN = timezone(timedelta(hours=5), "PKT")
LAST_ATTEMPT = Path(__file__).with_name("last_attempt.txt")

DAILY_MOMENT = time(18, 30)
DECISION_MOMENTS = (time(19, 30), time(21, 30))
DECISIONS = [date.fromisoformat(d) for d in MPC_DATES]


def moments(day: date) -> list[datetime]:
    """Today's key moments in Pakistan time, earliest first."""
    times = [DAILY_MOMENT, *(DECISION_MOMENTS if day in DECISIONS else ())]
    return [datetime.combine(day, t, PAKISTAN) for t in times]


def is_due(now: datetime, last_attempt: datetime | None) -> bool:
    passed = [m for m in moments(now.astimezone(PAKISTAN).date()) if m <= now]
    return bool(passed) and (last_attempt is None or last_attempt < passed[-1])


def read_last_attempt() -> datetime | None:
    try:
        return datetime.fromisoformat(LAST_ATTEMPT.read_text(encoding="utf-8").strip().replace("Z", "+00:00"))
    except (FileNotFoundError, ValueError):
        return None


def main() -> None:
    due = is_due(datetime.now(timezone.utc), read_last_attempt())
    print(f"Refresh due: {due}")
    if out := os.environ.get("GITHUB_OUTPUT"):
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"due={'true' if due else 'false'}\n")


if __name__ == "__main__":
    main()
