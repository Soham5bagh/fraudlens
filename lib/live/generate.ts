import { investigate } from "./investigate";
import { isoFromSeconds, mulberry32, randInt } from "./format";
import type {
  Account,
  CaseInput,
  Customer,
  Device,
  Enrollment,
  Investigation,
  Ip,
  Merchant,
  PlantedScenario,
  ScenarioChoice,
  Truth,
  Txn,
  World,
} from "./types";

export const PLANTED: PlantedScenario[] = [
  "card_testing",
  "account_takeover",
  "mule_chain",
  "merchant_collusion",
  "genuine",
];

const LABELS: Record<PlantedScenario, string> = {
  card_testing: "Card testing",
  account_takeover: "Account takeover",
  mule_chain: "Mule chain",
  merchant_collusion: "Merchant collusion",
  genuine: "Genuine trip",
};

const FIRST = ["Maya", "Jonah", "Priya", "Elena", "Samir", "Nora", "Hugo", "Aisha", "Leo", "Ines", "Owen", "Farah", "Nico", "Ruth", "Idris", "Helen", "Colin", "Anika", "Marcus", "Sofia"];
const LAST = ["Okoye", "Berg", "Shah", "Moreau", "Nguyen", "Adler", "Costa", "Petrov", "Silva", "Hart", "Bennett", "Almeida", "Keller", "Diaz", "Rossi", "Quinn", "Hughes", "Sato", "Khan", "Fischer"];
const CITIES: [string, string][] = [
  ["London", "GB"],
  ["Chicago", "US"],
  ["Lisbon", "PT"],
  ["Berlin", "DE"],
  ["Toronto", "CA"],
  ["Madrid", "ES"],
  ["Dublin", "IE"],
  ["Tallinn", "EE"],
];

export function resolveScenario(choice: ScenarioChoice, seed: number): PlantedScenario {
  if (choice === "random") return PLANTED[Math.abs(seed) % PLANTED.length];
  return PLANTED.includes(choice) ? choice : "card_testing";
}

export function runLive(choice: ScenarioChoice, seed: number): { investigation: Investigation; truth: Truth } {
  const scenario = resolveScenario(choice, seed);
  const built = buildWorld(scenario, seed);
  return {
    investigation: investigate(built.world, built.caseInput),
    truth: built.truth,
  };
}

type Bag = {
  world: World;
  seq: number;
};

export function buildWorld(scenario: PlantedScenario, seed: number): { world: World; caseInput: CaseInput; truth: Truth } {
  const rng = mulberry32(seed || 1);
  const bag: Bag = {
    world: { customers: [], accounts: [], devices: [], ips: [], merchants: [], transactions: [], enrollments: [] },
    seq: 1,
  };
  const home = CITIES[randInt(rng, CITIES.length)];
  const person = makeCustomer(bag, pick(rng, FIRST), pick(rng, LAST), home, daysBefore(seed, 700));
  const phone = device(bag, "iPhone", "iOS 18", "Safari");
  const homeIp = ip(bag, home[0], home[1], false, false);
  enroll(bag, person.customer, phone);
  const grocery = merchant(bag, "Harbor Grocery", "grocery", home[0], home[1]);
  const coffee = merchant(bag, "Sable Coffee", "coffee", home[0], home[1]);
  const gift = merchant(bag, "Parcel Gift Cards", "gift_card", "Ashburn", "US");
  const electronics = merchant(bag, "Lumen Electronics", "electronics", "Chicago", "US");
  const airline = merchant(bag, "Brightair", "airline", "Lisbon", "PT");
  const hotel = merchant(bag, "Atelier Hale", "hotel", "Lisbon", "PT");
  const crypto = merchant(bag, "Keystone Crypto Desk", "crypto", "Austin", "US");
  const keys = merchant(bag, "Northwind Digital Keys", "digital_goods", "Tallinn", "EE");
  const shops = [
    merchant(bag, "Hearth Gift Co", "gift_card", "Austin", "US"),
    merchant(bag, "Nimbus Cloud Apps", "digital_goods", "Dublin", "IE"),
    merchant(bag, "Kinfolk Streaming", "digital_goods", "Berlin", "DE"),
    merchant(bag, "Dayrate Parking", "transit", "Chicago", "US"),
    gift,
    coffee,
  ];

  if (scenario === "card_testing") return finish(bag, seed, person, cardTesting(bag, rng, seed, person, phone, homeIp, shops, gift), "card_testing", ["new_device", "foreign_ip", "velocity_1h"]);
  if (scenario === "account_takeover") return finish(bag, seed, person, takeover(bag, rng, seed, person, phone, homeIp, grocery, gift, electronics), "account_takeover", ["new_device", "foreign_ip", "amount_outlier"]);
  if (scenario === "mule_chain") return mule(bag, rng, seed, person, phone, homeIp, grocery, crypto);
  if (scenario === "merchant_collusion") return collusion(bag, rng, seed, keys, grocery);
  return finish(bag, seed, person, trip(bag, rng, seed, person, phone, homeIp, grocery, airline, hotel, home[1]), "genuine", ["foreign_ip"]);
}

function cardTesting(
  bag: Bag,
  rng: () => number,
  seed: number,
  person: { customer: Customer; account: Account },
  phone: Device,
  homeIp: Ip,
  shops: Merchant[],
  gift: Merchant,
): Txn[] {
  history(bag, person, phone, homeIp, [shops[5]], 24, 2_000 + (seed % 20) * 50);
  const attack = device(bag, "Windows laptop", "Windows 11", "Chrome");
  const remote = ip(bag, "Ashburn", "US", true, false);
  const start = stamp(2026, 8, 8, 2, 20);
  const probes = 8 + (seed % 5);
  const episode: Txn[] = [];
  for (let i = 0; i < probes; i += 1) {
    episode.push(pay(bag, person, attack, remote, shops[i % 5], start + i * 90, 120 + randInt(rng, 280), i % 2 === 0 ? "declined" : "approved", "card_purchase"));
  }
  episode.push(pay(bag, person, attack, remote, gift, start + probes * 90, 15_000 + (seed % 70) * 100, "approved", "card_purchase"));
  return episode;
}

function takeover(
  bag: Bag,
  rng: () => number,
  seed: number,
  person: { customer: Customer; account: Account },
  phone: Device,
  homeIp: Ip,
  grocery: Merchant,
  gift: Merchant,
  electronics: Merchant,
): Txn[] {
  history(bag, person, phone, homeIp, [grocery], 22, 1_400 + (seed % 15) * 40);
  const pixel = device(bag, "Pixel 8", "Android 15", "Chrome");
  const vpn = ip(bag, "Lagos", "NG", false, true);
  const start = stamp(2026, 8, 8, 20, 10);
  const amounts = [26_500 + randInt(rng, 20) * 100, 42_000 + (seed % 30) * 100, 64_000 + (seed % 40) * 100];
  const shops = [gift, electronics, gift];
  return amounts.map((amount, index) => pay(bag, person, pixel, vpn, shops[index], start + index * 600, amount, "approved", "card_purchase"));
}

function trip(
  bag: Bag,
  rng: () => number,
  seed: number,
  person: { customer: Customer; account: Account },
  phone: Device,
  homeIp: Ip,
  grocery: Merchant,
  airline: Merchant,
  hotel: Merchant,
  homeCountry: string,
): Txn[] {
  history(bag, person, phone, homeIp, [grocery], 20, 3_200 + (seed % 12) * 80);
  const abroadCity = homeCountry === "PT" ? "Berlin" : "Lisbon";
  const abroadCountry = homeCountry === "PT" ? "DE" : "PT";
  const abroad = ip(bag, abroadCity, abroadCountry, false, false);
  const start = stamp(2026, 8, 8, 18, 0);
  return [
    pay(bag, person, phone, abroad, airline, start, 22_000 + (seed % 40) * 100, "approved", "card_purchase"),
    pay(bag, person, phone, abroad, hotel, start + 3600, 14_000 + randInt(rng, 30) * 100, "approved", "card_purchase"),
  ];
}

function mule(
  bag: Bag,
  rng: () => number,
  seed: number,
  sender: { customer: Customer; account: Account },
  senderPhone: Device,
  homeIp: Ip,
  grocery: Merchant,
  crypto: Merchant,
): { world: World; caseInput: CaseInput; truth: Truth } {
  history(bag, sender, senderPhone, homeIp, [grocery], 18, 4_000);
  const muleHome: [string, string] = ["Austin", "US"];
  const mulePerson = makeCustomer(bag, pick(rng, FIRST), pick(rng, LAST), muleHome, 17);
  const hopper = makeCustomer(bag, pick(rng, FIRST), pick(rng, LAST), ["Paris", "FR"], 18);
  const mulePhone = device(bag, "iPhone", "iOS 18", "Safari");
  const laptop = device(bag, "Windows laptop", "Windows 11", "Chrome");
  enroll(bag, mulePerson.customer, mulePhone);
  const muleIp = ip(bag, "Austin", "US", false, false);
  const day = stamp(2026, 8, 8, 13, 0);
  pay(bag, mulePerson, mulePhone, muleIp, grocery, day - 10 * 86400, 450 + (seed % 10) * 20, "approved", "card_purchase");
  const inbound = 100_000 + (seed % 20) * 1000;
  const outbound = inbound - 8_000;
  pay(bag, sender, senderPhone, homeIp, null, day, inbound, "approved", "p2p_out", mulePerson.account.id);
  pay(bag, mulePerson, laptop, muleIp, null, day + 20, inbound, "approved", "p2p_in", sender.account.id);
  const lead = pay(bag, mulePerson, laptop, muleIp, null, day + 7200, outbound, "approved", "p2p_out", hopper.account.id);
  pay(bag, hopper, laptop, ip(bag, "Paris", "FR", false, false), null, day + 7300, outbound, "approved", "p2p_in", mulePerson.account.id);
  pay(bag, hopper, laptop, ip(bag, "Austin", "US", false, false), crypto, day + 10800, outbound - 4_000, "approved", "cash_out");
  const episode = bag.world.transactions.filter((txn) => txn.customer_id === mulePerson.customer.id && txn.ts >= day);
  return {
    world: bag.world,
    caseInput: caseFor(mulePerson.customer.id, lead, episode, ["shared_device", "new_account_amount"], seed),
    truth: { scenario: "mule_chain", label: LABELS.mule_chain, fraud: true },
  };
}

function collusion(bag: Bag, rng: () => number, seed: number, keys: Merchant, grocery: Merchant): { world: World; caseInput: CaseInput; truth: Truth } {
  const laptopA = device(bag, "Windows laptop", "Windows 11", "Chrome");
  const laptopB = device(bag, "MacBook", "macOS 15", "Safari");
  const when = stamp(2026, 8, 8, 14, 0);
  let lead: Txn | null = null;
  let leadCustomer = "";
  let leadEpisode: Txn[] = [];
  for (let index = 0; index < 4; index += 1) {
    const city: [string, string] = index % 2 === 0 ? ["Tallinn", "EE"] : ["Riga", "LV"];
    const person = makeCustomer(bag, FIRST[(seed + index) % FIRST.length], LAST[(seed * 3 + index) % LAST.length], city, 16);
    const phone = device(bag, "iPhone", "iOS 18", "Safari");
    enroll(bag, person.customer, phone);
    const local = ip(bag, city[0], city[1] === "LV" ? "LV" : "EE", false, false);
    pay(bag, person, phone, local, grocery, when - 8 * 86400, 500 + randInt(rng, 40) * 10, "approved", "card_purchase");
    const shared = index < 2 ? laptopA : laptopB;
    const small = pay(bag, person, shared, local, keys, when + index * 120, 25_000, "approved", "card_purchase");
    const large = pay(bag, person, shared, local, keys, when + 7200 + index * 120, 50_000, "approved", "card_purchase");
    if (index === 0) {
      lead = large;
      leadCustomer = person.customer.id;
      leadEpisode = [small, large];
    }
  }
  if (!lead) throw new Error("Collusion lead was not created");
  return {
    world: bag.world,
    caseInput: caseFor(leadCustomer, lead, leadEpisode, ["shared_device", "new_account_amount"], seed),
    truth: { scenario: "merchant_collusion", label: LABELS.merchant_collusion, fraud: true },
  };
}

function finish(
  bag: Bag,
  seed: number,
  person: { customer: Customer; account: Account },
  episode: Txn[],
  scenario: PlantedScenario,
  reasons: string[],
): { world: World; caseInput: CaseInput; truth: Truth } {
  const lead = episode.reduce((best, txn) => (txn.amount_cents > best.amount_cents ? txn : best), episode[0]);
  return {
    world: bag.world,
    caseInput: caseFor(person.customer.id, lead, episode, reasons, seed),
    truth: { scenario, label: LABELS[scenario], fraud: scenario !== "genuine" },
  };
}

function caseFor(customerId: string, lead: Txn, episode: Txn[], reasons: string[], seed: number): CaseInput {
  const ordered = [...episode].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
  return {
    case_id: `live_${seed}`,
    customer_id: customerId,
    lead_transaction_id: lead.id,
    flagged_transaction_ids: ordered.map((txn) => txn.id),
    covered_transaction_ids: ordered.map((txn) => txn.id),
    window_start: ordered[0].ts,
    window_end: ordered[ordered.length - 1].ts,
    flag_reasons: reasons,
  };
}

function history(bag: Bag, person: { customer: Customer; account: Account }, phone: Device, homeIp: Ip, shops: Merchant[], count: number, median: number) {
  const end = stamp(2026, 8, 1, 12, 0);
  for (let i = 0; i < count; i += 1) {
    const ts = end - (count - i) * 3 * 86400;
    const amount = median + ((i % 5) - 2) * 180;
    pay(bag, person, phone, homeIp, shops[i % shops.length], ts, Math.max(400, amount), "approved", "card_purchase");
  }
}

function makeCustomer(bag: Bag, first: string, last: string, city: [string, string], ageDays: number): { customer: Customer; account: Account } {
  const opened = stamp(2026, 8, 8, 12, 0) - ageDays * 86400;
  const customer: Customer = {
    id: nextId(bag, "cus"),
    name: `${first} ${last}`,
    first_name: first,
    last_name: last,
    email: `${first}.${last}.${bag.seq}@example.com`.toLowerCase(),
    home_city: city[0],
    home_country: city[1],
    created_at: isoFromSeconds(opened),
    created_ts: opened,
  };
  const account: Account = {
    id: nextId(bag, "acct"),
    customer_id: customer.id,
    opened_at: customer.created_at,
    opened_ts: opened,
    status: "open",
  };
  bag.world.customers.push(customer);
  bag.world.accounts.push(account);
  return { customer, account };
}

function device(bag: Bag, hardware: string, os: string, browser: string): Device {
  const row: Device = { id: nextId(bag, "dev"), hardware, os, browser };
  bag.world.devices.push(row);
  return row;
}

function ip(bag: Bag, city: string, country: string, datacenter: boolean, vpn: boolean): Ip {
  const row: Ip = {
    id: nextId(bag, "ip"),
    address: `203.0.113.${(bag.seq % 200) + 1}`,
    city,
    country,
    is_datacenter: datacenter,
    is_vpn: vpn,
  };
  bag.world.ips.push(row);
  return row;
}

function merchant(bag: Bag, name: string, category: string, city: string, country: string): Merchant {
  const row: Merchant = { id: nextId(bag, "mer"), name, category, city, country };
  bag.world.merchants.push(row);
  return row;
}

function enroll(bag: Bag, customer: Customer, deviceRow: Device) {
  const row: Enrollment = { customer_id: customer.id, device_id: deviceRow.id, enrolled_ts: customer.created_ts };
  bag.world.enrollments.push(row);
}

function pay(
  bag: Bag,
  person: { customer: Customer; account: Account },
  deviceRow: Device,
  ipRow: Ip,
  shop: Merchant | null,
  ts: number,
  amount: number,
  status: string,
  type: string,
  counterparty: string | null = null,
): Txn {
  const txn: Txn = {
    id: nextId(bag, "txn"),
    ts,
    occurred_at: isoFromSeconds(ts),
    customer_id: person.customer.id,
    account_id: person.account.id,
    card_last4: type.startsWith("p2p") || type === "cash_out" ? null : String(1000 + (bag.seq % 9000)).slice(-4),
    device_id: deviceRow.id,
    ip_id: ipRow.id,
    merchant_id: shop?.id ?? null,
    amount_cents: amount,
    status,
    type,
    counterparty_account_id: counterparty,
  };
  bag.world.transactions.push(txn);
  return txn;
}

function nextId(bag: Bag, prefix: string): string {
  bag.seq += 1;
  return `${prefix}_${String(bag.seq).padStart(4, "0")}`;
}

function pick(rng: () => number, list: string[]): string {
  return list[randInt(rng, list.length)];
}

function daysBefore(seed: number, base: number): number {
  return base + (seed % 80);
}

function stamp(year: number, month: number, day: number, hour: number, minute: number): number {
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute) / 1000);
}
