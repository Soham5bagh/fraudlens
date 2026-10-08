"""Score books other than the demo seed.

These seeds are not used to pick showcase cases. The numbers are reported
as they come out, including any miss.
"""

from __future__ import annotations

from engine.agent import investigate_case
from engine.flagging import build_cases, flag_transactions
from engine.generate import generate, public_world
from engine.metrics import POSITIVE, compute_metrics

HOLDOUT_SEEDS = (7, 99, 123)

NOTE = (
    "Seeds 7, 99, and 123 were not used to write the demo. "
    "Each one replants the same four patterns and the same kinds of honest traps, with different customers and amounts."
)

LIMITATIONS = (
    "High scores are expected: the fraud is planted with sharp signatures, and the honest traps are planted too. "
    "This is not a claim about a live payments book. A normal purchase can also fall inside an attack's time window "
    "and be counted with it. The agent never sees the labels. Production fraud is fuzzier, and these checks would need to be retuned on real outcomes."
)


def run_seed(seed: int) -> dict:
    world = generate(seed)
    visible = public_world(world)
    flagged = flag_transactions(visible, seed=seed)
    cases = build_cases(visible, flagged)
    investigations = [investigate_case(case, visible) for case in cases]
    metrics = compute_metrics(world, flagged, investigations, cases)
    harm = metrics["customers_wrongly_blocked"]
    alarms = _false_alarms(world, investigations)
    return {
        "seed": seed,
        "transactions": metrics["population"]["transactions"],
        "fraud_transactions": metrics["population"]["fraud_transactions"],
        "cases": metrics["population"]["cases"],
        "naive_precision": metrics["naive"]["precision"],
        "naive_recall": metrics["naive"]["recall"],
        "naive_false_alarms": metrics["naive"]["fp"],
        "agent_precision": metrics["agent"]["precision"],
        "agent_recall": metrics["agent"]["recall"],
        "agent_false_alarms": metrics["agent"]["fp"],
        "genuine_blocked_by_queue": harm["naive"],
        "genuine_blocked_by_agent": harm["agent_block"],
        "fraud_cases": metrics["queue"]["fraud_cases"],
        "fraud_cases_named_correctly": metrics["queue"]["fraud_cases_named_correctly"],
        "legitimate_cases": metrics["queue"]["legitimate_cases"],
        "legitimate_cases_approved": metrics["queue"]["legitimate_cases_approved"],
        "false_alarm_examples": alarms,
        "patterns": [
            {
                "pattern": row["pattern"],
                "recall": row["agent_recall"],
                "named": row["cases_named_correctly"],
                "cases": row["cases_with_pattern"],
            }
            for row in metrics["by_pattern"]
        ],
    }


def _false_alarms(world: dict, investigations: list[dict]) -> list[dict]:
    """Legitimate payments covered by a non-approve case. Reported, not hidden."""
    labels = {row["transaction_id"]: row for row in world["labels"]}
    txns = {txn["id"]: txn for txn in world["transactions"]}
    merchants = {row["id"]: row for row in world["merchants"]}
    examples = []
    for investigation in investigations:
        if investigation["action"] not in POSITIVE:
            continue
        for txn_id in investigation["covered_transaction_ids"]:
            if labels[txn_id]["is_fraud"]:
                continue
            txn = txns[txn_id]
            merchant = merchants.get(txn["merchant_id"])
            examples.append(
                {
                    "transaction_id": txn_id,
                    "amount_cents": txn["amount_cents"],
                    "merchant_name": merchant["name"] if merchant else "peer-to-peer transfer",
                    "case_id": investigation["case_id"],
                    "predicted_pattern": investigation["pattern"],
                    "customer_name": investigation["customer"]["name"],
                }
            )
    examples.sort(key=lambda row: row["transaction_id"])
    return examples


def robustness_report(seeds: tuple[int, ...] = HOLDOUT_SEEDS) -> dict:
    return {
        "note": NOTE,
        "limitations": LIMITATIONS,
        "seeds": [run_seed(seed) for seed in seeds],
    }
