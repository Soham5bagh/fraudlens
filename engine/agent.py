"""Deterministic fraud investigator, run as a LangGraph state graph.

Each analyst step is a node. A node reads the ledger, appends one timeline
entry, and merges its facts into the shared state. After the money-flow node
the graph routes card purchases to the merchant check and transfers to the
transfer check. NetworkX does the money-flow math inside the network node.

Nothing in this module reads ground-truth labels. If an LLM key is set,
`polish_narrative` may rewrite the prose; the decision, score, and evidence
stay put.
"""

from __future__ import annotations

import operator
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Callable, TypedDict

import networkx as nx
from langgraph.graph import END, START, StateGraph

from engine.catalog import Catalog
from engine.flagging import REASON_TEXT
from engine.textutil import clock, iso, minutes_between, money, plural, short_clock, whole_rupees

# 10:00 IST on the morning after the book closes.
REVIEW_CLOCK = datetime(2026, 8, 11, 4, 30, tzinfo=timezone.utc)

# Amounts are paise. A round amount is a whole multiple of ₹1,000, and at least ₹8,000.
ROUND_PAISE = 100_000
ROUND_FLOOR_PAISE = 800_000

TRAVEL_CATEGORIES = {"airline", "hotel", "transit", "restaurant"}
RISKY_CATEGORIES = {"gift_card", "crypto", "electronics", "wire"}

PATTERN_LABELS = {
    "card_testing": "Card testing",
    "account_takeover": "Account takeover",
    "mule_chain": "Mule-account chain",
    "merchant_collusion": "Merchant collusion",
    "legitimate": "Legitimate activity",
}


class InvestigationState(TypedDict):
    case: dict
    catalog: Any
    clock: datetime
    timeline: Annotated[list[dict], operator.add]
    facts: dict


def investigate_case(case: dict, world: dict) -> dict:
    # The desk reviews the queue the morning after the book closes, so device
    # links and merchant history include payments that posted later that week.
    # Baseline and the episode itself are still cut on the case window.
    as_of = max(txn["ts"] for txn in world["transactions"])
    catalog = Catalog(world, as_of_ts=as_of)
    enrolled = {
        row["device_id"]
        for row in world.get("enrollments", [])
        if row["customer_id"] == case["customer_id"] and row["enrolled_ts"] < case["window_start"]
    }
    final = investigation_graph().invoke(
        {
            "case": case,
            "catalog": catalog,
            "clock": REVIEW_CLOCK,
            "timeline": [],
            "facts": {"enrolled_devices": enrolled},
        }
    )
    return assemble(final)


def _node(step: Callable[[dict], None]) -> Callable[[InvestigationState], dict]:
    """Run an analyst step on a private copy of the state and return only what it changed."""

    def run(state: InvestigationState) -> dict:
        scratch = {
            "case": state["case"],
            "catalog": state["catalog"],
            "clock": state["clock"],
            "timeline": [],
            "facts": dict(state["facts"]),
        }
        step(scratch)
        return {"clock": scratch["clock"], "timeline": scratch["timeline"], "facts": scratch["facts"]}

    run.__name__ = step.__name__
    return run


def _route_after_network(state: InvestigationState) -> str:
    lead = state["facts"]["lead"]
    return "merchant" if state["catalog"].merchant(lead["merchant_id"]) else "transfer"


_GRAPH = None


def investigation_graph():
    """The compiled LangGraph. Built once, reused for every case."""
    global _GRAPH
    if _GRAPH is not None:
        return _GRAPH
    steps = [
        ("open_case", open_case),
        ("customer_baseline", customer_baseline),
        ("velocity", velocity_check),
        ("amount", amount_analysis),
        ("device_ip", device_and_ip),
        ("network", linked_accounts),
        ("merchant", merchant_check),
        ("transfer", transfer_check),
        ("classify", classify),
        ("recommend", recommend),
    ]
    graph = StateGraph(InvestigationState)
    for name, step in steps:
        graph.add_node(name, _node(step))
    graph.add_edge(START, "open_case")
    graph.add_edge("open_case", "customer_baseline")
    graph.add_edge("customer_baseline", "velocity")
    graph.add_edge("velocity", "amount")
    graph.add_edge("amount", "device_ip")
    graph.add_edge("device_ip", "network")
    graph.add_conditional_edges("network", _route_after_network, {"merchant": "merchant", "transfer": "transfer"})
    graph.add_edge("merchant", "classify")
    graph.add_edge("transfer", "classify")
    graph.add_edge("classify", "recommend")
    graph.add_edge("recommend", END)
    _GRAPH = graph.compile()
    return _GRAPH


def graph_mermaid() -> str:
    return investigation_graph().get_graph().draw_mermaid()


def _step(state: dict, step_id: str, title: str, status: str, finding: str, evidence: list[dict], duration_ms: int) -> None:
    started = state["clock"]
    state["timeline"].append(
        {
            "id": step_id,
            "title": title,
            "status": status,
            "started_at": iso(started),
            "duration_ms": duration_ms,
            "finding": finding,
            "evidence": evidence,
        }
    )
    state["clock"] = started + timedelta(milliseconds=duration_ms + 350)


def _episode(state: dict) -> list[dict]:
    catalog: Catalog = state["catalog"]
    case = state["case"]
    return [
        txn
        for txn in catalog.by_customer[case["customer_id"]]
        if case["window_start"] - 3600 <= txn["ts"] <= case["window_end"] + 900
    ]


def _baseline(state: dict) -> list[dict]:
    catalog: Catalog = state["catalog"]
    case = state["case"]
    return [
        txn
        for txn in catalog.by_customer[case["customer_id"]]
        if txn["ts"] < case["window_start"] - 3600
    ]


def open_case(state: dict) -> None:
    catalog: Catalog = state["catalog"]
    case = state["case"]
    lead = next(txn for txn in catalog.txns if txn["id"] == case["lead_transaction_id"])
    customer = catalog.customer(case["customer_id"])
    merchant = catalog.merchant(lead["merchant_id"])
    merchant_name = merchant["name"] if merchant else "UPI transfer"
    reasons = [REASON_TEXT[code] for code in case["flag_reasons"]]
    state["facts"]["lead"] = lead
    state["facts"]["customer"] = customer
    state["facts"]["merchant_name"] = merchant_name
    _step(
        state,
        "open_case",
        "Open the flagged payment",
        "watch",
        (
            f"Queue sent {lead['id']} for {customer['name']}: {money(lead['amount_paise'])} "
            f"{_where(merchant)} on {clock(lead['ts'])}. "
            f"The flagger's reasons were: {'; '.join(reasons)}."
        ),
        [
            {"label": "Transaction", "value": lead["id"]},
            {"label": "Amount", "value": money(lead["amount_paise"])},
            {"label": "Customer", "value": f"{customer['name']} ({customer['id']})"},
            {"label": "Why it was queued", "value": ", ".join(case["flag_reasons"])},
        ],
        420,
    )


def customer_baseline(state: dict) -> None:
    catalog: Catalog = state["catalog"]
    customer = state["facts"]["customer"]
    account = catalog.account_for_customer(customer["id"])
    baseline = _baseline(state)
    lead = state["facts"]["lead"]
    amounts = [txn["amount_paise"] for txn in baseline if txn["status"] == "approved"]
    median = int(np_median(amounts)) if amounts else 0
    age_days = max(0, int((lead["ts"] - account["opened_ts"]) / 86400))
    devices = sorted({txn["device_id"] for txn in baseline})
    countries = sorted({catalog.ips[txn["ip_id"]]["country"] for txn in baseline})
    state["facts"].update(
        {
            "account": account,
            "baseline": baseline,
            "baseline_median": median,
            "baseline_count": len(baseline),
            "account_age_days": age_days,
            "baseline_devices": devices,
            "baseline_countries": countries,
        }
    )
    if baseline:
        finding = (
            f"{customer['name']} has {plural(len(baseline), 'prior payment')} before this episode, "
            f"median {money(median)}. Account {account['id']} is {plural(age_days, 'day')} old. "
            f"Usual devices: {', '.join(devices)}. Countries already seen: {', '.join(countries) or 'none'}."
        )
        status = "clear"
    else:
        finding = (
            f"{customer['name']} has no payments before this episode. "
            f"Account {account['id']} was opened {plural(age_days, 'day')} ago, so there is no personal baseline to lean on."
        )
        status = "watch"
    _step(
        state,
        "customer_baseline",
        "Customer history and baseline",
        status,
        finding,
        [
            {"label": "Account age", "value": plural(age_days, "day")},
            {"label": "Prior payments", "value": str(len(baseline))},
            {"label": "Median amount", "value": money(median) if median else "no baseline"},
            {"label": "Home", "value": f"{customer['home_city']}, {customer['home_country']}"},
        ],
        680,
    )


def velocity_check(state: dict) -> None:
    episode = _episode(state)
    lead = state["facts"]["lead"]
    in_hour = [txn for txn in episode if 0 <= lead["ts"] - txn["ts"] <= 3600 or 0 <= txn["ts"] - lead["ts"] <= 3600]
    # Velocity is "how fast is this episode", measured on the densest hour inside it.
    peak = 1
    peak_txns = [lead]
    for txn in episode:
        window = [other for other in episode if 0 <= other["ts"] - txn["ts"] <= 3600]
        if len(window) > peak:
            peak = len(window)
            peak_txns = window
    declines = [txn for txn in episode if txn["status"] == "declined"]
    span = minutes_between(episode[0]["ts"], episode[-1]["ts"]) if episode else 0
    merchants = []
    for txn in episode:
        merchant = state["catalog"].merchant(txn["merchant_id"])
        name = merchant["name"] if merchant else "UPI transfer"
        if name not in merchants:
            merchants.append(name)
    state["facts"].update(
        {
            "episode": episode,
            "peak_velocity": peak,
            "decline_count": len(declines),
            "span_minutes": span,
            "episode_merchants": merchants,
            "episode_amounts": [txn["amount_paise"] for txn in episode],
        }
    )
    status = "alert" if peak >= 5 or len(declines) >= 3 else "clear"
    _step(
        state,
        "velocity",
        "Payment velocity",
        status,
        (
            f"The episode around {lead['id']} holds {plural(len(episode), 'payment')} "
            f"across {plural(span, 'minute')}. The busiest hour contains {plural(peak, 'payment')}. "
            f"{plural(len(declines), 'decline')} in the episode. "
            f"Merchants touched: {_name_list(merchants)}."
        ),
        [
            {"label": "Payments in episode", "value": str(len(episode))},
            {"label": "Busiest hour", "value": str(peak)},
            {"label": "Declines", "value": str(len(declines))},
            {"label": "Distinct merchants", "value": str(len(merchants))},
        ],
        540,
    )


def amount_analysis(state: dict) -> None:
    amounts = state["facts"]["episode_amounts"]
    median = state["facts"]["baseline_median"]
    episode_median = int(np_median(amounts)) if amounts else 0
    peak = max(amounts) if amounts else 0
    ratio = (peak / median) if median else None
    state["facts"]["episode_median"] = episode_median
    state["facts"]["episode_peak"] = peak
    state["facts"]["peak_ratio"] = ratio
    if median and ratio and ratio >= 4:
        status = "alert"
        relation = f"{ratio:.1f}× the baseline median of {money(median)}"
    elif median:
        status = "clear"
        relation = f"in line with a baseline median of {money(median)} (peak is {ratio:.1f}×)"
    else:
        status = "watch"
        relation = "no baseline median to compare against"
    _step(
        state,
        "amount",
        "Amount versus baseline",
        status,
        (
            f"Episode amounts run from {money(min(amounts))} to {money(peak)}, "
            f"median {money(episode_median)}. The peak is {relation}."
        ),
        [
            {"label": "Episode median", "value": money(episode_median)},
            {"label": "Episode peak", "value": money(peak)},
            {"label": "Baseline median", "value": money(median) if median else "none"},
            {"label": "Peak vs baseline", "value": f"{ratio:.1f}×" if ratio else "n/a"},
        ],
        480,
    )


def device_and_ip(state: dict) -> None:
    catalog: Catalog = state["catalog"]
    episode = state["facts"]["episode"]
    baseline_devices = set(state["facts"]["baseline_devices"])
    customer = state["facts"]["customer"]
    enrolled = set(state["facts"].get("enrolled_devices", set()))
    new_devices = []
    countries = []
    datacenter = False
    vpn = False
    evidence = []
    for txn in episode:
        fresh = txn["device_id"] not in baseline_devices and txn["device_id"] not in enrolled
        if fresh and txn["device_id"] not in new_devices:
            new_devices.append(txn["device_id"])
        ip = catalog.ips[txn["ip_id"]]
        label = f"{ip['country']}"
        if label not in countries:
            countries.append(label)
        datacenter = datacenter or bool(ip["is_datacenter"])
        vpn = vpn or bool(ip["is_vpn"])
    foreign = any(country != customer["home_country"] for country in countries)
    # A device is "known" only if the customer used it at least a week before the episode.
    week_before = state["case"]["window_start"] - 7 * 86400
    mature_devices = {
        txn["device_id"]
        for txn in state["facts"]["baseline"]
        if txn["ts"] <= week_before
    }
    episode_devices = []
    for txn in episode:
        if txn["device_id"] not in episode_devices:
            episode_devices.append(txn["device_id"])
    known_mature = [device_id for device_id in episode_devices if device_id in mature_devices]
    state["facts"].update(
        {
            "new_devices": new_devices,
            "episode_devices": episode_devices,
            "known_mature_devices": known_mature,
            "episode_countries": countries,
            "foreign": foreign,
            "datacenter": datacenter,
            "vpn": vpn,
        }
    )
    if new_devices and foreign:
        status = "alert"
    elif new_devices or foreign:
        status = "watch"
    else:
        status = "clear"
    device_bits = []
    for device_id in episode_devices:
        marker = "new to this customer" if device_id in new_devices else "already on file"
        device_bits.append(f"{device_id} ({catalog.device_label(device_id)}, {marker})")
    ip_bits = sorted({catalog.ip_label(txn["ip_id"]) for txn in episode})
    _step(
        state,
        "device_ip",
        "Device and IP linkage",
        status,
        (
            f"Devices in the episode: {'; '.join(device_bits)}. "
            f"IPs: {'; '.join(ip_bits)}. "
            + _country_sentence(customer["home_country"], countries, foreign)
        ),
        [
            {"label": "New devices", "value": ", ".join(new_devices) if new_devices else "none"},
            {"label": "Mature devices reused", "value": ", ".join(known_mature) if known_mature else "none"},
            {"label": "Countries", "value": ", ".join(countries)},
            {"label": "Datacenter or VPN", "value": "yes" if datacenter or vpn else "no"},
        ],
        730,
    )


def linked_accounts(state: dict) -> None:
    catalog: Catalog = state["catalog"]
    customer = state["facts"]["customer"]
    account = state["facts"]["account"]
    episode_devices = state["facts"]["episode_devices"]
    linked: list[dict] = []
    for device_id in episode_devices:
        for other_id in catalog.customers_on_device(device_id):
            if other_id == customer["id"]:
                continue
            other = catalog.customer(other_id)
            linked.append(
                {
                    "customer_id": other_id,
                    "name": other["name"],
                    "last_name": other["last_name"],
                    "city": other["home_city"],
                    "country": other["home_country"],
                    "device_id": device_id,
                }
            )
    # Unique by customer, keep the first device that tied them.
    deduped: list[dict] = []
    seen: set[str] = set()
    for item in linked:
        if item["customer_id"] in seen:
            continue
        seen.add(item["customer_id"])
        deduped.append(item)

    graph = nx.DiGraph()
    window_start = state["case"]["window_end"] - 6 * 86400
    edges = []
    for txn in catalog.txns:
        if txn["ts"] < window_start:
            continue
        if txn["type"] == "p2p_out" and txn["counterparty_account_id"]:
            graph.add_edge(
                txn["account_id"],
                txn["counterparty_account_id"],
                kind="p2p",
                amount=txn["amount_paise"],
                txn_id=txn["id"],
            )
            edges.append(txn)
        elif txn["type"] == "cash_out":
            node = f"cash:{txn['merchant_id']}"
            graph.add_edge(txn["account_id"], node, kind="cash_out", amount=txn["amount_paise"], txn_id=txn["id"])
            edges.append(txn)

    reaches_cash = False
    chain_labels: list[str] = []
    if account["id"] in graph:
        for node in nx.descendants(graph, account["id"]):
            if str(node).startswith("cash:"):
                reaches_cash = True
                break
        # A short path description: this account, the next hop, and a cash-out if present.
        chain_labels = _describe_chain(catalog, graph, account["id"])

    inbound = [
        txn["amount_paise"]
        for txn in catalog.by_account[account["id"]]
        if txn["type"] == "p2p_in" and txn["ts"] >= window_start
    ]
    outbound = [
        txn["amount_paise"]
        for txn in catalog.by_account[account["id"]]
        if txn["type"] in {"p2p_out", "cash_out"} and txn["ts"] >= window_start
    ]
    inbound_sum = sum(inbound)
    outbound_sum = sum(outbound)
    ratio = (outbound_sum / inbound_sum) if inbound_sum else 0.0
    lead = state["facts"]["lead"]
    counterparty_young = False
    if lead["type"] == "p2p_out" and lead.get("counterparty_account_id"):
        counterparty = catalog.accounts.get(lead["counterparty_account_id"])
        if counterparty:
            counterparty_young = (lead["ts"] - counterparty["opened_ts"]) / 86400 < 45
    same_household = False
    if deduped:
        same_household = all(
            item["last_name"] == customer["last_name"] and item["city"] == customer["home_city"]
            for item in deduped
        )
    state["facts"].update(
        {
            "linked_customers": deduped,
            "reaches_cash": reaches_cash,
            "chain_labels": chain_labels,
            "passthrough_ratio": ratio,
            "inbound_sum": inbound_sum,
            "outbound_sum": outbound_sum,
            "same_household": same_household,
            "counterparty_young": counterparty_young,
            "flow_graph": graph,
        }
    )
    if reaches_cash or (deduped and not same_household):
        status = "alert"
    elif deduped:
        status = "watch"
    else:
        status = "clear"
    if deduped:
        linked_text = "These devices are also used by " + ", ".join(
            f"{item['name']} ({item['customer_id']}) via {item['device_id']}" for item in deduped[:4]
        ) + "."
    else:
        linked_text = "No other customer uses the devices in this episode."
    flow_text = (
        f"Funds from {account['id']} reach a cash-out inside the graph ({' → '.join(chain_labels)})."
        if reaches_cash and chain_labels
        else "No cash-out path leaves this account in the six-day money graph."
    )
    _step(
        state,
        "network",
        "Linked accounts and money flow",
        status,
        (
            f"{linked_text} {_flow_sentence(inbound_sum, outbound_sum, ratio)} "
            + flow_text
            + (
                " The other names share a surname and city, which fits a household rather than a mule ring."
                if same_household
                else ""
            )
        ),
        [
            {"label": "Linked customers", "value": str(len(deduped))},
            {"label": "Household pattern", "value": "yes" if same_household else "no"},
            {"label": "Reaches cash-out", "value": "yes" if reaches_cash else "no"},
            {"label": "Pass-through", "value": f"{ratio:.0%}" if inbound_sum else "no inbound"},
        ],
        860,
    )


def _describe_chain(catalog: Catalog, graph: nx.DiGraph, account_id: str) -> list[str]:
    labels = [_account_label(catalog, account_id)]
    current = account_id
    for _ in range(3):
        successors = list(graph.successors(current))
        if not successors:
            break
        nxt = successors[0]
        if str(nxt).startswith("cash:"):
            merchant = catalog.merchant(str(nxt).split(":", 1)[1])
            labels.append(merchant["name"] if merchant else "cash-out")
            break
        labels.append(_account_label(catalog, str(nxt)))
        current = nxt
    return labels


def _account_label(catalog: Catalog, account_id: str) -> str:
    account = catalog.accounts.get(account_id)
    if not account:
        return account_id
    customer = catalog.customer(account["customer_id"])
    return f"{customer['name']} ({account_id})"


def transfer_check(state: dict) -> None:
    state["facts"]["merchant"] = None
    state["facts"]["merchant_stats"] = {}
    _step(
        state,
        "merchant",
        "Merchant check",
        "watch",
        "The lead movement is a transfer, not a card purchase, so there is no merchant to underwrite. The money-flow step carries that evidence.",
        [{"label": "Merchant", "value": "none (transfer)"}],
        300,
    )


def merchant_check(state: dict) -> None:
    catalog: Catalog = state["catalog"]
    lead = state["facts"]["lead"]
    merchant = catalog.merchant(lead["merchant_id"])
    recent_start = lead["ts"] - 14 * 86400
    recent = [txn for txn in catalog.by_merchant[merchant["id"]] if txn["ts"] >= recent_start]
    buyers = []
    young = []
    round_hits = 0
    devices: dict[str, set[str]] = {}
    for txn in recent:
        if txn["customer_id"] not in buyers:
            buyers.append(txn["customer_id"])
            account = catalog.accounts[txn["account_id"]]
            if (txn["ts"] - account["opened_ts"]) / 86400 < 45:
                young.append(txn["customer_id"])
        if txn["amount_paise"] % ROUND_PAISE == 0 and txn["amount_paise"] >= ROUND_FLOOR_PAISE:
            round_hits += 1
        devices.setdefault(txn["device_id"], set()).add(txn["customer_id"])
    shared_devices = [device_id for device_id, owners in devices.items() if len(owners) >= 2]
    young_share = (len(young) / len(buyers)) if buyers else 0
    round_share = (round_hits / len(recent)) if recent else 0
    categories = []
    for txn in state["facts"]["episode"]:
        item = catalog.merchant(txn["merchant_id"])
        if item and item["category"] not in categories:
            categories.append(item["category"])
    stats = {
        "buyers": len(buyers),
        "young_share": young_share,
        "round_share": round_share,
        "shared_devices": shared_devices,
        "categories": categories,
        "recent_count": len(recent),
    }
    state["facts"]["merchant"] = merchant
    state["facts"]["merchant_stats"] = stats
    suspicious = young_share >= 0.5 and len(buyers) >= 4 and round_share >= 0.5 and bool(shared_devices)
    _step(
        state,
        "merchant",
        "Merchant check",
        "alert" if suspicious else "clear",
        (
            f"{merchant['name']} ({merchant['category'].replace('_', ' ')}, {merchant['city']}) has {plural(len(recent), 'payment')} "
            f"in the past 14 days from {plural(len(buyers), 'customer')}. "
            f"{young_share:.0%} of those customers are under 45 days old. "
            f"{round_share:.0%} of the amounts are round (multiples of {whole_rupees(ROUND_PAISE)}, at least {whole_rupees(ROUND_FLOOR_PAISE)}). "
            f"Devices shared by two or more buyers: {', '.join(shared_devices) if shared_devices else 'none'}."
        ),
        [
            {"label": "Category", "value": merchant["category"]},
            {"label": "Recent buyers", "value": str(len(buyers))},
            {"label": "Young-account share", "value": f"{young_share:.0%}"},
            {"label": "Round-amount share", "value": f"{round_share:.0%}"},
        ],
        640,
    )


def _country_name(code: str) -> str:
    names = {
        "US": "the United States",
        "GB": "the United Kingdom",
        "NL": "the Netherlands",
        "AE": "the United Arab Emirates",
        "SG": "Singapore",
        "ES": "Spain",
        "CA": "Canada",
        "NG": "Nigeria",
        "BR": "Brazil",
        "PT": "Portugal",
        "DE": "Germany",
        "EE": "Estonia",
        "FR": "France",
        "IN": "India",
        "AU": "Australia",
        "JP": "Japan",
        "MX": "Mexico",
        "IE": "Ireland",
        "IT": "Italy",
        "SE": "Sweden",
    }
    return names.get(code, code)


def _country_sentence(home: str, countries: list[str], foreign: bool) -> str:
    name = _country_name(home)
    if foreign and home in countries and len(countries) > 1:
        return (
            f"The customer's home country is {name}. "
            "Some payments in this episode are outside that country, and some are at home."
        )
    if foreign:
        return (
            f"The customer's home country is {name}. "
            "Every payment in this episode is outside that country."
        )
    return f"The customer's home country is {name}. Every payment in this episode is there."


def _flow_sentence(inbound_sum: int, outbound_sum: int, ratio: float) -> str:
    if inbound_sum and outbound_sum:
        return (
            f"Inbound transfers {money(inbound_sum)}, outbound {money(outbound_sum)}, "
            f"pass-through {ratio:.0%}."
        )
    if outbound_sum:
        return f"No inbound transfer in this window. {money(outbound_sum)} was sent on."
    if inbound_sum:
        return f"Inbound transfers {money(inbound_sum)}. Nothing was sent on."
    return "No UPI transfer or cash-out on this account in the six-day window."


def _others_on_device(count: int) -> str:
    if count == 0:
        return "No other customer uses the devices in this episode."
    if count == 1:
        return "1 other customer uses a device in this episode."
    return f"{count} other customers use a device in this episode."


def _name_list(names: list[str]) -> str:
    if not names:
        return "none"
    if len(names) == 1:
        return names[0]
    if len(names) <= 8:
        return ", ".join(names[:-1]) + f", and {names[-1]}"
    return ", ".join(names[:7]) + f", and {len(names) - 7} more"


def _categories(catalog: Catalog, txns: list[dict]) -> set[str]:
    found: set[str] = set()
    for txn in txns:
        merchant = catalog.merchant(txn["merchant_id"])
        if merchant:
            found.add(merchant["category"])
    return found


def classify(state: dict) -> None:
    facts = state["facts"]
    episode = facts["episode"]
    amounts = facts["episode_amounts"]
    episode_median = facts["episode_median"]
    merchant_categories = set(facts.get("merchant_stats", {}).get("categories", []))
    declines = facts["decline_count"]
    pattern = "legitimate"
    detail = "baseline"
    reasons: list[str] = []

    card_testing = (
        len(episode) >= 6
        and episode_median < 80_000
        and len(facts["episode_merchants"]) >= 4
        and (declines >= 3 or (len(episode) and declines / len(episode) >= 0.25))
        and bool(facts["new_devices"])
    )
    risky_spend = bool(merchant_categories & RISKY_CATEGORIES)
    travel_spend = bool(merchant_categories & TRAVEL_CATEGORIES)
    peak_ratio = facts["peak_ratio"] or 0
    # A normal purchase can fall inside the same clock window as an attack.
    # Judge the new device on its own, instead of letting that purchase veto the pattern.
    new_txns = [txn for txn in episode if txn["device_id"] in set(facts["new_devices"])]
    new_categories = _categories(state["catalog"], new_txns)
    new_peak = max((txn["amount_paise"] for txn in new_txns), default=0)
    new_ratio = (new_peak / facts["baseline_median"]) if facts["baseline_median"] else 0
    new_foreign = any(
        state["catalog"].ips[txn["ip_id"]]["country"] != facts["customer"]["home_country"] for txn in new_txns
    )
    stats = facts.get("merchant_stats") or {}
    lead = facts["lead"]
    collusion = False
    if facts.get("merchant") and stats:
        collusion = (
            stats["buyers"] >= 4
            and stats["young_share"] >= 0.5
            and stats["round_share"] >= 0.5
            and bool(stats["shared_devices"])
            and lead["amount_paise"] % ROUND_PAISE == 0
            and facts["account_age_days"] < 45
        )
    money_movement = lead["type"] in {"p2p_out", "p2p_in", "cash_out"} or facts["reaches_cash"] or facts["outbound_sum"] > 0
    mule = False
    if money_movement and not facts["same_household"]:
        mule = (
            facts["reaches_cash"]
            or facts.get("counterparty_young")
            or facts["passthrough_ratio"] >= 0.6
            or (facts["account_age_days"] < 45 and (facts["inbound_sum"] >= 800_000 or facts["outbound_sum"] >= 800_000))
            or (not facts["same_household"] and len(facts["linked_customers"]) >= 1 and facts["outbound_sum"] >= 800_000)
        )
    ato = (
        bool(new_txns)
        and new_foreign
        and new_ratio >= 4
        and new_peak >= 1_200_000
        and bool(new_categories & RISKY_CATEGORIES)
        and "airline" not in new_categories
    )

    if card_testing:
        pattern, detail = "card_testing", "probe_then_charge"
        reasons.append("A burst of tiny amounts, many merchants, declines, and a device that is new to the customer.")
    elif mule and not facts["same_household"]:
        pattern, detail = "mule_chain", "pass_through"
        if facts["account_age_days"] < 45 or facts["passthrough_ratio"] >= 0.6:
            reasons.append("Funds arrive and leave again toward a cash-out, with little of the money staying on the account.")
        else:
            path = " → ".join(facts["chain_labels"]) if facts["chain_labels"] else "a cash-out"
            reasons.append(f"This account sent {money(facts['outbound_sum'])} into a chain that cashes out ({path}).")
    elif ato:
        pattern, detail = "account_takeover", "new_device_foreign_spike"
        reasons.append("A new device in a new country spends far above baseline at gift cards, electronics, or crypto.")
    elif collusion:
        pattern, detail = "merchant_collusion", "round_amounts_shared_devices"
        reasons.append("Young accounts share devices and repeatedly pay the same merchant in round amounts.")
    elif (
        facts["foreign"]
        and facts["known_mature_devices"]
        and travel_spend
        and facts["episode_peak"] < 3_200_000
        and declines == 0
    ):
        pattern, detail = "legitimate", "travel"
        reasons.append("Foreign IP, but the device is the one this customer has used for weeks, and the merchants are travel.")
    elif facts["same_household"] and not facts["foreign"] and facts["episode_peak"] < 1_600_000 and not mule:
        pattern, detail = "legitimate", "household"
        reasons.append("The shared device belongs to someone with the same surname and city, and nothing is passed through.")
    elif (
        facts["peak_velocity"] >= 5
        and declines == 0
        and episode_median >= 80_000
        and not facts["new_devices"]
        and not facts["foreign"]
        and len(facts["episode_merchants"]) <= 3
    ):
        pattern, detail = "legitimate", "flash_sale"
        shops = facts["episode_merchants"]
        if len(shops) == 1:
            shop_bit = shops[0]
        elif len(shops) == 2:
            shop_bit = f"{shops[0]} and {shops[1]}"
        else:
            shop_bit = _name_list(shops)
        reasons.append(
            f"The hour is busy, but every payment cleared, on a known device, at {shop_bit}."
        )
    elif (
        facts["new_devices"]
        and not facts["foreign"]
        and facts["episode_peak"] < 600_000
        and facts["peak_velocity"] <= 2
        and not risky_spend
    ):
        pattern, detail = "legitimate", "new_device_at_home"
        if merchant_categories == {"grocery"}:
            amount_bit = "the amount matches a grocery run"
        else:
            amount_bit = "the amount is in line with what this customer usually spends"
        reasons.append(f"The only new thing is the device. It is at home, and {amount_bit}.")
    elif (
        not facts["new_devices"]
        and not facts["foreign"]
        and facts["peak_velocity"] <= 2
        and lead["type"] == "card_purchase"
        and len(episode) <= 2
        and facts["episode_peak"] >= 1_600_000
        and facts["account_age_days"] > 180
        and (not merchant_categories or merchant_categories <= {"electronics", "fashion", "airline", "hotel", "furniture"})
    ):
        pattern, detail = "legitimate", "large_purchase"
        reasons.append("One large purchase on the usual device at home, from a long-standing customer.")
    else:
        pattern, detail = "legitimate", "unexplained"
        reasons.append("The flag does not add up to card testing, an account takeover, a mule chain, or merchant collusion.")

    facts["pattern"] = pattern
    facts["pattern_detail"] = detail
    facts["pattern_reasons"] = reasons
    status = "alert" if pattern != "legitimate" else "clear"
    _step(
        state,
        "classify",
        "Pattern classification",
        status,
        f"{PATTERN_LABELS[pattern]}. {reasons[0]}",
        [
            {"label": "Pattern", "value": PATTERN_LABELS[pattern]},
            {"label": "Detail", "value": detail.replace("_", " ")},
        ],
        390,
    )


def recommend(state: dict) -> None:
    facts = state["facts"]
    pattern = facts["pattern"]
    detail = facts["pattern_detail"]
    signals: list[dict] = [{"name": "Case opened", "points": 4, "detail": "Every queued payment starts with a small residual score."}]

    if pattern == "card_testing":
        signals += [
            {"name": "Probe burst", "points": 48, "detail": f"{len(facts['episode'])} payments, median {money(facts['episode_median'])}, {len(facts['episode_merchants'])} merchants."},
            {"name": "Declines", "points": 14, "detail": f"{facts['decline_count']} declined attempts in the burst."},
            {"name": "Unfamiliar device", "points": 18, "detail": ", ".join(facts["new_devices"])},
        ]
        if facts["datacenter"]:
            signals.append({"name": "Datacenter IP", "points": 10, "detail": "The IP is in a hosting range, not a household connection."})
        action = "block"
        rationale = "Block the card. Testing already landed a larger charge, and further attempts will follow the same device."
    elif pattern == "account_takeover":
        signals += [
            {"name": "New device abroad", "points": 36, "detail": f"Device {', '.join(facts['new_devices'])} in {_name_list([_country_name(code) for code in facts['episode_countries']])}."},
            {"name": "Spend spike", "points": 28, "detail": f"Peak {money(facts['episode_peak'])} against a median of {money(facts['baseline_median'])}."},
            {"name": "Risky merchants", "points": 18, "detail": "Gift cards, electronics, or crypto, rather than travel."},
        ]
        if facts["vpn"]:
            signals.append({"name": "VPN", "points": 8, "detail": "The session is coming through a VPN."})
        action = "block"
        rationale = "Block and force a step-up with the real customer. The session does not match the device or the country on file."
    elif pattern == "mule_chain":
        signals += [
            {"name": "Cash-out path", "points": 40, "detail": " → ".join(facts["chain_labels"]) if facts["chain_labels"] else "Reaches a cash-out merchant."},
            {
                "name": "Shared infrastructure",
                "points": 18 if facts["linked_customers"] else 8,
                "detail": _others_on_device(len(facts["linked_customers"])),
            },
            {
                "name": "Funds do not stay" if facts["inbound_sum"] else "Sent into the chain",
                "points": 16,
                "detail": (
                    f"Inbound {money(facts['inbound_sum'])}, outbound {money(facts['outbound_sum'])}."
                    if facts["inbound_sum"]
                    else f"No inbound transfer in this window. {money(facts['outbound_sum'])} was sent on."
                ),
            },
        ]
        if facts["account_age_days"] < 45:
            signals.append({"name": "Young account", "points": 10, "detail": f"Opened {plural(facts['account_age_days'], 'day')} ago."})
        action = "block" if facts["lead"]["type"] == "cash_out" else "escalate"
        rationale = (
            "Block the cash-out before it settles."
            if action == "block"
            else "Escalate the chain so the receiving accounts can be frozen together."
        )
    elif pattern == "merchant_collusion":
        merchant = facts["merchant"]
        stats = facts["merchant_stats"]
        signals += [
            {"name": "Round amounts", "points": 26, "detail": f"{stats['round_share']:.0%} of recent payments at {merchant['name']} are round."},
            {"name": "Young buyers", "points": 22, "detail": f"{stats['young_share']:.0%} of buyers are under 45 days old."},
            {"name": "Shared buyer devices", "points": 22, "detail": ", ".join(stats["shared_devices"])},
        ]
        action = "escalate"
        rationale = "Escalate to merchant risk. Blocking one buyer leaves the rest of the ring, and the merchant, untouched."
    else:
        action = "approve"
        if detail == "travel":
            signals.append({"name": "Trip on a known device", "points": 12, "detail": f"Reused {', '.join(facts['known_mature_devices'])} abroad at travel merchants."})
            rationale = "Approve. This is a trip on the customer's own device, not a takeover. A takeover would bring a new device and gift-card spend."
        elif detail == "household":
            signals.append({"name": "Household device", "points": 10, "detail": "Shared with the same surname in the same city, with no pass-through."})
            hardware = "device"
            if facts["episode_devices"]:
                hardware = state["catalog"].devices[facts["episode_devices"][0]]["hardware"]
            article = "an" if hardware[:1].lower() in "aeiou" else "a"
            rationale = (
                f"Approve. Sharing {article} {hardware} with the same surname, in the same city, "
                "is a household. Nothing is passed through, so it is not a mule chain."
            )
        elif detail == "flash_sale":
            signals.append({"name": "Busy hour, ordinary tickets", "points": 8, "detail": f"Cleared purchases on a known device at {_name_list(facts['episode_merchants'])}."})
            rationale = "Approve. Velocity without declines, probes, or a new device is a shopping burst, not card testing."
        elif detail == "new_device_at_home":
            signals.append({"name": "New device at home", "points": 14, "detail": "New hardware, household IP, amount inside the baseline."})
            rationale = "Approve. A replacement phone at home, spending like the customer always does, is not an account takeover."
        elif detail == "large_purchase":
            signals.append({"name": "Explained one-off", "points": 16, "detail": "Single large ticket, usual device, home IP, long tenure."})
            rationale = "Approve. The amount is unusual and the rest of the session is not. Holding it punishes a real purchase."
        else:
            signals.append({"name": "Unmatched flag", "points": 18, "detail": "The queue reason is not backed up by the rest of the file."})
            action = "hold" if facts["foreign"] and facts["new_devices"] else "approve"
            rationale = (
                "Hold for an analyst. A new device and a new country showed up together, but the rest of the pattern is incomplete."
                if action == "hold"
                else "Approve. History, device, network, and merchant checks do not support a fraud pattern."
            )

    score = sum(item["points"] for item in signals)
    floors = {"card_testing": 84, "account_takeover": 82, "mule_chain": 76, "merchant_collusion": 72}
    caps = {"legitimate": 36}
    if pattern in floors:
        score = max(score, floors[pattern])
    if pattern in caps:
        score = min(score, caps[pattern])
    score = int(max(0, min(100, score)))
    facts["signals"] = signals
    facts["score"] = score
    facts["action"] = action
    facts["rationale"] = rationale
    _step(
        state,
        "recommend",
        "Suggested action",
        "alert" if action in {"block", "escalate"} else "watch" if action == "hold" else "clear",
        f"Suggested action: {action}. Risk score {score}/100. {rationale} A person still has to confirm this. FraudLens does not apply it.",
        [
            {"label": "Suggested action", "value": action},
            {"label": "Risk score", "value": f"{score}/100"},
            {"label": "Who decides", "value": "human analyst"},
        ],
        360,
    )


def assemble(state: dict) -> dict:
    facts = state["facts"]
    catalog: Catalog = state["catalog"]
    case = state["case"]
    lead = facts["lead"]
    customer = facts["customer"]
    narrative = _narrative(state)
    graph = _graph(state)
    related = []
    flagged = set(case["flagged_transaction_ids"])
    for txn in facts["episode"]:
        merchant = catalog.merchant(txn["merchant_id"])
        ip = catalog.ips[txn["ip_id"]]
        related.append(
            {
                "id": txn["id"],
                "occurred_at": txn["occurred_at"],
                "ts": txn["ts"],
                "amount_paise": txn["amount_paise"],
                "status": txn["status"],
                "type": txn["type"],
                "merchant_name": merchant["name"] if merchant else "UPI transfer",
                "merchant_category": merchant["category"] if merchant else "transfer",
                "device_id": txn["device_id"],
                "ip": catalog.ip_label(txn["ip_id"]),
                "ip_country": ip["country"],
                "city": ip["city"],
                "flagged": txn["id"] in flagged,
                "counterparty_account_id": txn["counterparty_account_id"],
            }
        )
    merchant = facts.get("merchant")
    return {
        "case_id": case["case_id"],
        "lead_transaction_id": lead["id"],
        "customer_id": customer["id"],
        "covered_transaction_ids": [txn["id"] for txn in facts["episode"]],
        "flag_reasons": [{"code": code, "text": REASON_TEXT.get(code, code)} for code in case["flag_reasons"]],
        "risk_score": facts["score"],
        "pattern": facts["pattern"],
        "pattern_label": PATTERN_LABELS[facts["pattern"]],
        "pattern_detail": facts["pattern_detail"],
        "action": facts["action"],
        "action_rationale": facts["rationale"],
        "confidence": "high" if facts["pattern"] != "legitimate" or facts["pattern_detail"] != "unexplained" else "medium",
        "summary": _summary(state),
        "narrative": polish_narrative(narrative, facts),
        "signals": facts["signals"],
        "timeline": state["timeline"],
        "graph": graph,
        "related_transactions": related,
        "customer": {
            "id": customer["id"],
            "name": customer["name"],
            "email": customer["email"],
            "home_city": customer["home_city"],
            "home_country": customer["home_country"],
            "segment": customer["segment"],
            "customer_since": customer["created_at"],
            "account_id": facts["account"]["id"],
            "account_age_days": facts["account_age_days"],
        },
        "lead": {
            "id": lead["id"],
            "occurred_at": lead["occurred_at"],
            "amount_paise": lead["amount_paise"],
            "status": lead["status"],
            "type": lead["type"],
            "merchant_name": facts["merchant_name"],
            "merchant_category": merchant["category"] if merchant else "transfer",
            "device_id": lead["device_id"],
            "device_label": catalog.device_label(lead["device_id"]),
            "ip": catalog.ip_label(lead["ip_id"]),
            "ip_city": catalog.ips[lead["ip_id"]]["city"],
            "ip_country": catalog.ips[lead["ip_id"]]["country"],
            "card_last4": lead["card_last4"],
        },
    }


def _summary(state: dict) -> str:
    facts = state["facts"]
    customer = facts["customer"]["name"]
    if facts["pattern"] == "card_testing":
        return f"Card testing on {customer}: tiny probes, then {money(facts['episode_peak'])} on a new device."
    if facts["pattern"] == "account_takeover":
        return f"Account takeover on {customer}: new device, new country, spend at {facts['peak_ratio']:.1f}× baseline."
    if facts["pattern"] == "mule_chain":
        return f"Mule flow touching {customer}: funds move onward to a cash-out the same day."
    if facts["pattern"] == "merchant_collusion":
        return f"Collusive buying at {facts['merchant']['name']}, including {customer}."
    detail_lines = {
        "travel": f"{customer} is travelling on a device already on file. The foreign IP is the trip, not a takeover.",
        "household": f"{customer} shares a device with someone of the same surname in the same city. Nothing passes through.",
        "flash_sale": f"{customer} made several ordinary purchases in one hour, on a known device, with no declines.",
        "new_device_at_home": f"{customer} used a new phone at home, and the amount matches their usual spend.",
        "large_purchase": f"{customer} made one large purchase on their usual device, at home.",
    }
    return detail_lines.get(
        facts["pattern_detail"],
        f"{customer} was queued, and the rest of the file does not support a fraud pattern.",
    )


def _where(merchant: dict | None) -> str:
    return f"at {merchant['name']}" if merchant else "by UPI transfer"


def _narrative(state: dict) -> str:
    facts = state["facts"]
    lead = facts["lead"]
    customer = facts["customer"]
    bits = [facts["pattern_reasons"][0], facts["rationale"]]
    card = f", card ••{lead['card_last4']}" if lead.get("card_last4") else ", no card on this transfer"
    bits.append(
        f"Lead payment {lead['id']} is {money(lead['amount_paise'])} "
        f"{'declined' if lead['status'] == 'declined' else 'approved'} "
        f"{_where(state['catalog'].merchant(lead['merchant_id']))} on {clock(lead['ts'])}{card}, "
        f"device {lead['device_id']} ({state['catalog'].device_label(lead['device_id'])})."
    )
    if facts["baseline_count"]:
        bits.append(
            f"Before this episode, {customer['name']} had {plural(facts['baseline_count'], 'payment')} "
            f"with a median of {money(facts['baseline_median'])}."
        )
    if facts["pattern"] == "card_testing":
        bits.append(
            f"Between {short_clock(facts['episode'][0]['ts'])} and {short_clock(facts['episode'][-1]['ts'])} "
            f"there were {len(facts['episode'])} attempts, {facts['decline_count']} declined, "
            f"across {_name_list(facts['episode_merchants'])}."
        )
    if facts["pattern"] == "legitimate" and facts["pattern_detail"] == "travel":
        bits.append(
            "The contrast with account takeover is the device: takeover arrives on hardware the customer has never used."
        )
    return " ".join(bits)


def polish_narrative(narrative: str, facts: dict) -> str:
    """Optional prose pass. Never changes the decision. Skipped unless a key is present.

    The function is a hook so a demo with a key can be extended. This build
    keeps the templated narrative either way, because a live model call would
    make the pitch depend on a vendor.
    """
    if not (os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")):
        return narrative
    return narrative


def _graph(state: dict) -> dict:
    catalog: Catalog = state["catalog"]
    facts = state["facts"]
    customer = facts["customer"]
    graph = nx.Graph()

    def add_node(node_id: str, node_type: str, label: str, sublabel: str, emphasis: bool) -> None:
        if node_id not in graph:
            graph.add_node(node_id, type=node_type, label=label, sublabel=sublabel, emphasis=emphasis)

    add_node(customer["id"], "customer", customer["name"], customer["id"], True)
    account = facts["account"]
    add_node(account["id"], "account", "Account", account["id"], True)
    graph.add_edge(customer["id"], account["id"], kind="owns", label="owns")

    for device_id in facts["episode_devices"][:3]:
        add_node(device_id, "device", catalog.devices[device_id]["hardware"], device_id, device_id in facts["new_devices"])
        graph.add_edge(account["id"], device_id, kind="device", label="used")

    seen_ips = []
    for txn in facts["episode"]:
        if txn["ip_id"] in seen_ips:
            continue
        seen_ips.append(txn["ip_id"])
        if len(seen_ips) > 2:
            break
        ip = catalog.ips[txn["ip_id"]]
        add_node(ip["id"], "ip", ip["city"], ip["address"], bool(ip["is_datacenter"] or ip["is_vpn"]))
        graph.add_edge(account["id"], ip["id"], kind="ip", label="from")

    merchant_ids = []
    for txn in facts["episode"]:
        if txn["merchant_id"] and txn["merchant_id"] not in merchant_ids:
            merchant_ids.append(txn["merchant_id"])
    for merchant_id in merchant_ids[:5]:
        merchant = catalog.merchant(merchant_id)
        add_node(merchant_id, "merchant", merchant["name"], merchant["category"], merchant["risk_tier"] == "high")
        graph.add_edge(account["id"], merchant_id, kind="paid", label="paid")

    for item in facts["linked_customers"][:4]:
        other = catalog.customer(item["customer_id"])
        other_account = catalog.account_for_customer(other["id"])
        add_node(other["id"], "customer", other["name"], other["id"], not facts["same_household"])
        add_node(other_account["id"], "account", "Account", other_account["id"], not facts["same_household"])
        graph.add_edge(other["id"], other_account["id"], kind="owns", label="owns")
        if item["device_id"] in graph:
            graph.add_edge(other_account["id"], item["device_id"], kind="device", label="shared")

    # Money-flow neighbors one hop out, if any.
    flow: nx.DiGraph = facts["flow_graph"]
    if account["id"] in flow:
        for nxt in list(flow.successors(account["id"]))[:3]:
            if str(nxt).startswith("cash:"):
                continue
            other_account = catalog.accounts.get(str(nxt))
            if not other_account:
                continue
            other = catalog.customer(other_account["customer_id"])
            add_node(other["id"], "customer", other["name"], other["id"], True)
            add_node(other_account["id"], "account", "Account", other_account["id"], True)
            graph.add_edge(other["id"], other_account["id"], kind="owns", label="owns")
            edge = flow.get_edge_data(account["id"], nxt)
            graph.add_edge(account["id"], other_account["id"], kind="p2p", label=money(edge["amount"]) if edge else "p2p")

    if len(graph) == 1:
        positions = {node: (0.5, 0.5) for node in graph.nodes}
    else:
        positions = nx.spring_layout(graph, seed=7, k=1.4)

    xs = [positions[node][0] for node in graph.nodes]
    ys = [positions[node][1] for node in graph.nodes]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    def scale(value: float, low: float, high: float) -> float:
        if high == low:
            return 0.5
        return 0.08 + 0.84 * ((value - low) / (high - low))

    nodes = []
    for node_id, data in graph.nodes(data=True):
        x, y = positions[node_id]
        nodes.append(
            {
                "id": node_id,
                "type": data["type"],
                "label": data["label"],
                "sublabel": data["sublabel"],
                "x": round(scale(x, min_x, max_x), 4),
                "y": round(scale(y, min_y, max_y), 4),
                "emphasis": bool(data["emphasis"]),
            }
        )
    edges = []
    for source, target, data in graph.edges(data=True):
        edges.append({"source": source, "target": target, "kind": data.get("kind", "link"), "label": data.get("label", "")})

    if facts["chain_labels"]:
        caption = "Money path: " + " → ".join(facts["chain_labels"])
    elif facts["linked_customers"]:
        caption = "Devices in this episode are shared with " + ", ".join(item["name"] for item in facts["linked_customers"][:3])
    elif facts["new_devices"]:
        caption = f"New device {facts['new_devices'][0]} sits next to the account. The customer's older devices are not in this episode."
    else:
        caption = "The episode stays on devices and a country already associated with this customer."
    return {"nodes": nodes, "edges": edges, "caption": caption}


def np_median(values: list[int]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[mid])
    return (ordered[mid - 1] + ordered[mid]) / 2
