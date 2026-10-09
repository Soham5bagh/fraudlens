"""Markdown case files and the submission summary."""

from __future__ import annotations

from engine.textutil import money, pct, plural


def case_markdown(investigation: dict, truth: dict | None = None) -> str:
    lead = investigation["lead"]
    customer = investigation["customer"]
    lines = [
        f"# FraudLens case {investigation['case_id']}",
        "",
        f"**Customer.** {customer['name']} ({customer['id']}), {customer['home_city']}, {customer['home_country']}.",
        f"**Lead payment.** {lead['id']} · {money(lead['amount_paise'])} · {lead['merchant_name']} · {lead['occurred_at']}.",
        f"**Pattern.** {investigation['pattern_label']} ({investigation['pattern_detail'].replace('_', ' ')}).",
        f"**Risk score.** {investigation['risk_score']} / 100.",
        f"**Suggested action.** {investigation['action']} — a human still has to confirm it.",
        "",
        "## Summary",
        "",
        investigation["narrative"],
        "",
        "## Why this score",
        "",
    ]
    for signal in investigation["signals"]:
        lines.append(f"- **{signal['name']}** (+{signal['points']}): {signal['detail']}")
    lines += ["", "## What the agent checked", ""]
    for step in investigation["timeline"]:
        lines.append(f"### {step['title']} ({step['status']})")
        lines.append("")
        lines.append(step["finding"])
        lines.append("")
        for item in step["evidence"]:
            lines.append(f"- {item['label']}: {item['value']}")
        lines.append("")
    lines += ["## Payments in the episode", ""]
    lines.append("| When | Id | Amount | Status | Merchant | Device |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for txn in investigation["related_transactions"]:
        lines.append(
            f"| {txn['occurred_at']} | {txn['id']} | {money(txn['amount_paise'])} | {txn['status']} | {txn['merchant_name']} | {txn['device_id']} |"
        )
    lines += ["", "## Action rationale", "", investigation["action_rationale"], ""]
    if truth:
        lines += [
            "## Held-out label",
            "",
            "This section is joined after the investigation. The agent did not see it.",
            "",
            f"- Fraud: {'yes' if truth['is_fraud'] else 'no'}",
            f"- Pattern: {truth['pattern']}",
            "",
        ]
    lines.append("*FraudLens suggests. An analyst decides.*")
    lines.append("")
    return "\n".join(lines)


def summary_markdown(metrics: dict, meta: dict) -> str:
    naive = metrics["naive"]
    agent = metrics["agent"]
    harm = metrics["customers_wrongly_blocked"]
    lines = [
        "# FraudLens detection report",
        "",
        metrics["narrative"],
        "",
        f"Seed `{meta['seed']}`, window {meta['window_start']} to {meta['window_end']}.",
        "",
        "## Population",
        "",
        f"- Transactions: {metrics['population']['transactions']}",
        f"- Fraud transactions: {metrics['population']['fraud_transactions']}",
        f"- Legitimate transactions: {metrics['population']['legitimate_transactions']}",
        f"- Customers: {metrics['population']['customers']}",
        f"- Cases in the analyst queue: {metrics['population']['cases']}",
        "",
        "## Naive flagger vs FraudLens",
        "",
        "| | Frauds caught (recall) | Precision | False positive rate | False alarms (payments) | Genuine customers blocked |",
        "| --- | --- | --- | --- | --- | --- |",
        (
            f"| Rubber-stamp the queue | {pct(naive['recall'])} | {pct(naive['precision'])} | {pct(naive['fpr'])} | "
            f"{naive['fp']} | {harm['naive']} |"
        ),
        (
            f"| Follow FraudLens | {pct(agent['recall'])} | {pct(agent['precision'])} | {pct(agent['fpr'])} | "
            f"{agent['fp']} | {harm['agent_block']} |"
        ),
        "",
        "Caught means the suggested action is hold, escalate, or block. "
        "Genuine customers blocked counts people who have no fraudulent payments at all.",
        "",
        "### Confusion matrix (transaction level)",
        "",
        "| FraudLens | Predicted legitimate | Predicted fraud |",
        "| --- | --- | --- |",
        f"| Actually legitimate | {agent['tn']} | {agent['fp']} |",
        f"| Actually fraud | {agent['fn']} | {agent['tp']} |",
        "",
        "| Naive queue | Predicted legitimate | Predicted fraud |",
        "| --- | --- | --- |",
        f"| Actually legitimate | {naive['tn']} | {naive['fp']} |",
        f"| Actually fraud | {naive['fn']} | {naive['tp']} |",
        "",
        "## By pattern",
        "",
        "| Pattern | Fraud payments | Caught by FraudLens | Recall | Cases named correctly |",
        "| --- | --- | --- | --- | --- |",
    ]
    labels = {
        "card_testing": "Card testing",
        "account_takeover": "Account takeover",
        "mule_chain": "Mule-account chain",
        "merchant_collusion": "Merchant collusion",
    }
    for row in metrics["by_pattern"]:
        lines.append(
            f"| {labels[row['pattern']]} | {row['fraud_transactions']} | {row['caught_by_agent']} | "
            f"{pct(row['agent_recall'])} | {row['cases_named_correctly']} / {row['cases_with_pattern']} |"
        )
    lines += [
        "",
        "## Queue composition",
        "",
        f"- Fraud cases caught: {metrics['queue']['fraud_cases_caught']} / {metrics['queue']['fraud_cases']}",
        f"- Fraud cases named as the right pattern: {metrics['queue']['fraud_cases_named_correctly']} / {metrics['queue']['fraud_cases']}",
        f"- Legitimate cases approved: {metrics['queue']['legitimate_cases_approved']} / {metrics['queue']['legitimate_cases']}",
        "",
        "### Genuine customers the queue would have stopped, and FraudLens cleared",
        "",
    ]
    cleared = harm["cleared_by_agent"]
    if not cleared:
        lines.append("None.")
    else:
        for row in cleared:
            lines.append(
                f"- {row['name']} ({row['customer_id']}), {plural(row['payments'], 'queued payment')}"
            )
    examples = metrics.get("false_alarm_examples") or []
    if examples:
        lines += ["", "### False alarms on this seed", ""]
        for example in examples:
            lines.append(_false_alarm_sentence(f"Seed `{meta['seed']}`", example))
    robustness = metrics.get("robustness")
    if robustness:
        lines += [
            "",
            "## Other seeds",
            "",
            robustness["note"],
            "",
            "| Seed | Agent recall | Agent precision | False alarms | Genuine customers blocked | Fraud cases named | Legitimate cases approved |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
        for row in robustness["seeds"]:
            lines.append(
                f"| {row['seed']} | {pct(row['agent_recall'])} | {pct(row['agent_precision'])} | {row['agent_false_alarms']} | "
                f"{row['genuine_blocked_by_agent']} (queue would block {row['genuine_blocked_by_queue']}) | "
                f"{row['fraud_cases_named_correctly']} / {row['fraud_cases']} | "
                f"{row['legitimate_cases_approved']} / {row['legitimate_cases']} |"
            )
        lines.append("")
        for row in robustness["seeds"]:
            for example in row.get("false_alarm_examples") or []:
                lines.append(_false_alarm_sentence(f"Seed {row['seed']}", example))
        lines += ["", robustness["limitations"], ""]
    lines += [
        "",
        "## How to read this",
        "",
        "The flagger is a wide net: velocity, amount, new device, foreign IP, shared device, young accounts, and an Isolation Forest. "
        "FraudLens re-investigates each case with history, a money-flow graph, and merchant checks, then suggests an action. "
        "It never blocks anyone by itself.",
        "",
    ]
    return "\n".join(lines)


def _false_alarm_sentence(prefix: str, example: dict) -> str:
    return (
        f"{prefix} counts {example['transaction_id']} "
        f"({money(example['amount_paise'])} at {example['merchant_name']}, {example['customer_name']}) "
        f"with {example['case_id']} ({example['predicted_pattern'].replace('_', ' ')}). "
        "The payment is legitimate and sits inside that case's time window, so it is scored with the case."
    )
