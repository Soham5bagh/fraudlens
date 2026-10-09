"""Queue builder: blunt rules plus an Isolation Forest.

The flagger is intentionally generous. It would rather bother an analyst with
an honest traveler than miss a burst. Precision is the agent's job.
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np
from sklearn.ensemble import IsolationForest

REASON_TEXT = {
    "velocity_1h": "Five or more payments in the past hour",
    "amount_outlier": "Amount is far above this customer's own baseline",
    "new_device": "Device has never been used by this customer before",
    "foreign_ip": "IP country does not match the customer's home country",
    "shared_device": "Device is already linked to a different customer",
    "new_account_amount": "Account is under 30 days old and the amount is large",
    "isolation_forest": "The payment's shape is an outlier for the whole book",
}


def _median(values: list[int]) -> float:
    if not values:
        return 0.0
    return float(np.median(np.array(values, dtype=float)))


def flag_transactions(world: dict, seed: int = 42) -> list[dict]:
    customers = {row["id"]: row for row in world["customers"]}
    accounts = {row["id"]: row for row in world["accounts"]}
    ips = {row["id"]: row for row in world["ips"]}
    txns = sorted(world["transactions"], key=lambda row: (row["ts"], row["id"]))

    seen_devices: dict[str, set[str]] = defaultdict(set)
    device_customers: dict[str, set[str]] = defaultdict(set)
    enrolled: dict[str, set[str]] = defaultdict(set)
    for row in world.get("enrollments", []):
        enrolled[row["customer_id"]].add(row["device_id"])
    prior_amounts: dict[str, list[int]] = defaultdict(list)
    customer_times: dict[str, list[int]] = defaultdict(list)

    features: list[list[float]] = []
    prepared: list[dict] = []

    for txn in txns:
        customer = customers[txn["customer_id"]]
        account = accounts[txn["account_id"]]
        ip = ips[txn["ip_id"]]
        times = customer_times[txn["customer_id"]]
        vel_1h = 1 + sum(1 for ts in times if txn["ts"] - ts <= 3600)
        vel_24h = 1 + sum(1 for ts in times if txn["ts"] - ts <= 86400)
        history = prior_amounts[txn["customer_id"]]
        median = _median(history[-40:]) if len(history) >= 5 else float(median_fallback(history))
        ratio = (txn["amount_paise"] / median) if median else float(txn["amount_paise"])
        known = seen_devices[txn["customer_id"]]
        on_profile = txn["device_id"] in enrolled[txn["customer_id"]]
        # A phone already saved on the profile is not "new", even on its first payment.
        is_new_device = (not on_profile) and txn["device_id"] not in known and bool(known)
        is_foreign = ip["country"] != customer["home_country"]
        age_days = max(0.0, (txn["ts"] - account["opened_ts"]) / 86400)
        others = device_customers[txn["device_id"]] - {txn["customer_id"]}
        is_link = bool(others)

        reasons: list[str] = []
        if vel_1h >= 5:
            reasons.append("velocity_1h")
        if len(history) >= 5 and txn["amount_paise"] > max(1_600_000, 6 * median):
            reasons.append("amount_outlier")
        if is_new_device:
            reasons.append("new_device")
        if is_foreign:
            reasons.append("foreign_ip")
        if is_link:
            reasons.append("shared_device")
        if age_days < 30 and txn["amount_paise"] >= 800_000:
            reasons.append("new_account_amount")

        features.append(
            [
                float(np.log1p(txn["amount_paise"])),
                float(vel_1h),
                float(vel_24h),
                float(min(ratio, 50)),
                1.0 if is_new_device else 0.0,
                1.0 if is_foreign else 0.0,
                float(min(age_days, 2000)),
                1.0 if txn["status"] == "declined" else 0.0,
            ]
        )
        prepared.append(
            {
                "txn": txn,
                "reasons": reasons,
                "vel_1h": vel_1h,
                "ratio": ratio,
                "is_new_device": is_new_device,
                "is_foreign": is_foreign,
                "age_days": age_days,
                "amount": txn["amount_paise"],
            }
        )
        times.append(txn["ts"])
        history.append(txn["amount_paise"])
        known.add(txn["device_id"])
        device_customers[txn["device_id"]].add(txn["customer_id"])

    model = IsolationForest(
        n_estimators=80,
        contamination=0.02,
        random_state=seed,
        n_jobs=1,
    )
    matrix = np.array(features, dtype=float)
    predictions = model.fit_predict(matrix)
    scores = model.decision_function(matrix)

    flagged: list[dict] = []
    for row, prediction, score in zip(prepared, predictions, scores):
        reasons = list(row["reasons"])
        companion = (
            row["vel_1h"] >= 4
            or row["ratio"] >= 5
            or row["is_new_device"]
            or row["is_foreign"]
            or (row["age_days"] < 30 and row["amount"] >= 800_000)
        )
        # The forest may be the only reason on a sharp spike the amount rule missed.
        # Organic tickets are capped at ₹12,800, so this does not sweep everyday spend.
        sole = prediction == -1 and row["ratio"] >= 8 and row["amount"] >= 1_800_000
        if prediction == -1 and (companion or sole):
            if "isolation_forest" not in reasons:
                reasons.append("isolation_forest")
        if not reasons:
            continue
        if reasons == ["isolation_forest"] and not sole:
            continue
        txn = row["txn"]
        flagged.append(
            {
                "transaction_id": txn["id"],
                "customer_id": txn["customer_id"],
                "ts": txn["ts"],
                "amount_paise": txn["amount_paise"],
                "reasons": reasons,
                "isolation_score": float(score),
            }
        )
    return flagged


def median_fallback(history: list[int]) -> float:
    if not history:
        return 0.0
    return float(np.median(np.array(history, dtype=float)))


def build_cases(world: dict, flagged: list[dict]) -> list[dict]:
    """Collapse nearby flags on the same customer into one analyst case."""
    by_customer: dict[str, list[dict]] = defaultdict(list)
    for item in sorted(flagged, key=lambda row: (row["ts"], row["transaction_id"])):
        by_customer[item["customer_id"]].append(item)

    txns_by_customer: dict[str, list[dict]] = defaultdict(list)
    txn_by_id = {row["id"]: row for row in world["transactions"]}
    for txn in world["transactions"]:
        txns_by_customer[txn["customer_id"]].append(txn)

    clusters: list[list[dict]] = []
    for items in by_customer.values():
        current: list[dict] = []
        for item in items:
            if current and item["ts"] - current[-1]["ts"] <= 18 * 3600:
                current.append(item)
            else:
                if current:
                    clusters.append(current)
                current = [item]
        if current:
            clusters.append(current)

    cases: list[dict] = []
    for cluster in clusters:
        lead_flag = max(cluster, key=lambda item: (item["amount_paise"], item["ts"], item["transaction_id"]))
        start = cluster[0]["ts"]
        end = cluster[-1]["ts"]
        customer_id = lead_flag["customer_id"]
        covered = [
            txn["id"]
            for txn in txns_by_customer[customer_id]
            if start - 3600 <= txn["ts"] <= end + 900
        ]
        reason_union: list[str] = []
        for item in cluster:
            for reason in item["reasons"]:
                if reason not in reason_union:
                    reason_union.append(reason)
        lead = txn_by_id[lead_flag["transaction_id"]]
        cases.append(
            {
                "customer_id": customer_id,
                "lead_transaction_id": lead["id"],
                "flagged_transaction_ids": [item["transaction_id"] for item in cluster],
                "covered_transaction_ids": covered,
                "window_start": start,
                "window_end": end,
                "flag_reasons": reason_union,
                "lead_reasons": lead_flag["reasons"],
            }
        )

    cases.sort(key=lambda case: (txn_by_id[case["lead_transaction_id"]]["ts"], case["lead_transaction_id"]))
    for index, case in enumerate(cases, start=1):
        case["case_id"] = f"case_{index:04d}"
    return cases
