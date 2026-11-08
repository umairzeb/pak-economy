"""Proves the refresh refuses bad data. Run with:  python -m tests.test_guards"""
from datetime import date, datetime, timezone

from pipeline.build import KNOWN_CLOUD_BLOCKS, refused_cloud, rejected, rejected_bundle, sort_kept_files
from pipeline.release_days import PAKISTAN, is_due
from tests.health_check import future_dated

GOOD = [["2026-07-31", 4.5], ["2026-08-31", 4.6], ["2026-09-30", 4.7]]
PREVIOUS = {"points": GOOD[:2]}


def sr(pts, id="policy_rate"):
    return {"id": id, "points": pts}


def test_series() -> None:
    assert rejected(sr(GOOD), PREVIOUS) is None, "good data accepted"
    assert rejected(sr(GOOD), None) is None, "a new series is accepted"
    assert rejected(sr([]), PREVIOUS), "empty data refused"
    assert rejected(sr([["2026-09-30", 470.0]]), None), "a value out of range refused (a unit error)"
    assert rejected(sr(GOOD[:1]), {"points": GOOD * 4}), "a much shorter series refused"
    assert rejected(sr(GOOD[:2]), {"points": GOOD}), "a latest date going backwards refused"
    assert rejected(sr([["2026-08-31", 280], ["2026-09-30", 500]], "usd_pkr"), None), "a sudden rupee jump refused"


def test_bundles() -> None:
    items = [{"key": str(i)} for i in range(10)]
    assert rejected_bundle({"items": items}, {"items": items}) is None, "good bundle accepted"
    assert rejected_bundle({"items": []}, None), "empty bundle refused"
    assert rejected_bundle({"items": items[:3]}, {"items": items}), "a bundle that lost most of its items refused"


def test_future_dates() -> None:
    today = date(2026, 11, 3)
    decision = {"freq": "event", "points": [["2026-11-04", 12.0]]}
    assert not future_dated(decision, today), "a policy decision effective tomorrow is allowed"
    assert future_dated({"freq": "event", "points": [["2026-12-20", 12.0]]}, today), "a decision weeks ahead refused"
    assert future_dated({"freq": "M", "points": [["2026-12-31", 4.7]]}, today), "a monthly figure dated ahead refused"
    assert not future_dated({"freq": "FY", "points": [["2027-06-30", 1.0]]}, today), "fiscal year-end dates are fine"


def test_release_days() -> None:
    at = lambda day, h, m: datetime(*day, h, m, tzinfo=PAKISTAN)  # noqa: E731
    plain, decision = (2026, 11, 5), (2026, 12, 14)
    assert not is_due(at(plain, 17, 0), None), "not due before the evening refresh"
    assert is_due(at(plain, 18, 45), None), "due after it"
    assert is_due(at(plain, 18, 45), at((2026, 11, 4), 19, 0)), "yesterday's refresh doesn't count"
    assert not is_due(at(plain, 20, 0), at(plain, 18, 45)), "one refresh a day on a plain day"
    assert not is_due(at(decision, 19, 10), at(decision, 18, 45)), "not due before the policy statement time"
    assert is_due(at(decision, 19, 45), at(decision, 18, 45)), "due after the policy statement"
    assert not is_due(at(decision, 20, 0), at(decision, 19, 45)), "no repeat straight after"
    assert is_due(at(decision, 21, 45), at(decision, 19, 45)), "a second try on decision days"
    assert not is_due(at(decision, 23, 0), at(decision, 21, 45)), "then stops"
    # Pakistan has no daylight saving: 13:30 UTC is 18:30 in Pakistan all year.
    assert is_due(datetime(2027, 7, 1, 13, 35, tzinfo=timezone.utc), None), "UTC+5 holds in summer"


def test_known_cloud_block() -> None:
    class Refused(Exception):
        def __init__(self, code):
            self.response = type("Response", (), {"status_code": code})()

    github = {"GITHUB_ACTIONS": "true"}
    assert refused_cloud(Refused(403), github), "a refusal on GitHub's servers is recognised"
    assert not refused_cloud(Refused(403), {}), "a refusal on an ordinary connection is a real failure"
    assert not refused_cloud(Refused(500), github), "a server fault is a real failure"
    assert not refused_cloud(ValueError("bad table"), github), "a changed layout is a real failure"
    assert KNOWN_CLOUD_BLOCKS == {"budget": "Ministry of Finance"}, "only the documented block is excused"

    now = datetime(2026, 11, 8, tzinfo=timezone.utc)
    old = "2026-01-01T00:00:00+00:00"
    finance = {"updated": old, "source": {"name": "Ministry of Finance"}}
    state_bank = {"updated": old, "source": {"name": "State Bank of Pakistan"}}
    stale, too_stale, waiting = sort_kept_files({"f": finance, "s": state_bank}, {"Ministry of Finance"}, now)
    assert waiting == ["f"] and too_stale == ["s"] and len(stale) == 1, "the block excuses only that publisher's files"
    stale, too_stale, waiting = sort_kept_files({"f": finance}, set(), now)
    assert too_stale == ["f"] and not waiting, "without a block this run, old Finance files are still too old"


if __name__ == "__main__":
    test_series()
    test_bundles()
    test_future_dates()
    test_release_days()
    test_known_cloud_block()
    print("Safeguards work.")
