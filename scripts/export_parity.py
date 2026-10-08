"""Write the seed-42 ledger the TypeScript agent replays for parity.

The file is a test fixture. The browser demo does not load it.
"""

from __future__ import annotations

import json
from pathlib import Path

from engine.agent import investigate_case
from engine.flagging import build_cases, flag_transactions
from engine.generate import generate, public_world

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "fixtures" / "parity-book.json"

KEEP_TXN = (
    "id",
    "ts",
    "occurred_at",
    "customer_id",
    "account_id",
    "card_last4",
    "device_id",
    "ip_id",
    "merchant_id",
    "amount_cents",
    "status",
    "type",
    "counterparty_account_id",
)


def scrub(value):
    if isinstance(value, dict):
        return {key: scrub(item) for key, item in value.items()}
    if isinstance(value, list):
        return [scrub(item) for item in value]
    if hasattr(value, "item") and not isinstance(value, (bytes, str)):
        try:
            return value.item()
        except Exception:
            return value
    return value


def main() -> None:
    visible = public_world(generate(42))
    flagged = flag_transactions(visible, seed=42)
    cases = build_cases(visible, flagged)
    rows = []
    for case in cases:
        investigation = investigate_case(case, visible)
        rows.append(
            {
                "case": {
                    "case_id": case["case_id"],
                    "customer_id": case["customer_id"],
                    "lead_transaction_id": case["lead_transaction_id"],
                    "flagged_transaction_ids": case["flagged_transaction_ids"],
                    "covered_transaction_ids": case["covered_transaction_ids"],
                    "window_start": int(case["window_start"]),
                    "window_end": int(case["window_end"]),
                    "flag_reasons": case["flag_reasons"],
                },
                "pattern": investigation["pattern"],
                "action": investigation["action"],
            }
        )
    world = {
        "customers": [
            {
                "id": row["id"],
                "name": row["name"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "email": row["email"],
                "home_city": row["home_city"],
                "home_country": row["home_country"],
                "created_at": row["created_at"],
                "created_ts": int(row["created_ts"]),
            }
            for row in visible["customers"]
        ],
        "accounts": [
            {
                "id": row["id"],
                "customer_id": row["customer_id"],
                "opened_at": row["opened_at"],
                "opened_ts": int(row["opened_ts"]),
                "status": row["status"],
            }
            for row in visible["accounts"]
        ],
        "devices": [
            {"id": row["id"], "hardware": row["hardware"], "os": row["os"], "browser": row["browser"]}
            for row in visible["devices"]
        ],
        "ips": [
            {
                "id": row["id"],
                "address": row["address"],
                "city": row["city"],
                "country": row["country"],
                "is_datacenter": bool(row["is_datacenter"]),
                "is_vpn": bool(row["is_vpn"]),
            }
            for row in visible["ips"]
        ],
        "merchants": [
            {
                "id": row["id"],
                "name": row["name"],
                "category": row["category"],
                "city": row["city"],
                "country": row["country"],
            }
            for row in visible["merchants"]
        ],
        "transactions": [{key: scrub(row[key]) for key in KEEP_TXN} for row in visible["transactions"]],
        "enrollments": [
            {
                "customer_id": row["customer_id"],
                "device_id": row["device_id"],
                "enrolled_ts": int(row["enrolled_ts"]),
            }
            for row in visible["enrollments"]
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"world": world, "cases": rows}, separators=(",", ":")))
    print(f"wrote {OUT} cases={len(rows)} bytes={OUT.stat().st_size}")


if __name__ == "__main__":
    main()
