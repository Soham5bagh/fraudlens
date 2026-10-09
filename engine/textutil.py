"""Formatting helpers shared by the agent and the report writer.

Amounts are integer paise. Clock times are shown in India Standard Time;
stored timestamps stay in UTC.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30), "IST")


def money(paise: int | float | None) -> str:
    """Rupees with Indian digit grouping, for example ₹1,23,456.78."""
    if paise is None:
        return "—"
    value = int(round(paise))
    sign = "-" if value < 0 else ""
    rupees, rest = divmod(abs(value), 100)
    digits = str(rupees)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups + [tail])
    return f"{sign}₹{digits}.{rest:02d}"


def whole_rupees(paise: int) -> str:
    """₹1,000 rather than ₹1,000.00, for thresholds and round figures."""
    text = money(paise)
    return text[:-3] if text.endswith(".00") else text


def pct(value: float) -> str:
    points = value * 100
    if abs(points - round(points)) < 1e-6:
        return f"{round(points):.0f}%"
    return f"{points:.2f}%"


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def clock(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=IST).strftime("%d %b %Y %H:%M IST")


def short_clock(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=IST).strftime("%H:%M IST")


def minutes_between(start_ts: int, end_ts: int) -> int:
    return max(0, int(round((end_ts - start_ts) / 60)))


def plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"
