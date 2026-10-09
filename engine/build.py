"""Generate the ledger, investigate every queued case, write the demo files.

Run with `python -m engine.build`. The Next.js app and the Vercel deployment
read the JSON this writes. They do not need scikit-learn or NetworkX at request time.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
from pathlib import Path

from engine.agent import investigate_case
from engine.evaluate import false_alarm_examples, robustness_report
from engine.flagging import build_cases, flag_transactions
from engine.generate import generate, public_world
from engine.metrics import compute_metrics
from engine.reports import case_markdown, summary_markdown
from engine.textutil import money

ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = ROOT / "data" / "seed"
PUBLIC_DIR = ROOT / "public" / "data"
DB_PATH = ROOT / "data" / "fraudlens.db"

DEMO_SLOTS = [
    ("card_testing", "Card testing", "Start with the burst. Tiny amounts, many merchants, a device the customer has never used, then a gift card that actually clears. The suggestion is block. Do not press it yourself."),
    ("account_takeover", "Account takeover", "Contrast this with the trip you will open last. Here the device is new, the country is new, and the spend is gift cards and crypto at many times the baseline."),
    ("mule_chain", "Mule-account chain", "Follow the money, not the single payment. Shared devices, a young account, and a path that ends at a crypto cash-out the same day."),
    ("merchant_collusion", "Merchant collusion", "The fourth pattern. Round amounts, one merchant, buyers who share a laptop. Escalating one card does not fix the merchant."),
    ("legitimate", "Genuine customer", "This one was queued. FraudLens reads the file and approves it. This is the false alarm the rubber-stamp desk would have blocked."),
]


def main() -> None:
    world = generate(seed=42)
    visible = public_world(world)
    flagged = flag_transactions(visible, seed=42)
    cases = build_cases(visible, flagged)
    investigations = [investigate_case(case, visible) for case in cases]
    metrics = compute_metrics(world, flagged, investigations, cases)
    truth_by_case = {row["case_id"]: row for row in metrics["case_truth"]}

    files = []
    for investigation in investigations:
        truth = {
            "is_fraud": truth_by_case[investigation["case_id"]]["is_fraud"],
            "pattern": truth_by_case[investigation["case_id"]]["pattern"],
        }
        investigation["report_markdown"] = case_markdown(investigation, truth)

    demo = _pick_demo(investigations, truth_by_case)
    for investigation in investigations:
        investigation["showcase"] = None
    for order, item in enumerate(demo, start=1):
        for investigation in investigations:
            if investigation["case_id"] == item["case_id"]:
                investigation["showcase"] = {
                    "slot": item["slot"],
                    "order": order,
                    "title": item["title"],
                    "say": item["say"],
                }

    queue = [_queue_item(investigation) for investigation in investigations]
    queue.sort(key=lambda item: (-item["risk_score"], item["case_id"]))

    judge = {
        row["case_id"]: {
            "is_fraud": row["is_fraud"],
            "pattern": row["pattern"],
            "predicted_pattern": row["predicted"],
            "action": row["action"],
            "correct_pattern": (not row["is_fraud"] and row["predicted"] == "legitimate")
            or (row["is_fraud"] and row["predicted"] == row["pattern"]),
            "correct_action": (row["is_fraud"] and row["action"] != "approve")
            or ((not row["is_fraud"]) and row["action"] == "approve"),
        }
        for row in metrics["case_truth"]
    }

    metrics["false_alarm_examples"] = false_alarm_examples(world, investigations)
    metrics["robustness"] = robustness_report()
    report = summary_markdown(metrics, world["meta"])
    manifest = {
        **world["meta"],
        "transactions": len(world["transactions"]),
        "customers": len(world["customers"]),
        "cases": len(investigations),
        "flagged_transactions": len(flagged),
        "demo": [item["case_id"] for item in demo],
    }

    # Metrics shipped to the UI should not depend on the agent having seen labels.
    public_metrics = {key: value for key, value in metrics.items() if key != "case_truth"}
    public_metrics["headline"] = {
        "frauds_caught_recall": metrics["agent"]["recall"],
        "precision": metrics["agent"]["precision"],
        "false_alarms": metrics["agent"]["fp"],
        "false_positive_rate": metrics["agent"]["fpr"],
        "genuine_customers_blocked_by_queue": metrics["customers_wrongly_blocked"]["naive"],
        "genuine_customers_blocked_by_agent": metrics["customers_wrongly_blocked"]["agent_block"],
        "genuine_customers_cleared": len(metrics["customers_wrongly_blocked"]["cleared_by_agent"]),
    }

    payload = {
        "manifest.json": manifest,
        "queue.json": {"cases": queue},
        "metrics.json": public_metrics,
        "demo.json": {"steps": demo},
        "judge.json": judge,
        "report.md": report,
    }
    _write_outputs(payload, investigations, world)
    _print_summary(manifest, metrics, demo)


def _pick_demo(investigations: list[dict], truth_by_case: dict) -> list[dict]:
    steps = []
    used: set[str] = set()
    for slot, title, say in DEMO_SLOTS:
        chosen = None
        if slot == "legitimate":
            # Prefer a traveler: the contrast the pitch is built around.
            pool = [
                inv
                for inv in investigations
                if inv["pattern_detail"] == "travel"
                and inv["action"] == "approve"
                and not truth_by_case[inv["case_id"]]["is_fraud"]
            ]
            if not pool:
                pool = [
                    inv
                    for inv in investigations
                    if inv["pattern"] == "legitimate"
                    and inv["action"] == "approve"
                    and not truth_by_case[inv["case_id"]]["is_fraud"]
                    and inv["pattern_detail"] in {"large_purchase", "flash_sale", "new_device_at_home", "household"}
                ]
        else:
            pool = [
                inv
                for inv in investigations
                if inv["pattern"] == slot
                and truth_by_case[inv["case_id"]]["is_fraud"]
                and truth_by_case[inv["case_id"]]["pattern"] == slot
                and inv["action"] != "approve"
            ]
            pool.sort(key=lambda inv: (-inv["risk_score"], inv["case_id"]))
        if slot == "legitimate" and pool:
            pool.sort(key=lambda inv: ({"travel": 0, "large_purchase": 1}.get(inv["pattern_detail"], 2), inv["case_id"]))
        for inv in pool:
            if inv["case_id"] not in used:
                chosen = inv
                break
        if chosen is None:
            raise RuntimeError(f"No showcase case for {slot}. Agent output does not match the planted patterns.")
        used.add(chosen["case_id"])
        steps.append(
            {
                "slot": slot,
                "title": title,
                "say": say,
                "case_id": chosen["case_id"],
                "customer_name": chosen["customer"]["name"],
                "summary": chosen["summary"],
                "action": chosen["action"],
                "risk_score": chosen["risk_score"],
                "amount_paise": chosen["lead"]["amount_paise"],
                "amount": money(chosen["lead"]["amount_paise"]),
            }
        )
    return steps


def _queue_item(investigation: dict) -> dict:
    return {
        "case_id": investigation["case_id"],
        "lead_transaction_id": investigation["lead_transaction_id"],
        "customer_id": investigation["customer"]["id"],
        "customer_name": investigation["customer"]["name"],
        "home": f"{investigation['customer']['home_city']}, {investigation['customer']['home_country']}",
        "merchant_name": investigation["lead"]["merchant_name"],
        "amount_paise": investigation["lead"]["amount_paise"],
        "occurred_at": investigation["lead"]["occurred_at"],
        "status": investigation["lead"]["status"],
        "flag_reasons": [item["code"] for item in investigation["flag_reasons"]],
        "risk_score": investigation["risk_score"],
        "pattern": investigation["pattern"],
        "pattern_label": investigation["pattern_label"],
        "pattern_detail": investigation["pattern_detail"],
        "action": investigation["action"],
        "summary": investigation["summary"],
        "confidence": investigation["confidence"],
        "showcase_slot": (investigation.get("showcase") or {}).get("slot"),
    }


def _write_outputs(payload: dict, investigations: list[dict], world: dict) -> None:
    if SEED_DIR.exists():
        shutil.rmtree(SEED_DIR)
    (SEED_DIR / "cases").mkdir(parents=True)
    for name, body in payload.items():
        path = SEED_DIR / name
        if name.endswith(".md"):
            path.write_text(body, encoding="utf-8")
        else:
            path.write_text(json.dumps(body, indent=2), encoding="utf-8")
    for investigation in investigations:
        (SEED_DIR / "cases" / f"{investigation['case_id']}.json").write_text(
            json.dumps(investigation, indent=2),
            encoding="utf-8",
        )
    if PUBLIC_DIR.exists():
        shutil.rmtree(PUBLIC_DIR)
    shutil.copytree(SEED_DIR, PUBLIC_DIR)
    _write_sqlite(world, investigations)


def _write_sqlite(world: dict, investigations: list[dict]) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    connection = sqlite3.connect(DB_PATH)
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE customers (
            id TEXT PRIMARY KEY, name TEXT, email TEXT, created_at TEXT,
            home_city TEXT, home_country TEXT, segment TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE accounts (
            id TEXT PRIMARY KEY, customer_id TEXT, opened_at TEXT, status TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE cards (
            id TEXT PRIMARY KEY, account_id TEXT, customer_id TEXT, last4 TEXT, brand TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE devices (
            id TEXT PRIMARY KEY, hardware TEXT, os TEXT, browser TEXT, fingerprint TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE ips (
            id TEXT PRIMARY KEY, address TEXT, city TEXT, country TEXT,
            is_datacenter INTEGER, is_vpn INTEGER
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE merchants (
            id TEXT PRIMARY KEY, name TEXT, mcc TEXT, category TEXT, country TEXT, risk_tier TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE transactions (
            id TEXT PRIMARY KEY, ts INTEGER, occurred_at TEXT, customer_id TEXT, account_id TEXT,
            card_last4 TEXT, device_id TEXT, ip_id TEXT, merchant_id TEXT, amount_paise INTEGER,
            status TEXT, type TEXT, counterparty_account_id TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE ground_truth (
            transaction_id TEXT PRIMARY KEY, is_fraud INTEGER, pattern TEXT, scenario_id TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE investigations (
            case_id TEXT PRIMARY KEY, customer_id TEXT, pattern TEXT, action TEXT,
            risk_score INTEGER, payload TEXT
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id TEXT, action TEXT, note TEXT, decided_at TEXT, source TEXT
        )
        """
    )
    cursor.executemany(
        "INSERT INTO customers VALUES (:id, :name, :email, :created_at, :home_city, :home_country, :segment)",
        world["customers"],
    )
    cursor.executemany(
        "INSERT INTO accounts VALUES (:id, :customer_id, :opened_at, :status)",
        world["accounts"],
    )
    cursor.executemany(
        "INSERT INTO cards (id, account_id, customer_id, last4, brand) VALUES (:id, :account_id, :customer_id, :last4, :brand)",
        world["cards"],
    )
    cursor.executemany(
        "INSERT INTO devices VALUES (:id, :hardware, :os, :browser, :fingerprint)",
        world["devices"],
    )
    cursor.executemany(
        "INSERT INTO ips (id, address, city, country, is_datacenter, is_vpn) VALUES (:id, :address, :city, :country, :is_datacenter, :is_vpn)",
        [
            {**row, "is_datacenter": int(row["is_datacenter"]), "is_vpn": int(row["is_vpn"])}
            for row in world["ips"]
        ],
    )
    cursor.executemany(
        "INSERT INTO merchants (id, name, mcc, category, country, risk_tier) VALUES (:id, :name, :mcc, :category, :country, :risk_tier)",
        world["merchants"],
    )
    cursor.executemany(
        """
        INSERT INTO transactions VALUES (
            :id, :ts, :occurred_at, :customer_id, :account_id, :card_last4, :device_id, :ip_id,
            :merchant_id, :amount_paise, :status, :type, :counterparty_account_id
        )
        """,
        world["transactions"],
    )
    cursor.executemany(
        "INSERT INTO ground_truth VALUES (:transaction_id, :is_fraud, :pattern, :scenario_id)",
        world["labels"],
    )
    cursor.executemany(
        "INSERT INTO investigations VALUES (?, ?, ?, ?, ?, ?)",
        [
            (
                inv["case_id"],
                inv["customer_id"],
                inv["pattern"],
                inv["action"],
                inv["risk_score"],
                json.dumps({"summary": inv["summary"], "narrative": inv["narrative"]}),
            )
            for inv in investigations
        ],
    )
    cursor.execute(
        """
        CREATE VIEW analyst_transactions AS
        SELECT id, ts, occurred_at, customer_id, account_id, card_last4, device_id,
               ip_id, merchant_id, amount_paise, status, type, counterparty_account_id
        FROM transactions
        """
    )
    connection.commit()
    connection.close()


def _print_summary(manifest: dict, metrics: dict, demo: list[dict]) -> None:
    print(f"transactions={manifest['transactions']} customers={manifest['customers']} cases={manifest['cases']} flagged={manifest['flagged_transactions']}")
    print("naive", {k: metrics["naive"][k] for k in ("tp", "fp", "tn", "fn", "precision", "recall", "fpr")})
    print("agent", {k: metrics["agent"][k] for k in ("tp", "fp", "tn", "fn", "precision", "recall", "fpr")})
    harm = metrics["customers_wrongly_blocked"]
    print("genuine blocked naive/agent/intervened", harm["naive"], harm["agent_block"], harm["agent_any_intervention"])
    print("queue", metrics["queue"])
    print("patterns", metrics["by_pattern"])
    print("reasons", metrics["flag_reason_counts"])
    for step in demo:
        print(f"demo {step['slot']} {step['case_id']} {step['customer_name']} {step['action']} {step['risk_score']} {step['summary']}")


if __name__ == "__main__":
    main()
