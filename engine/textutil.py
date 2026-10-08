"""Formatting helpers shared by the agent and the report writer."""

from __future__ import annotations

from datetime import datetime, timezone


def money(cents: int | float | None) -> str:
    if cents is None:
        return "—"
    return f"${cents / 100:,.2f}"


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def clock(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%d %b %Y %H:%M UTC")


def short_clock(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%H:%M UTC")


def minutes_between(start_ts: int, end_ts: int) -> int:
    return max(0, int(round((end_ts - start_ts) / 60)))


def plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"
