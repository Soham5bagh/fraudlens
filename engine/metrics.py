"""Score the agent against held-out labels, and against the flagger alone.

A fraud is "caught" when the action is hold, escalate, or block. Approve means
the customer is left alone. The naive desk blocks every flagged transaction.
"""

from __future__ import annotations

from collections import Counter, defaultdict

POSITIVE = {"hold", "escalate", "block"}
PATTERNS = ("card_testing", "account_takeover", "mule_chain", "merchant_collusion")


def compute_metrics(world: dict, flagged: list[dict], investigations: list[dict], cases: list[dict]) -> dict:
    labels = {row["transaction_id"]: row for row in world["labels"]}
    txns = world["transactions"]
    customers = {row["id"]: row for row in world["customers"]}
    flagged_ids = {row["transaction_id"] for row in flagged}

    agent_action_by_txn: dict[str, str] = {}
    case_by_id = {case["case_id"]: case for case in cases}
    for investigation in investigations:
        action = investigation["action"]
        for txn_id in investigation["covered_transaction_ids"]:
            # If two cases overlap, keep the stricter action.
            previous = agent_action_by_txn.get(txn_id)
            agent_action_by_txn[txn_id] = _stricter(previous, action)

    def score(predicted_positive: set[str]) -> dict:
        tp = fp = tn = fn = 0
        for txn in txns:
            truth = bool(labels[txn["id"]]["is_fraud"])
            pred = txn["id"] in predicted_positive
            if truth and pred:
                tp += 1
            elif truth and not pred:
                fn += 1
            elif not truth and pred:
                fp += 1
            else:
                tn += 1
        return _rates(tp, fp, tn, fn)

    naive_positive = set(flagged_ids)
    agent_positive = {txn_id for txn_id, action in agent_action_by_txn.items() if action in POSITIVE}
    # Frauds the agent never saw stay misses. Approvals are not positives.
    naive = score(naive_positive)
    agent = score(agent_positive)

    def genuine_customers(positive_ids: set[str]) -> list[dict]:
        fraud_customers = {
            txn["customer_id"]
            for txn in txns
            if labels[txn["id"]]["is_fraud"]
        }
        hit: dict[str, int] = defaultdict(int)
        for txn in txns:
            if txn["id"] in positive_ids and txn["customer_id"] not in fraud_customers:
                hit[txn["customer_id"]] += 1
        rows = []
        for customer_id, count in sorted(hit.items()):
            rows.append(
                {
                    "customer_id": customer_id,
                    "name": customers[customer_id]["name"],
                    "payments": count,
                }
            )
        return rows

    naive_blocked_customers = genuine_customers(naive_positive)
    agent_block_ids = {txn_id for txn_id, action in agent_action_by_txn.items() if action == "block"}
    agent_intervention_ids = set(agent_positive)
    agent_blocked_customers = genuine_customers(agent_block_ids)
    agent_intervened_customers = genuine_customers(agent_intervention_ids)

    saved = []
    intervened_ids = {row["customer_id"] for row in agent_intervened_customers}
    for row in naive_blocked_customers:
        if row["customer_id"] not in intervened_ids:
            saved.append(row)

    by_pattern = []
    for pattern in PATTERNS:
        ids = [txn["id"] for txn in txns if labels[txn["id"]]["pattern"] == pattern]
        caught = [txn_id for txn_id in ids if txn_id in agent_positive]
        flagged_pattern = [txn_id for txn_id in ids if txn_id in naive_positive]
        named = _cases_named(pattern, investigations, labels)
        by_pattern.append(
            {
                "pattern": pattern,
                "fraud_transactions": len(ids),
                "flagged_by_naive": len(flagged_pattern),
                "caught_by_agent": len(caught),
                "naive_recall": _div(len(flagged_pattern), len(ids)),
                "agent_recall": _div(len(caught), len(ids)),
                "cases_with_pattern": named["cases"],
                "cases_named_correctly": named["correct"],
            }
        )

    reason_counts: Counter[str] = Counter()
    for item in flagged:
        for reason in item["reasons"]:
            reason_counts[reason] += 1

    queue_actions: Counter[str] = Counter(inv["action"] for inv in investigations)
    queue_patterns: Counter[str] = Counter(inv["pattern"] for inv in investigations)

    true_case_rows = []
    correct_pattern = 0
    fraud_cases = 0
    fraud_cases_caught = 0
    legit_cases = 0
    legit_cases_approved = 0
    for investigation in investigations:
        truth = _case_truth(investigation, labels)
        true_case_rows.append({"case_id": investigation["case_id"], **truth, "predicted": investigation["pattern"], "action": investigation["action"]})
        if truth["is_fraud"]:
            fraud_cases += 1
            if investigation["action"] in POSITIVE and investigation["pattern"] == truth["pattern"]:
                correct_pattern += 1
            if investigation["action"] in POSITIVE:
                fraud_cases_caught += 1
        else:
            legit_cases += 1
            if investigation["action"] == "approve":
                legit_cases_approved += 1

    narrative = (
        f"The flagger queued {naive['predicted_positive']} payments, catching "
        f"{naive['recall']:.0%} of fraud transactions and also pulling in "
        f"{len(naive_blocked_customers)} genuine customers. "
        f"FraudLens, reviewing only that queue, caught {agent['recall']:.0%} of fraud transactions "
        f"at {agent['precision']:.0%} precision and would have blocked "
        f"{len(agent_blocked_customers)} genuine customers. "
        f"It cleared {len(saved)} genuine customers the queue would otherwise have stopped."
    )

    return {
        "population": {
            "transactions": len(txns),
            "fraud_transactions": sum(1 for row in labels.values() if row["is_fraud"]),
            "legitimate_transactions": sum(1 for row in labels.values() if not row["is_fraud"]),
            "customers": len(customers),
            "cases": len(investigations),
        },
        "naive": naive,
        "agent": agent,
        "customers_wrongly_blocked": {
            "naive": len(naive_blocked_customers),
            "agent_block": len(agent_blocked_customers),
            "agent_any_intervention": len(agent_intervened_customers),
            "naive_customers": naive_blocked_customers,
            "agent_block_customers": agent_blocked_customers,
            "agent_intervention_customers": agent_intervened_customers,
            "cleared_by_agent": saved,
        },
        "by_pattern": by_pattern,
        "flag_reason_counts": dict(reason_counts),
        "queue": {
            "cases": len(investigations),
            "by_action": dict(queue_actions),
            "by_pattern": dict(queue_patterns),
            "fraud_cases": fraud_cases,
            "fraud_cases_caught": fraud_cases_caught,
            "fraud_cases_named_correctly": correct_pattern,
            "legitimate_cases": legit_cases,
            "legitimate_cases_approved": legit_cases_approved,
        },
        "case_truth": true_case_rows,
        "narrative": narrative,
        "case_ids_in_flag_order": [case["case_id"] for case in cases],
    }


def _case_truth(investigation: dict, labels: dict) -> dict:
    fraud_patterns = [
        labels[txn_id]["pattern"]
        for txn_id in investigation["covered_transaction_ids"]
        if txn_id in labels and labels[txn_id]["is_fraud"]
    ]
    if not fraud_patterns:
        return {"is_fraud": False, "pattern": "legitimate"}
    pattern, _ = Counter(fraud_patterns).most_common(1)[0]
    return {"is_fraud": True, "pattern": pattern}


def _cases_named(pattern: str, investigations: list[dict], labels: dict) -> dict:
    cases = 0
    correct = 0
    for investigation in investigations:
        truth = _case_truth(investigation, labels)
        if truth["is_fraud"] and truth["pattern"] == pattern:
            cases += 1
            if investigation["pattern"] == pattern:
                correct += 1
    return {"cases": cases, "correct": correct}


def _stricter(previous: str | None, new: str) -> str:
    rank = {"approve": 0, "hold": 1, "escalate": 2, "block": 3}
    if previous is None or rank[new] > rank[previous]:
        return new
    return previous


def _div(num: int, den: int) -> float:
    if den == 0:
        return 0.0
    return round(num / den, 4)


def _rates(tp: int, fp: int, tn: int, fn: int) -> dict:
    precision = _div(tp, tp + fp)
    recall = _div(tp, tp + fn)
    fpr = _div(fp, fp + tn)
    f1 = round(2 * precision * recall / (precision + recall), 4) if precision + recall else 0.0
    return {
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "fpr": fpr,
        "f1": f1,
        "predicted_positive": tp + fp,
        "predicted_negative": tn + fn,
    }
