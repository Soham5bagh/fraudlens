import type { Account, Customer, Device, Ip, Merchant, Txn, World } from "./types";

export class Catalog {
  readonly customers: Map<string, Customer>;
  readonly accounts: Map<string, Account>;
  readonly devices: Map<string, Device>;
  readonly ips: Map<string, Ip>;
  readonly merchants: Map<string, Merchant>;
  readonly txns: Txn[];
  readonly byCustomer = new Map<string, Txn[]>();
  readonly byAccount = new Map<string, Txn[]>();
  readonly byDevice = new Map<string, Txn[]>();
  readonly byMerchant = new Map<string, Txn[]>();

  constructor(world: World, asOfTs: number) {
    this.customers = new Map(world.customers.map((row) => [row.id, row]));
    this.accounts = new Map(world.accounts.map((row) => [row.id, row]));
    this.devices = new Map(world.devices.map((row) => [row.id, row]));
    this.ips = new Map(world.ips.map((row) => [row.id, row]));
    this.merchants = new Map(world.merchants.map((row) => [row.id, row]));
    this.txns = world.transactions.filter((row) => row.ts <= asOfTs).sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
    for (const txn of this.txns) {
      push(this.byCustomer, txn.customer_id, txn);
      push(this.byAccount, txn.account_id, txn);
      push(this.byDevice, txn.device_id, txn);
      if (txn.merchant_id) push(this.byMerchant, txn.merchant_id, txn);
    }
  }

  customer(id: string): Customer {
    const row = this.customers.get(id);
    if (!row) throw new Error(`Missing customer ${id}`);
    return row;
  }

  accountForCustomer(customerId: string): Account {
    for (const account of this.accounts.values()) {
      if (account.customer_id === customerId) return account;
    }
    throw new Error(`Missing account for ${customerId}`);
  }

  deviceLabel(deviceId: string): string {
    const device = this.devices.get(deviceId);
    if (!device) return deviceId;
    return `${device.hardware} · ${device.os} · ${device.browser}`;
  }

  ipLabel(ipId: string): string {
    const ip = this.ips.get(ipId);
    if (!ip) return ipId;
    const flags = [];
    if (ip.is_datacenter) flags.push("datacenter");
    if (ip.is_vpn) flags.push("VPN");
    const suffix = flags.length ? `, ${flags.join(", ")}` : "";
    return `${ip.address} · ${ip.city}, ${ip.country}${suffix}`;
  }

  merchant(merchantId: string | null): Merchant | null {
    if (!merchantId) return null;
    return this.merchants.get(merchantId) ?? null;
  }

  customersOnDevice(deviceId: string): string[] {
    const seen: string[] = [];
    for (const txn of this.byDevice.get(deviceId) ?? []) {
      if (!seen.includes(txn.customer_id)) seen.push(txn.customer_id);
    }
    return seen;
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
