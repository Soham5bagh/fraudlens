"""Generator, flagger, investigator, and metrics. No network, no API key."""

from __future__ import annotations

import sqlite3

from engine.agent import investigate_case
from engine.build import DB_PATH, main as build_main
from engine.flagging import build_cases, flag_transactions
from engine.generate import generate, public_world
from engine.metrics import compute_metrics

PATTERNS = ("card_testing", "account_takeover", "mule_chain", "merchant_collusion")


def _run(seed: int = 42):
    world = generate(seed)
    visible = public_world(world)
    flagged = flag_transactions(visible, seed=seed)
    cases = build_cases(visible, flagged)
    investigations = [investigate_case(case, visible) for case in cases]
    metrics = compute_metrics(world, flagged, investigations, cases)
    return world, visible, flagged, cases, investigations, metrics


def test_generator_is_reproducible():
    first = generate(42)
    second = generate(42)
    assert [row["id"] for row in first["transactions"]] == [row["id"] for row in second["transactions"]]
    assert [row["amount_cents"] for row in first["transactions"]] == [row["amount_cents"] for row in second["transactions"]]
    assert first["labels"] == second["labels"]


def test_ground_truth_is_not_on_the_ledger():
    world = generate(7)
    visible = public_world(world)
    assert "labels" not in visible
    assert "scenarios" not in visible
    for txn in visible["transactions"]:
        assert "is_fraud" not in txn
        assert "pattern" not in txn
    patterns = {row["pattern"] for row in world["labels"] if row["is_fraud"]}
    assert set(PATTERNS) <= patterns


def test_flagger_catches_fraud_and_honest_customers(tmp_path):
    world, visible, flagged, cases, investigations, metrics = _run()
    assert metrics["naive"]["recall"] == 1.0
    assert metrics["naive"]["fp"] > 0
    assert metrics["customers_wrongly_blocked"]["naive"] >= 4
    # Every planted pattern is present in the queue.
    queued = {inv["pattern"] for inv in investigations}
    assert set(PATTERNS) <= queued


def test_agent_beats_the_queue_without_blocking_honest_customers():
    _world, _visible, _flagged, _cases, investigations, metrics = _run()
    agent = metrics["agent"]
    naive = metrics["naive"]
    assert agent["recall"] >= 0.95
    assert agent["precision"] > naive["precision"]
    assert agent["fp"] < naive["fp"]
    assert metrics["customers_wrongly_blocked"]["agent_block"] == 0
    assert metrics["customers_wrongly_blocked"]["naive"] > 0
    assert metrics["queue"]["legitimate_cases_approved"] == metrics["queue"]["legitimate_cases"]
    for pattern in PATTERNS:
        row = next(item for item in metrics["by_pattern"] if item["pattern"] == pattern)
        assert row["cases_named_correctly"] == row["cases_with_pattern"]
        assert row["cases_with_pattern"] >= 1
        assert row["agent_recall"] >= 0.95


def test_explanations_cite_concrete_evidence():
    _world, _visible, _flagged, _cases, investigations, _metrics = _run()
    by_pattern = {}
    for inv in investigations:
        by_pattern.setdefault(inv["pattern"], inv)
    for pattern in PATTERNS:
        inv = by_pattern[pattern]
        text = inv["narrative"] + " " + " ".join(step["finding"] for step in inv["timeline"])
        assert "txn_" in text
        assert "$" in text
        assert inv["action"] in {"approve", "hold", "escalate", "block"}
        assert 0 <= inv["risk_score"] <= 100
        assert len(inv["timeline"]) >= 8
        assert inv["graph"]["nodes"]


def test_legitimate_traps_are_approved():
    _world, _visible, _flagged, _cases, investigations, _metrics = _run()
    details = {inv["pattern_detail"] for inv in investigations if inv["action"] == "approve"}
    for expected in ("travel", "large_purchase", "flash_sale", "new_device_at_home", "household"):
        assert expected in details


def test_metrics_arithmetic():
    world, _visible, _flagged, _cases, _investigations, metrics = _run()
    population = len(world["transactions"])
    for side in ("naive", "agent"):
        row = metrics[side]
        assert row["tp"] + row["fp"] + row["tn"] + row["fn"] == population
        if row["tp"] + row["fp"]:
            assert row["precision"] == round(row["tp"] / (row["tp"] + row["fp"]), 4)
        assert row["recall"] == round(row["tp"] / (row["tp"] + row["fn"]), 4)


def test_sqlite_keeps_labels_in_their_own_table(tmp_path, monkeypatch):
    # Rebuild writes the shared demo database. Point it at a temp file.
    import engine.build as build

    db_path = tmp_path / "halden.db"
    monkeypatch.setattr(build, "DB_PATH", db_path)
    monkeypatch.setattr(build, "SEED_DIR", tmp_path / "seed")
    monkeypatch.setattr(build, "PUBLIC_DIR", tmp_path / "public")
    build_main()
    connection = sqlite3.connect(db_path)
    columns = [row[1] for row in connection.execute("PRAGMA table_info(transactions)")]
    assert "is_fraud" not in columns
    assert "pattern" not in columns
    truth_columns = [row[1] for row in connection.execute("PRAGMA table_info(ground_truth)")]
    assert "is_fraud" in truth_columns
    view_columns = [row[1] for row in connection.execute("PRAGMA table_info(analyst_transactions)")]
    assert "is_fraud" not in view_columns
    frauds = connection.execute("SELECT COUNT(*) FROM ground_truth WHERE is_fraud = 1").fetchone()[0]
    assert frauds > 0
    connection.close()
