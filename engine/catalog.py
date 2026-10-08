"""Indexes over the analyst-visible ledger, cut off at a review time."""

from __future__ import annotations

from collections import defaultdict


class Catalog:
    def __init__(self, world: dict, as_of_ts: int) -> None:
        self.as_of_ts = as_of_ts
        self.customers = {row["id"]: row for row in world["customers"]}
        self.accounts = {row["id"]: row for row in world["accounts"]}
        self.cards = {row["id"]: row for row in world["cards"]}
        self.devices = {row["id"]: row for row in world["devices"]}
        self.ips = {row["id"]: row for row in world["ips"]}
        self.merchants = {row["id"]: row for row in world["merchants"]}
        self.txns = [row for row in world["transactions"] if row["ts"] <= as_of_ts]
        self.txns.sort(key=lambda row: (row["ts"], row["id"]))

        self.by_customer: dict[str, list[dict]] = defaultdict(list)
        self.by_account: dict[str, list[dict]] = defaultdict(list)
        self.by_device: dict[str, list[dict]] = defaultdict(list)
        self.by_merchant: dict[str, list[dict]] = defaultdict(list)
        for txn in self.txns:
            self.by_customer[txn["customer_id"]].append(txn)
            self.by_account[txn["account_id"]].append(txn)
            self.by_device[txn["device_id"]].append(txn)
            if txn["merchant_id"]:
                self.by_merchant[txn["merchant_id"]].append(txn)

        self.account_customer = {row["id"]: row["customer_id"] for row in world["accounts"]}

    def customer(self, customer_id: str) -> dict:
        return self.customers[customer_id]

    def account_for_customer(self, customer_id: str) -> dict:
        for account in self.accounts.values():
            if account["customer_id"] == customer_id:
                return account
        raise KeyError(customer_id)

    def device_label(self, device_id: str) -> str:
        device = self.devices[device_id]
        return f"{device['hardware']} · {device['os']} · {device['browser']}"

    def ip_label(self, ip_id: str) -> str:
        ip = self.ips[ip_id]
        flags = []
        if ip["is_datacenter"]:
            flags.append("datacenter")
        if ip["is_vpn"]:
            flags.append("VPN")
        suffix = f", {', '.join(flags)}" if flags else ""
        return f"{ip['address']} · {ip['city']}, {ip['country']}{suffix}"

    def merchant(self, merchant_id: str | None) -> dict | None:
        if not merchant_id:
            return None
        return self.merchants.get(merchant_id)

    def customers_on_device(self, device_id: str) -> list[str]:
        seen: list[str] = []
        for txn in self.by_device.get(device_id, []):
            if txn["customer_id"] not in seen:
                seen.append(txn["customer_id"])
        return seen
