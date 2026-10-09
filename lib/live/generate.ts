import { investigate } from "./investigate";
import { isoFromSeconds, mulberry32, randInt } from "./format";
import { PLANTED, resolveScenario } from "./scenarios";
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

export { PLANTED, resolveScenario };

const LABELS: Record<PlantedScenario, string> = {
  card_testing: "Card testing",
  account_takeover: "Account takeover",
  mule_chain: "Mule chain",
  merchant_collusion: "Merchant collusion",
  genuine: "Genuine trip",
};

// The same name pools as the Python generator: a first name and a surname from one community.
const COMMUNITIES: { first: string[]; last: string[] }[] = [
  { first: ["Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Neha"], last: ["Sharma", "Gupta", "Verma", "Mishra", "Agarwal"] },
  { first: ["Karthik", "Lakshmi", "Arjun", "Deepa", "Suresh", "Kavya"], last: ["Iyer", "Nair", "Menon", "Pillai", "Krishnan"] },
  { first: ["Arnab", "Ritika", "Sourav", "Moumita", "Debashish", "Ishita"], last: ["Banerjee", "Chatterjee", "Ghosh", "Bose", "Mukherjee"] },
  { first: ["Siddharth", "Sneha", "Aditya", "Riya", "Kunal", "Pooja"], last: ["Kulkarni", "Joshi", "Desai", "Patel", "Mehta"] },
  { first: ["Faisal", "Zara", "Farhan", "Fatima", "Imtiaz", "Sana"], last: ["Khan", "Qureshi", "Siddiqui", "Ansari", "Shaikh"] },
  { first: ["Harpreet", "Gurleen", "Manpreet", "Simran", "Jaspreet", "Navjot"], last: ["Gill", "Sandhu", "Dhillon", "Grewal", "Bedi"] },
  { first: ["Venkat", "Sravani", "Praveen", "Divya", "Naveen", "Bhavana"], last: ["Reddy", "Rao", "Naidu", "Hegde", "Shetty"] },
];
const CITIES: [string, string][] = [
  ["Mumbai", "IN"],
  ["Delhi", "IN"],
  ["Bengaluru", "IN"],
  ["Chennai", "IN"],
  ["Kolkata", "IN"],
  ["Hyderabad", "IN"],
  ["Pune", "IN"],
  ["Jaipur", "IN"],
];

export async function runLive(choice: ScenarioChoice, seed: number): Promise<{ investigation: Investigation; truth: Truth }> {
  const scenario = resolveScenario(choice, seed);
  const built = buildWorld(scenario, seed);
  return {
    investigation: await investigate(built.world, built.caseInput),
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
  const person = makeCustomer(bag, ...pickName(rng), home, daysBefore(seed, 700));
  const phone = device(bag, "iPhone", "iOS 18", "Safari");
  const homeIp = ip(bag, home[0], home[1], false, false);
  enroll(bag, person.customer, phone);
  const grocery = merchant(bag, "Annapurna Grocers", "grocery", home[0], home[1]);
  const coffee = merchant(bag, "Filter Kaapi Co", "coffee", home[0], home[1]);
  const gift = merchant(bag, "Uphaar Gift Cards", "gift_card", "Mumbai", "IN");
  const electronics = merchant(bag, "Prism Electronics", "electronics", "Bengaluru", "IN");
  const airline = merchant(bag, "SkyVahan Airways", "airline", "Delhi", "IN");
  const hotel = merchant(bag, "Ashoka Stays", "hotel", "Singapore", "SG");
  const crypto = merchant(bag, "Sikka Crypto Exchange", "crypto", "Bengaluru", "IN");
  const keys = merchant(bag, "Vistar Digital Keys", "digital_goods", "Gurugram", "IN");
  const shops = [
    merchant(bag, "Tohfa Gift Co", "gift_card", "Delhi", "IN"),
    merchant(bag, "Megh Cloud Apps", "digital_goods", "Pune", "IN"),
    merchant(bag, "Raga Streaming", "digital_goods", "Mumbai", "IN"),
    merchant(bag, "ParkEasy Parking", "transit", "Chennai", "IN"),
    gift,
    coffee,
  ];

  if (scenario === "card_testing") return finish(bag, seed, person, cardTesting(bag, rng, seed, person, phone, homeIp, shops, gift), "card_testing", ["new_device", "foreign_ip", "velocity_1h"]);
  if (scenario === "account_takeover") return finish(bag, seed, person, takeover(bag, rng, seed, person, phone, homeIp, grocery, gift, electronics), "account_takeover", ["new_device", "foreign_ip", "amount_outlier"]);
  if (scenario === "mule_chain") return mule(bag, rng, seed, person, phone, homeIp, grocery, crypto);
  if (scenario === "merchant_collusion") return collusion(bag, rng, seed, keys, grocery);
  return finish(bag, seed, person, trip(bag, rng, seed, person, phone, homeIp, grocery, airline, hotel), "genuine", ["foreign_ip"]);
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
  history(bag, person, phone, homeIp, [shops[5]], 24, 80_000 + (seed % 20) * 2_000);
  const attack = device(bag, "Windows laptop", "Windows 11", "Chrome");
  const remote = ip(bag, "Ashburn", "US", true, false);
  const start = stamp(2026, 8, 8, 2, 20);
  const probes = 8 + (seed % 5);
  const episode: Txn[] = [];
  for (let i = 0; i < probes; i += 1) {
    episode.push(pay(bag, person, attack, remote, shops[i % 5], start + i * 90, 4_800 + randInt(rng, 280) * 40, i % 2 === 0 ? "declined" : "approved", "card_purchase"));
  }
  episode.push(pay(bag, person, attack, remote, gift, start + probes * 90, 600_000 + (seed % 70) * 4_000, "approved", "card_purchase"));
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
  history(bag, person, phone, homeIp, [grocery], 22, 56_000 + (seed % 15) * 1_600);
  const stranger = device(bag, "Redmi Note 13", "Android 14", "Chrome");
  const vpn = ip(bag, "Lagos", "NG", false, true);
  const start = stamp(2026, 8, 8, 20, 10);
  const amounts = [1_060_000 + randInt(rng, 20) * 4_000, 1_680_000 + (seed % 30) * 4_000, 2_560_000 + (seed % 40) * 4_000];
  const shops = [gift, electronics, gift];
  return amounts.map((amount, index) => pay(bag, person, stranger, vpn, shops[index], start + index * 600, amount, "approved", "card_purchase"));
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
): Txn[] {
  history(bag, person, phone, homeIp, [grocery], 20, 128_000 + (seed % 12) * 3_200);
  const abroad = ip(bag, "Singapore", "SG", false, false);
  const start = stamp(2026, 8, 8, 18, 0);
  return [
    pay(bag, person, phone, abroad, airline, start, 880_000 + (seed % 40) * 4_000, "approved", "card_purchase"),
    pay(bag, person, phone, abroad, hotel, start + 3600, 560_000 + randInt(rng, 30) * 4_000, "approved", "card_purchase"),
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
  history(bag, sender, senderPhone, homeIp, [grocery], 18, 160_000);
  const muleHome: [string, string] = ["Hyderabad", "IN"];
  const mulePerson = makeCustomer(bag, ...pickName(rng), muleHome, 17);
  const hopper = makeCustomer(bag, ...pickName(rng), ["Kolkata", "IN"], 18);
  const mulePhone = device(bag, "iPhone", "iOS 18", "Safari");
  const laptop = device(bag, "Windows laptop", "Windows 11", "Chrome");
  enroll(bag, mulePerson.customer, mulePhone);
  const muleIp = ip(bag, "Hyderabad", "IN", false, false);
  const day = stamp(2026, 8, 8, 13, 0);
  pay(bag, mulePerson, mulePhone, muleIp, grocery, day - 10 * 86400, 18_000 + (seed % 10) * 800, "approved", "card_purchase");
  const inbound = 4_000_000 + (seed % 20) * 40_000;
  const outbound = inbound - 320_000;
  pay(bag, sender, senderPhone, homeIp, null, day, inbound, "approved", "p2p_out", mulePerson.account.id);
  pay(bag, mulePerson, laptop, muleIp, null, day + 20, inbound, "approved", "p2p_in", sender.account.id);
  const lead = pay(bag, mulePerson, laptop, muleIp, null, day + 7200, outbound, "approved", "p2p_out", hopper.account.id);
  pay(bag, hopper, laptop, ip(bag, "Kolkata", "IN", false, false), null, day + 7300, outbound, "approved", "p2p_in", mulePerson.account.id);
  pay(bag, hopper, laptop, ip(bag, "Hyderabad", "IN", false, false), crypto, day + 10800, outbound - 160_000, "approved", "cash_out");
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
    const city: [string, string] = index % 2 === 0 ? ["Gurugram", "IN"] : ["Noida", "IN"];
    const community = COMMUNITIES[(seed + index) % COMMUNITIES.length];
    const person = makeCustomer(bag, community.first[(seed + index) % community.first.length], community.last[(seed * 3 + index) % community.last.length], city, 16);
    const phone = device(bag, "iPhone", "iOS 18", "Safari");
    enroll(bag, person.customer, phone);
    const local = ip(bag, city[0], city[1], false, false);
    pay(bag, person, phone, local, grocery, when - 8 * 86400, 20_000 + randInt(rng, 40) * 400, "approved", "card_purchase");
    const shared = index < 2 ? laptopA : laptopB;
    const small = pay(bag, person, shared, local, keys, when + index * 120, 1_000_000, "approved", "card_purchase");
    const large = pay(bag, person, shared, local, keys, when + 7200 + index * 120, 2_000_000, "approved", "card_purchase");
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
  const lead = episode.reduce((best, txn) => (txn.amount_paise > best.amount_paise ? txn : best), episode[0]);
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
    const amount = median + ((i % 5) - 2) * 7_200;
    pay(bag, person, phone, homeIp, shops[i % shops.length], ts, Math.max(16_000, amount), "approved", "card_purchase");
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
    amount_paise: amount,
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

function pickName(rng: () => number): [string, string] {
  const community = COMMUNITIES[randInt(rng, COMMUNITIES.length)];
  return [community.first[randInt(rng, community.first.length)], community.last[randInt(rng, community.last.length)]];
}

function daysBefore(seed: number, base: number): number {
  return base + (seed % 80);
}

function stamp(year: number, month: number, day: number, hour: number, minute: number): number {
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute) / 1000);
}
