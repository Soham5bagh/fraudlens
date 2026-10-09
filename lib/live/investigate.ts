import { Annotation, END, START, StateGraph } from "@langchain/langgraph/web";
import type { Action } from "@/lib/types";
import { Catalog } from "./catalog";
import {
  clock,
  countryName,
  isoFromMs,
  medianInt,
  minutesBetween,
  money,
  nameList,
  othersOnDevice,
  pct0,
  plural,
  shortClock,
  times,
  wholeRupees,
} from "./format";
import type { CaseInput, Evidence, Investigation, TimelineStep, Txn, World } from "./types";

// 10:00 IST on the morning after the book closes.
const REVIEW_MS = Date.UTC(2026, 7, 11, 4, 30, 0);
// Amounts are paise. A round amount is a whole multiple of ₹1,000, and at least ₹8,000.
const ROUND_PAISE = 100_000;
const ROUND_FLOOR_PAISE = 800_000;
const TRAVEL = new Set(["airline", "hotel", "transit", "restaurant"]);
const RISKY = new Set(["gift_card", "crypto", "electronics", "wire"]);
const PATTERN_LABELS: Record<string, string> = {
  card_testing: "Card testing",
  account_takeover: "Account takeover",
  mule_chain: "Mule-account chain",
  merchant_collusion: "Merchant collusion",
  legitimate: "Legitimate activity",
};
const REASON_TEXT: Record<string, string> = {
  velocity_1h: "Five or more payments in the past hour",
  amount_outlier: "Amount is far above this customer's own baseline",
  new_device: "Device has never been used by this customer before",
  foreign_ip: "IP country does not match the customer's home country",
  shared_device: "Device is already linked to a different customer",
  new_account_amount: "Account is under 30 days old and the amount is large",
  isolation_forest: "The payment's shape is an outlier for the whole book",
};

type Linked = {
  customer_id: string;
  name: string;
  last_name: string;
  city: string;
  device_id: string;
};

type Facts = {
  enrolled: Set<string>;
  lead: Txn;
  customer: World["customers"][number];
  merchantName: string;
  account: World["accounts"][number];
  baseline: Txn[];
  baselineMedian: number;
  baselineCount: number;
  accountAgeDays: number;
  baselineDevices: string[];
  episode: Txn[];
  peakVelocity: number;
  declineCount: number;
  spanMinutes: number;
  episodeMerchants: string[];
  episodeAmounts: number[];
  episodeMedian: number;
  episodePeak: number;
  peakRatio: number | null;
  newDevices: string[];
  episodeDevices: string[];
  knownMature: string[];
  episodeCountries: string[];
  foreign: boolean;
  datacenter: boolean;
  vpn: boolean;
  linked: Linked[];
  reachesCash: boolean;
  chainLabels: string[];
  passthrough: number;
  inboundSum: number;
  outboundSum: number;
  sameHousehold: boolean;
  counterpartyYoung: boolean;
  merchant: World["merchants"][number] | null;
  merchantStats: {
    buyers: number;
    youngShare: number;
    roundShare: number;
    sharedDevices: string[];
    categories: string[];
  };
  pattern: string;
  patternDetail: string;
  patternReasons: string[];
  signals: { name: string; points: number; detail: string }[];
  score: number;
  action: Action;
  rationale: string;
};

type State = {
  catalog: Catalog;
  caseInput: CaseInput;
  clock: number;
  timeline: TimelineStep[];
  facts: Facts;
};

const LiveState = Annotation.Root({
  catalog: Annotation<Catalog>(),
  caseInput: Annotation<CaseInput>(),
  clock: Annotation<number>(),
  timeline: Annotation<TimelineStep[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  facts: Annotation<Facts>(),
});

type GraphState = typeof LiveState.State;

function node(run: (state: State) => void) {
  return (state: GraphState) => {
    const scratch: State = {
      catalog: state.catalog,
      caseInput: state.caseInput,
      clock: state.clock,
      timeline: [],
      facts: { ...state.facts },
    };
    run(scratch);
    return { clock: scratch.clock, timeline: scratch.timeline, facts: scratch.facts };
  };
}

function routeAfterNetwork(state: GraphState): "merchant" | "transfer" {
  return state.catalog.merchant(state.facts.lead.merchant_id) ? "merchant" : "transfer";
}

function buildInvestigationGraph() {
  return new StateGraph(LiveState)
    .addNode("open_case", node(openCase))
    .addNode("customer_baseline", node(customerBaseline))
    .addNode("velocity", node(velocityCheck))
    .addNode("amount", node(amountAnalysis))
    .addNode("device_ip", node(deviceAndIp))
    .addNode("network", node(linkedAccounts))
    .addNode("merchant", node(merchantCheck))
    .addNode("transfer", node(transferCheck))
    .addNode("classify", node(classify))
    .addNode("recommend", node(recommend))
    .addEdge(START, "open_case")
    .addEdge("open_case", "customer_baseline")
    .addEdge("customer_baseline", "velocity")
    .addEdge("velocity", "amount")
    .addEdge("amount", "device_ip")
    .addEdge("device_ip", "network")
    .addConditionalEdges("network", routeAfterNetwork, { merchant: "merchant", transfer: "transfer" })
    .addEdge("merchant", "classify")
    .addEdge("transfer", "classify")
    .addEdge("classify", "recommend")
    .addEdge("recommend", END)
    .compile();
}

let compiled: ReturnType<typeof buildInvestigationGraph> | null = null;

/** The compiled LangGraph, built once and shared by every live file. */
export function investigationGraph() {
  compiled ??= buildInvestigationGraph();
  return compiled;
}

/**
 * Investigate a flagged case from the ledger alone.
 * The planted scenario is not an argument and is not read off the world.
 */
export async function investigate(world: World, caseInput: CaseInput): Promise<Investigation> {
  const asOf = Math.max(...world.transactions.map((txn) => txn.ts));
  const catalog = new Catalog(world, asOf);
  const enrolled = new Set(
    world.enrollments
      .filter((row) => row.customer_id === caseInput.customer_id && row.enrolled_ts < caseInput.window_start)
      .map((row) => row.device_id),
  );
  const lead = catalog.txns.find((txn) => txn.id === caseInput.lead_transaction_id);
  if (!lead) throw new Error(`Lead ${caseInput.lead_transaction_id} is not in the ledger`);
  const customer = catalog.customer(caseInput.customer_id);
  const merchant = catalog.merchant(lead.merchant_id);
  const final = await investigationGraph().invoke({
    catalog,
    caseInput,
    clock: REVIEW_MS,
    timeline: [],
    facts: emptyFacts(lead, customer, merchant?.name ?? "UPI transfer", enrolled),
  });
  return assemble(final);
}

function emptyFacts(lead: Txn, customer: World["customers"][number], merchantName: string, enrolled: Set<string>): Facts {
  return {
    enrolled,
    lead,
    customer,
    merchantName,
    account: { id: "", customer_id: customer.id, opened_at: "", opened_ts: 0, status: "open" },
    baseline: [],
    baselineMedian: 0,
    baselineCount: 0,
    accountAgeDays: 0,
    baselineDevices: [],
    episode: [],
    peakVelocity: 1,
    declineCount: 0,
    spanMinutes: 0,
    episodeMerchants: [],
    episodeAmounts: [],
    episodeMedian: 0,
    episodePeak: 0,
    peakRatio: null,
    newDevices: [],
    episodeDevices: [],
    knownMature: [],
    episodeCountries: [],
    foreign: false,
    datacenter: false,
    vpn: false,
    linked: [],
    reachesCash: false,
    chainLabels: [],
    passthrough: 0,
    inboundSum: 0,
    outboundSum: 0,
    sameHousehold: false,
    counterpartyYoung: false,
    merchant: null,
    merchantStats: { buyers: 0, youngShare: 0, roundShare: 0, sharedDevices: [], categories: [] },
    pattern: "legitimate",
    patternDetail: "baseline",
    patternReasons: [],
    signals: [],
    score: 0,
    action: "approve",
    rationale: "",
  };
}

function step(state: State, id: string, title: string, status: TimelineStep["status"], finding: string, evidence: Evidence[], durationMs: number) {
  state.timeline.push({
    id,
    title,
    status,
    started_at: isoFromMs(state.clock),
    duration_ms: durationMs,
    finding,
    evidence,
  });
  state.clock += durationMs + 350;
}

function episodeOf(state: State): Txn[] {
  const { caseInput, catalog } = state;
  return (catalog.byCustomer.get(caseInput.customer_id) ?? []).filter(
    (txn) => caseInput.window_start - 3600 <= txn.ts && txn.ts <= caseInput.window_end + 900,
  );
}

function baselineOf(state: State): Txn[] {
  const { caseInput, catalog } = state;
  return (catalog.byCustomer.get(caseInput.customer_id) ?? []).filter((txn) => txn.ts < caseInput.window_start - 3600);
}

function openCase(state: State) {
  const { lead, customer } = state.facts;
  const reasons = state.caseInput.flag_reasons.map((code) => REASON_TEXT[code] ?? code);
  step(
    state,
    "open_case",
    "Open the flagged payment",
    "watch",
    `Queue sent ${lead.id} for ${customer.name}: ${money(lead.amount_paise)} ${where(state.catalog.merchant(lead.merchant_id))} on ${clock(lead.ts)}. The flagger's reasons were: ${reasons.join("; ")}.`,
    [
      { label: "Transaction", value: lead.id },
      { label: "Amount", value: money(lead.amount_paise) },
      { label: "Customer", value: `${customer.name} (${customer.id})` },
      { label: "Why it was queued", value: state.caseInput.flag_reasons.join(", ") },
    ],
    420,
  );
}

function customerBaseline(state: State) {
  const catalog = state.catalog;
  const customer = state.facts.customer;
  const account = catalog.accountForCustomer(customer.id);
  const baseline = baselineOf(state);
  const lead = state.facts.lead;
  const amounts = baseline.filter((txn) => txn.status === "approved").map((txn) => txn.amount_paise);
  const median = amounts.length ? medianInt(amounts) : 0;
  const ageDays = Math.max(0, Math.trunc((lead.ts - account.opened_ts) / 86400));
  const devices = [...new Set(baseline.map((txn) => txn.device_id))].sort();
  const countries = [...new Set(baseline.map((txn) => catalog.ips.get(txn.ip_id)?.country ?? ""))].filter(Boolean).sort();
  state.facts.account = account;
  state.facts.baseline = baseline;
  state.facts.baselineMedian = median;
  state.facts.baselineCount = baseline.length;
  state.facts.accountAgeDays = ageDays;
  state.facts.baselineDevices = devices;
  const finding = baseline.length
    ? `${customer.name} has ${plural(baseline.length, "prior payment")} before this episode, median ${money(median)}. Account ${account.id} is ${plural(ageDays, "day")} old. Usual devices: ${devices.join(", ")}. Countries already seen: ${countries.join(", ") || "none"}.`
    : `${customer.name} has no payments before this episode. Account ${account.id} was opened ${plural(ageDays, "day")} ago, so there is no personal baseline to lean on.`;
  step(
    state,
    "customer_baseline",
    "Customer history and baseline",
    baseline.length ? "clear" : "watch",
    finding,
    [
      { label: "Account age", value: plural(ageDays, "day") },
      { label: "Prior payments", value: String(baseline.length) },
      { label: "Median amount", value: median ? money(median) : "no baseline" },
      { label: "Home", value: `${customer.home_city}, ${customer.home_country}` },
    ],
    680,
  );
}

function velocityCheck(state: State) {
  const episode = episodeOf(state);
  const lead = state.facts.lead;
  let peak = 1;
  for (const txn of episode) {
    const window = episode.filter((other) => other.ts - txn.ts >= 0 && other.ts - txn.ts <= 3600);
    if (window.length > peak) peak = window.length;
  }
  const declines = episode.filter((txn) => txn.status === "declined");
  const span = episode.length ? minutesBetween(episode[0].ts, episode[episode.length - 1].ts) : 0;
  const merchants: string[] = [];
  for (const txn of episode) {
    const merchant = state.catalog.merchant(txn.merchant_id);
    const name = merchant ? merchant.name : "UPI transfer";
    if (!merchants.includes(name)) merchants.push(name);
  }
  state.facts.episode = episode;
  state.facts.peakVelocity = peak;
  state.facts.declineCount = declines.length;
  state.facts.spanMinutes = span;
  state.facts.episodeMerchants = merchants;
  state.facts.episodeAmounts = episode.map((txn) => txn.amount_paise);
  step(
    state,
    "velocity",
    "Payment velocity",
    peak >= 5 || declines.length >= 3 ? "alert" : "clear",
    `The episode around ${lead.id} holds ${plural(episode.length, "payment")} across ${plural(span, "minute")}. The busiest hour contains ${plural(peak, "payment")}. ${plural(declines.length, "decline")} in the episode. Merchants touched: ${nameList(merchants)}.`,
    [
      { label: "Payments in episode", value: String(episode.length) },
      { label: "Busiest hour", value: String(peak) },
      { label: "Declines", value: String(declines.length) },
      { label: "Distinct merchants", value: String(merchants.length) },
    ],
    540,
  );
}

function amountAnalysis(state: State) {
  const amounts = state.facts.episodeAmounts;
  const median = state.facts.baselineMedian;
  const episodeMedian = amounts.length ? medianInt(amounts) : 0;
  const peak = amounts.length ? Math.max(...amounts) : 0;
  const ratio = median ? peak / median : null;
  state.facts.episodeMedian = episodeMedian;
  state.facts.episodePeak = peak;
  state.facts.peakRatio = ratio;
  let status: TimelineStep["status"] = "watch";
  let relation = "no baseline median to compare against";
  if (median && ratio != null && ratio >= 4) {
    status = "alert";
    relation = `${times(ratio)} the baseline median of ${money(median)}`;
  } else if (median && ratio != null) {
    status = "clear";
    relation = `in line with a baseline median of ${money(median)} (peak is ${times(ratio)})`;
  }
  step(
    state,
    "amount",
    "Amount versus baseline",
    status,
    `Episode amounts run from ${money(amounts.length ? Math.min(...amounts) : 0)} to ${money(peak)}, median ${money(episodeMedian)}. The peak is ${relation}.`,
    [
      { label: "Episode median", value: money(episodeMedian) },
      { label: "Episode peak", value: money(peak) },
      { label: "Baseline median", value: median ? money(median) : "none" },
      { label: "Peak vs baseline", value: ratio != null ? times(ratio) : "n/a" },
    ],
    480,
  );
}

function deviceAndIp(state: State) {
  const catalog = state.catalog;
  const episode = state.facts.episode;
  const baselineDevices = new Set(state.facts.baselineDevices);
  const customer = state.facts.customer;
  const enrolled = state.facts.enrolled;
  const newDevices: string[] = [];
  const countries: string[] = [];
  let datacenter = false;
  let vpn = false;
  for (const txn of episode) {
    const fresh = !baselineDevices.has(txn.device_id) && !enrolled.has(txn.device_id);
    if (fresh && !newDevices.includes(txn.device_id)) newDevices.push(txn.device_id);
    const ip = catalog.ips.get(txn.ip_id);
    const country = ip?.country ?? "";
    if (country && !countries.includes(country)) countries.push(country);
    datacenter = datacenter || Boolean(ip?.is_datacenter);
    vpn = vpn || Boolean(ip?.is_vpn);
  }
  const foreign = countries.some((country) => country !== customer.home_country);
  const weekBefore = state.caseInput.window_start - 7 * 86400;
  const mature = new Set(
    state.facts.baseline.filter((txn) => txn.ts <= weekBefore).map((txn) => txn.device_id),
  );
  const episodeDevices: string[] = [];
  for (const txn of episode) {
    if (!episodeDevices.includes(txn.device_id)) episodeDevices.push(txn.device_id);
  }
  const knownMature = episodeDevices.filter((id) => mature.has(id));
  state.facts.newDevices = newDevices;
  state.facts.episodeDevices = episodeDevices;
  state.facts.knownMature = knownMature;
  state.facts.episodeCountries = countries;
  state.facts.foreign = foreign;
  state.facts.datacenter = datacenter;
  state.facts.vpn = vpn;
  const status: TimelineStep["status"] = newDevices.length && foreign ? "alert" : newDevices.length || foreign ? "watch" : "clear";
  const deviceBits = episodeDevices.map((id) => {
    const marker = newDevices.includes(id) ? "new to this customer" : "already on file";
    return `${id} (${catalog.deviceLabel(id)}, ${marker})`;
  });
  const ipBits = [...new Set(episode.map((txn) => catalog.ipLabel(txn.ip_id)))].sort();
  step(
    state,
    "device_ip",
    "Device and IP linkage",
    status,
    `Devices in the episode: ${deviceBits.join("; ")}. IPs: ${ipBits.join("; ")}. ${countrySentence(customer.home_country, countries, foreign)}`,
    [
      { label: "New devices", value: newDevices.length ? newDevices.join(", ") : "none" },
      { label: "Mature devices reused", value: knownMature.length ? knownMature.join(", ") : "none" },
      { label: "Countries", value: countries.join(", ") },
      { label: "Datacenter or VPN", value: datacenter || vpn ? "yes" : "no" },
    ],
    730,
  );
}

function countrySentence(home: string, countries: string[], foreign: boolean): string {
  const name = countryName(home);
  if (foreign && countries.includes(home) && countries.length > 1) {
    return `The customer's home country is ${name}. Some payments in this episode are outside that country, and some are at home.`;
  }
  if (foreign) {
    return `The customer's home country is ${name}. Every payment in this episode is outside that country.`;
  }
  return `The customer's home country is ${name}. Every payment in this episode is there.`;
}

function linkedAccounts(state: State) {
  const catalog = state.catalog;
  const customer = state.facts.customer;
  const account = state.facts.account;
  const linked: Linked[] = [];
  for (const deviceId of state.facts.episodeDevices) {
    for (const otherId of catalog.customersOnDevice(deviceId)) {
      if (otherId === customer.id) continue;
      const other = catalog.customer(otherId);
      linked.push({
        customer_id: otherId,
        name: other.name,
        last_name: other.last_name,
        city: other.home_city,
        device_id: deviceId,
      });
    }
  }
  const deduped: Linked[] = [];
  const seen = new Set<string>();
  for (const item of linked) {
    if (seen.has(item.customer_id)) continue;
    seen.add(item.customer_id);
    deduped.push(item);
  }
  const graph = new Map<string, string[]>();
  const windowStart = state.caseInput.window_end - 6 * 86400;
  for (const txn of catalog.txns) {
    if (txn.ts < windowStart) continue;
    if (txn.type === "p2p_out" && txn.counterparty_account_id) addEdge(graph, txn.account_id, txn.counterparty_account_id);
    else if (txn.type === "cash_out" && txn.merchant_id) addEdge(graph, txn.account_id, `cash:${txn.merchant_id}`);
  }
  let reachesCash = false;
  let chainLabels: string[] = [];
  if (hasNode(graph, account.id)) {
    for (const node of descendants(graph, account.id)) {
      if (node.startsWith("cash:")) reachesCash = true;
    }
    chainLabels = describeChain(catalog, graph, account.id);
  }
  const inbound = (catalog.byAccount.get(account.id) ?? [])
    .filter((txn) => txn.type === "p2p_in" && txn.ts >= windowStart)
    .map((txn) => txn.amount_paise);
  const outbound = (catalog.byAccount.get(account.id) ?? [])
    .filter((txn) => (txn.type === "p2p_out" || txn.type === "cash_out") && txn.ts >= windowStart)
    .map((txn) => txn.amount_paise);
  const inboundSum = inbound.reduce((sum, value) => sum + value, 0);
  const outboundSum = outbound.reduce((sum, value) => sum + value, 0);
  const ratio = inboundSum ? outboundSum / inboundSum : 0;
  const lead = state.facts.lead;
  let counterpartyYoung = false;
  if (lead.type === "p2p_out" && lead.counterparty_account_id) {
    const counterparty = catalog.accounts.get(lead.counterparty_account_id);
    if (counterparty) counterpartyYoung = (lead.ts - counterparty.opened_ts) / 86400 < 45;
  }
  const sameHousehold = deduped.length > 0 && deduped.every((item) => item.last_name === customer.last_name && item.city === customer.home_city);
  state.facts.linked = deduped;
  state.facts.reachesCash = reachesCash;
  state.facts.chainLabels = chainLabels;
  state.facts.passthrough = ratio;
  state.facts.inboundSum = inboundSum;
  state.facts.outboundSum = outboundSum;
  state.facts.sameHousehold = sameHousehold;
  state.facts.counterpartyYoung = counterpartyYoung;
  const status: TimelineStep["status"] = reachesCash || (deduped.length && !sameHousehold) ? "alert" : deduped.length ? "watch" : "clear";
  const linkedText = deduped.length
    ? `These devices are also used by ${deduped.slice(0, 4).map((item) => `${item.name} (${item.customer_id}) via ${item.device_id}`).join(", ")}.`
    : "No other customer uses the devices in this episode.";
  const flowText = reachesCash && chainLabels.length
    ? `Funds from ${account.id} reach a cash-out inside the graph (${chainLabels.join(" → ")}).`
    : "No cash-out path leaves this account in the six-day money graph.";
  const household = sameHousehold ? " The other names share a surname and city, which fits a household rather than a mule ring." : "";
  step(
    state,
    "network",
    "Linked accounts and money flow",
    status,
    `${linkedText} ${flowSentence(inboundSum, outboundSum, ratio)} ${flowText}${household}`,
    [
      { label: "Linked customers", value: String(deduped.length) },
      { label: "Household pattern", value: sameHousehold ? "yes" : "no" },
      { label: "Reaches cash-out", value: reachesCash ? "yes" : "no" },
      { label: "Pass-through", value: inboundSum ? pct0(ratio) : "no inbound" },
    ],
    860,
  );
}

function flowSentence(inboundSum: number, outboundSum: number, ratio: number): string {
  if (inboundSum && outboundSum) return `Inbound transfers ${money(inboundSum)}, outbound ${money(outboundSum)}, pass-through ${pct0(ratio)}.`;
  if (outboundSum) return `No inbound transfer in this window. ${money(outboundSum)} was sent on.`;
  if (inboundSum) return `Inbound transfers ${money(inboundSum)}. Nothing was sent on.`;
  return "No UPI transfer or cash-out on this account in the six-day window.";
}

function addEdge(graph: Map<string, string[]>, source: string, target: string) {
  const next = graph.get(source);
  if (next) next.push(target);
  else graph.set(source, [target]);
  if (!graph.has(target)) graph.set(target, graph.get(target) ?? []);
}

function hasNode(graph: Map<string, string[]>, id: string): boolean {
  return graph.has(id);
}

function descendants(graph: Map<string, string[]>, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(graph.get(start) ?? [])];
  while (stack.length) {
    const node = stack.pop() as string;
    if (node === start || seen.has(node)) continue;
    seen.add(node);
    for (const next of graph.get(node) ?? []) stack.push(next);
  }
  return seen;
}

function describeChain(catalog: Catalog, graph: Map<string, string[]>, accountId: string): string[] {
  const labels = [accountLabel(catalog, accountId)];
  let current = accountId;
  for (let hop = 0; hop < 3; hop += 1) {
    const next = (graph.get(current) ?? [])[0];
    if (!next) break;
    if (next.startsWith("cash:")) {
      const merchant = catalog.merchant(next.slice(5));
      labels.push(merchant?.name ?? "cash-out");
      break;
    }
    labels.push(accountLabel(catalog, next));
    current = next;
  }
  return labels;
}

function accountLabel(catalog: Catalog, accountId: string): string {
  const account = catalog.accounts.get(accountId);
  if (!account) return accountId;
  const customer = catalog.customer(account.customer_id);
  return `${customer.name} (${accountId})`;
}

function transferCheck(state: State) {
  state.facts.merchant = null;
  state.facts.merchantStats = { buyers: 0, youngShare: 0, roundShare: 0, sharedDevices: [], categories: [] };
  step(
    state,
    "merchant",
    "Merchant check",
    "watch",
    "The lead movement is a transfer, not a card purchase, so there is no merchant to underwrite. The money-flow step carries that evidence.",
    [{ label: "Merchant", value: "none (transfer)" }],
    300,
  );
}

function merchantCheck(state: State) {
  const catalog = state.catalog;
  const lead = state.facts.lead;
  const merchant = catalog.merchant(lead.merchant_id);
  if (!merchant) throw new Error(`Merchant check reached without a merchant on ${lead.id}`);
  const recentStart = lead.ts - 14 * 86400;
  const recent = (catalog.byMerchant.get(merchant.id) ?? []).filter((txn) => txn.ts >= recentStart);
  const buyers: string[] = [];
  const young: string[] = [];
  let roundHits = 0;
  const devices = new Map<string, Set<string>>();
  for (const txn of recent) {
    if (!buyers.includes(txn.customer_id)) {
      buyers.push(txn.customer_id);
      const account = catalog.accounts.get(txn.account_id);
      if (account && (txn.ts - account.opened_ts) / 86400 < 45) young.push(txn.customer_id);
    }
    if (txn.amount_paise % ROUND_PAISE === 0 && txn.amount_paise >= ROUND_FLOOR_PAISE) roundHits += 1;
    const owners = devices.get(txn.device_id) ?? new Set<string>();
    owners.add(txn.customer_id);
    devices.set(txn.device_id, owners);
  }
  const sharedDevices = [...devices.entries()].filter(([, owners]) => owners.size >= 2).map(([id]) => id);
  const youngShare = buyers.length ? young.length / buyers.length : 0;
  const roundShare = recent.length ? roundHits / recent.length : 0;
  const categories: string[] = [];
  for (const txn of state.facts.episode) {
    const item = catalog.merchant(txn.merchant_id);
    if (item && !categories.includes(item.category)) categories.push(item.category);
  }
  const stats = { buyers: buyers.length, youngShare, roundShare, sharedDevices, categories };
  state.facts.merchant = merchant;
  state.facts.merchantStats = stats;
  const suspicious = youngShare >= 0.5 && buyers.length >= 4 && roundShare >= 0.5 && sharedDevices.length > 0;
  step(
    state,
    "merchant",
    "Merchant check",
    suspicious ? "alert" : "clear",
    `${merchant.name} (${merchant.category.replaceAll("_", " ")}, ${merchant.city}) has ${plural(recent.length, "payment")} in the past 14 days from ${plural(buyers.length, "customer")}. ${pct0(youngShare)} of those customers are under 45 days old. ${pct0(roundShare)} of the amounts are round (multiples of ${wholeRupees(ROUND_PAISE)}, at least ${wholeRupees(ROUND_FLOOR_PAISE)}). Devices shared by two or more buyers: ${sharedDevices.length ? sharedDevices.join(", ") : "none"}.`,
    [
      { label: "Category", value: merchant.category },
      { label: "Recent buyers", value: String(buyers.length) },
      { label: "Young-account share", value: pct0(youngShare) },
      { label: "Round-amount share", value: pct0(roundShare) },
    ],
    640,
  );
}

function categoriesOf(catalog: Catalog, txns: Txn[]): Set<string> {
  const found = new Set<string>();
  for (const txn of txns) {
    const merchant = catalog.merchant(txn.merchant_id);
    if (merchant) found.add(merchant.category);
  }
  return found;
}

function classify(state: State) {
  const facts = state.facts;
  const episode = facts.episode;
  const episodeMedian = facts.episodeMedian;
  const merchantCategories = new Set(facts.merchantStats.categories);
  const declines = facts.declineCount;
  const cardTesting =
    episode.length >= 6 &&
    episodeMedian < 80_000 &&
    facts.episodeMerchants.length >= 4 &&
    (declines >= 3 || (episode.length > 0 && declines / episode.length >= 0.25)) &&
    facts.newDevices.length > 0;
  const riskySpend = [...merchantCategories].some((category) => RISKY.has(category));
  const travelSpend = [...merchantCategories].some((category) => TRAVEL.has(category));
  const newTxns = episode.filter((txn) => facts.newDevices.includes(txn.device_id));
  const newCategories = categoriesOf(state.catalog, newTxns);
  const newPeak = newTxns.reduce((max, txn) => Math.max(max, txn.amount_paise), 0);
  const newRatio = facts.baselineMedian ? newPeak / facts.baselineMedian : 0;
  const newForeign = newTxns.some((txn) => (state.catalog.ips.get(txn.ip_id)?.country ?? "") !== facts.customer.home_country);
  const stats = facts.merchantStats;
  const lead = facts.lead;
  const collusion = Boolean(
    facts.merchant &&
      stats.buyers >= 4 &&
      stats.youngShare >= 0.5 &&
      stats.roundShare >= 0.5 &&
      stats.sharedDevices.length &&
      lead.amount_paise % ROUND_PAISE === 0 &&
      facts.accountAgeDays < 45,
  );
  const moneyMovement = ["p2p_out", "p2p_in", "cash_out"].includes(lead.type) || facts.reachesCash || facts.outboundSum > 0;
  let mule = false;
  if (moneyMovement && !facts.sameHousehold) {
    mule =
      facts.reachesCash ||
      facts.counterpartyYoung ||
      facts.passthrough >= 0.6 ||
      (facts.accountAgeDays < 45 && (facts.inboundSum >= 800_000 || facts.outboundSum >= 800_000)) ||
      (!facts.sameHousehold && facts.linked.length >= 1 && facts.outboundSum >= 800_000);
  }
  const ato =
    newTxns.length > 0 &&
    newForeign &&
    newRatio >= 4 &&
    newPeak >= 1_200_000 &&
    [...newCategories].some((category) => RISKY.has(category)) &&
    !newCategories.has("airline");

  let pattern = "legitimate";
  let detail = "baseline";
  let reason = "";
  if (cardTesting) {
    pattern = "card_testing";
    detail = "probe_then_charge";
    reason = "A burst of tiny amounts, many merchants, declines, and a device that is new to the customer.";
  } else if (mule && !facts.sameHousehold) {
    pattern = "mule_chain";
    detail = "pass_through";
    if (facts.accountAgeDays < 45 || facts.passthrough >= 0.6) {
      reason = "Funds arrive and leave again toward a cash-out, with little of the money staying on the account.";
    } else {
      const path = facts.chainLabels.length ? facts.chainLabels.join(" → ") : "a cash-out";
      reason = `This account sent ${money(facts.outboundSum)} into a chain that cashes out (${path}).`;
    }
  } else if (ato) {
    pattern = "account_takeover";
    detail = "new_device_foreign_spike";
    reason = "A new device in a new country spends far above baseline at gift cards, electronics, or crypto.";
  } else if (collusion) {
    pattern = "merchant_collusion";
    detail = "round_amounts_shared_devices";
    reason = "Young accounts share devices and repeatedly pay the same merchant in round amounts.";
  } else if (facts.foreign && facts.knownMature.length && travelSpend && facts.episodePeak < 3_200_000 && declines === 0) {
    pattern = "legitimate";
    detail = "travel";
    reason = "Foreign IP, but the device is the one this customer has used for weeks, and the merchants are travel.";
  } else if (facts.sameHousehold && !facts.foreign && facts.episodePeak < 1_600_000 && !mule) {
    pattern = "legitimate";
    detail = "household";
    reason = "The shared device belongs to someone with the same surname and city, and nothing is passed through.";
  } else if (
    facts.peakVelocity >= 5 &&
    declines === 0 &&
    episodeMedian >= 80_000 &&
    facts.newDevices.length === 0 &&
    !facts.foreign &&
    facts.episodeMerchants.length <= 3
  ) {
    pattern = "legitimate";
    detail = "flash_sale";
    const shops = facts.episodeMerchants;
    const shopBit = shops.length === 1 ? shops[0] : shops.length === 2 ? `${shops[0]} and ${shops[1]}` : nameList(shops);
    reason = `The hour is busy, but every payment cleared, on a known device, at ${shopBit}.`;
  } else if (facts.newDevices.length && !facts.foreign && facts.episodePeak < 600_000 && facts.peakVelocity <= 2 && !riskySpend) {
    pattern = "legitimate";
    detail = "new_device_at_home";
    const amountBit = merchantCategories.size === 1 && merchantCategories.has("grocery")
      ? "the amount matches a grocery run"
      : "the amount is in line with what this customer usually spends";
    reason = `The only new thing is the device. It is at home, and ${amountBit}.`;
  } else if (
    facts.newDevices.length === 0 &&
    !facts.foreign &&
    facts.peakVelocity <= 2 &&
    lead.type === "card_purchase" &&
    episode.length <= 2 &&
    facts.episodePeak >= 1_600_000 &&
    facts.accountAgeDays > 180 &&
    (merchantCategories.size === 0 || [...merchantCategories].every((category) => ["electronics", "fashion", "airline", "hotel", "furniture"].includes(category)))
  ) {
    pattern = "legitimate";
    detail = "large_purchase";
    reason = "One large purchase on the usual device at home, from a long-standing customer.";
  } else {
    pattern = "legitimate";
    detail = "unexplained";
    reason = "The flag does not add up to card testing, an account takeover, a mule chain, or merchant collusion.";
  }
  facts.pattern = pattern;
  facts.patternDetail = detail;
  facts.patternReasons = [reason];
  step(
    state,
    "classify",
    "Pattern classification",
    pattern === "legitimate" ? "clear" : "alert",
    `${PATTERN_LABELS[pattern]}. ${reason}`,
    [
      { label: "Pattern", value: PATTERN_LABELS[pattern] },
      { label: "Detail", value: detail.replaceAll("_", " ") },
    ],
    390,
  );
}

function recommend(state: State) {
  const facts = state.facts;
  const pattern = facts.pattern;
  const detail = facts.patternDetail;
  const signals: Facts["signals"] = [{ name: "Case opened", points: 4, detail: "Every queued payment starts with a small residual score." }];
  let action: Action = "approve";
  let rationale = "";
  if (pattern === "card_testing") {
    signals.push(
      { name: "Probe burst", points: 48, detail: `${facts.episode.length} payments, median ${money(facts.episodeMedian)}, ${facts.episodeMerchants.length} merchants.` },
      { name: "Declines", points: 14, detail: `${facts.declineCount} declined attempts in the burst.` },
      { name: "Unfamiliar device", points: 18, detail: facts.newDevices.join(", ") },
    );
    if (facts.datacenter) signals.push({ name: "Datacenter IP", points: 10, detail: "The IP is in a hosting range, not a household connection." });
    action = "block";
    rationale = "Block the card. Testing already landed a larger charge, and further attempts will follow the same device.";
  } else if (pattern === "account_takeover") {
    signals.push(
      { name: "New device abroad", points: 36, detail: `Device ${facts.newDevices.join(", ")} in ${nameList(facts.episodeCountries.map(countryName))}.` },
      { name: "Spend spike", points: 28, detail: `Peak ${money(facts.episodePeak)} against a median of ${money(facts.baselineMedian)}.` },
      { name: "Risky merchants", points: 18, detail: "Gift cards, electronics, or crypto, rather than travel." },
    );
    if (facts.vpn) signals.push({ name: "VPN", points: 8, detail: "The session is coming through a VPN." });
    action = "block";
    rationale = "Block and force a step-up with the real customer. The session does not match the device or the country on file.";
  } else if (pattern === "mule_chain") {
    signals.push(
      { name: "Cash-out path", points: 40, detail: facts.chainLabels.length ? facts.chainLabels.join(" → ") : "Reaches a cash-out merchant." },
      { name: "Shared infrastructure", points: facts.linked.length ? 18 : 8, detail: othersOnDevice(facts.linked.length) },
      {
        name: facts.inboundSum ? "Funds do not stay" : "Sent into the chain",
        points: 16,
        detail: facts.inboundSum
          ? `Inbound ${money(facts.inboundSum)}, outbound ${money(facts.outboundSum)}.`
          : `No inbound transfer in this window. ${money(facts.outboundSum)} was sent on.`,
      },
    );
    if (facts.accountAgeDays < 45) signals.push({ name: "Young account", points: 10, detail: `Opened ${plural(facts.accountAgeDays, "day")} ago.` });
    action = facts.lead.type === "cash_out" ? "block" : "escalate";
    rationale = action === "block"
      ? "Block the cash-out before it settles."
      : "Escalate the chain so the receiving accounts can be frozen together.";
  } else if (pattern === "merchant_collusion") {
    const merchant = facts.merchant;
    const stats = facts.merchantStats;
    signals.push(
      { name: "Round amounts", points: 26, detail: `${pct0(stats.roundShare)} of recent payments at ${merchant?.name ?? "the merchant"} are round.` },
      { name: "Young buyers", points: 22, detail: `${pct0(stats.youngShare)} of buyers are under 45 days old.` },
      { name: "Shared buyer devices", points: 22, detail: stats.sharedDevices.join(", ") },
    );
    action = "escalate";
    rationale = "Escalate to merchant risk. Blocking one buyer leaves the rest of the ring, and the merchant, untouched.";
  } else if (detail === "travel") {
    signals.push({ name: "Trip on a known device", points: 12, detail: `Reused ${facts.knownMature.join(", ")} abroad at travel merchants.` });
    rationale = "Approve. This is a trip on the customer's own device, not a takeover. A takeover would bring a new device and gift-card spend.";
  } else if (detail === "household") {
    signals.push({ name: "Household device", points: 10, detail: "Shared with the same surname in the same city, with no pass-through." });
    const hardware = facts.episodeDevices.length ? state.catalog.devices.get(facts.episodeDevices[0])?.hardware ?? "device" : "device";
    const article = "aeiou".includes(hardware[0]?.toLowerCase() ?? "") ? "an" : "a";
    rationale = `Approve. Sharing ${article} ${hardware} with the same surname, in the same city, is a household. Nothing is passed through, so it is not a mule chain.`;
  } else if (detail === "flash_sale") {
    signals.push({ name: "Busy hour, ordinary tickets", points: 8, detail: `Cleared purchases on a known device at ${nameList(facts.episodeMerchants)}.` });
    rationale = "Approve. Velocity without declines, probes, or a new device is a shopping burst, not card testing.";
  } else if (detail === "new_device_at_home") {
    signals.push({ name: "New device at home", points: 14, detail: "New hardware, household IP, amount inside the baseline." });
    rationale = "Approve. A replacement phone at home, spending like the customer always does, is not an account takeover.";
  } else if (detail === "large_purchase") {
    signals.push({ name: "Explained one-off", points: 16, detail: "Single large ticket, usual device, home IP, long tenure." });
    rationale = "Approve. The amount is unusual and the rest of the session is not. Holding it punishes a real purchase.";
  } else {
    signals.push({ name: "Unmatched flag", points: 18, detail: "The queue reason is not backed up by the rest of the file." });
    action = facts.foreign && facts.newDevices.length ? "hold" : "approve";
    rationale = action === "hold"
      ? "Hold for an analyst. A new device and a new country showed up together, but the rest of the pattern is incomplete."
      : "Approve. History, device, network, and merchant checks do not support a fraud pattern.";
  }
  let score = signals.reduce((sum, item) => sum + item.points, 0);
  const floors: Record<string, number> = { card_testing: 84, account_takeover: 82, mule_chain: 76, merchant_collusion: 72 };
  if (pattern in floors) score = Math.max(score, floors[pattern]);
  if (pattern === "legitimate") score = Math.min(score, 36);
  score = Math.max(0, Math.min(100, Math.trunc(score)));
  facts.signals = signals;
  facts.score = score;
  facts.action = action;
  facts.rationale = rationale;
  step(
    state,
    "recommend",
    "Suggested action",
    action === "block" || action === "escalate" ? "alert" : action === "hold" ? "watch" : "clear",
    `Suggested action: ${action}. Risk score ${score}/100. ${rationale} A person still has to confirm this. FraudLens does not apply it.`,
    [
      { label: "Suggested action", value: action },
      { label: "Risk score", value: `${score}/100` },
      { label: "Who decides", value: "human analyst" },
    ],
    360,
  );
}

function assemble(state: State): Investigation {
  const facts = state.facts;
  const catalog = state.catalog;
  const lead = facts.lead;
  const customer = facts.customer;
  const narrative = narrativeOf(state);
  const related = facts.episode.map((txn) => ({
    id: txn.id,
    occurredAt: txn.occurred_at,
    amountPaise: txn.amount_paise,
    status: txn.status,
    merchantName: catalog.merchant(txn.merchant_id)?.name ?? "UPI transfer",
    deviceId: txn.device_id,
  }));
  return {
    caseId: state.caseInput.case_id,
    riskScore: facts.score,
    pattern: facts.pattern,
    patternLabel: PATTERN_LABELS[facts.pattern] ?? facts.pattern,
    patternDetail: facts.patternDetail,
    action: facts.action,
    actionRationale: facts.rationale,
    summary: summaryOf(state),
    narrative,
    confidence: facts.pattern !== "legitimate" || facts.patternDetail !== "unexplained" ? "high" : "medium",
    signals: facts.signals,
    timeline: state.timeline,
    graph: buildGraph(state),
    customer: {
      id: customer.id,
      name: customer.name,
      homeCity: customer.home_city,
      homeCountry: customer.home_country,
      accountId: facts.account.id,
    },
    lead: {
      id: lead.id,
      amountPaise: lead.amount_paise,
      merchantName: facts.merchantName,
      occurredAt: lead.occurred_at,
      deviceId: lead.device_id,
      cardLast4: lead.card_last4,
      type: lead.type,
    },
    related,
  };
}

function summaryOf(state: State): string {
  const facts = state.facts;
  const customer = facts.customer.name;
  const ratio = facts.peakRatio ?? 0;
  if (facts.pattern === "card_testing") return `Card testing on ${customer}: tiny probes, then ${money(facts.episodePeak)} on a new device.`;
  if (facts.pattern === "account_takeover") return `Account takeover on ${customer}: new device, new country, spend at ${times(ratio)} baseline.`;
  if (facts.pattern === "mule_chain") return `Mule flow touching ${customer}: funds move onward to a cash-out the same day.`;
  if (facts.pattern === "merchant_collusion") return `Collusive buying at ${facts.merchant?.name ?? "the merchant"}, including ${customer}.`;
  if (facts.patternDetail === "travel") return `${customer} is travelling on a device already on file. The foreign IP is the trip, not a takeover.`;
  if (facts.patternDetail === "household") return `${customer} shares a device with someone of the same surname in the same city. Nothing passes through.`;
  if (facts.patternDetail === "flash_sale") return `${customer} made several ordinary purchases in one hour, on a known device, with no declines.`;
  if (facts.patternDetail === "new_device_at_home") return `${customer} used a new phone at home, and the amount matches their usual spend.`;
  if (facts.patternDetail === "large_purchase") return `${customer} made one large purchase on their usual device, at home.`;
  return `${customer} was queued, and the rest of the file does not support a fraud pattern.`;
}

function narrativeOf(state: State): string {
  const facts = state.facts;
  const lead = facts.lead;
  const customer = facts.customer;
  const card = lead.card_last4 ? `, card ••${lead.card_last4}` : ", no card on this transfer";
  const bits = [
    facts.patternReasons[0],
    facts.rationale,
    `Lead payment ${lead.id} is ${money(lead.amount_paise)} ${lead.status === "declined" ? "declined" : "approved"} ${where(state.catalog.merchant(lead.merchant_id))} on ${clock(lead.ts)}${card}, device ${lead.device_id} (${state.catalog.deviceLabel(lead.device_id)}).`,
  ];
  if (facts.baselineCount) {
    bits.push(`Before this episode, ${customer.name} had ${plural(facts.baselineCount, "payment")} with a median of ${money(facts.baselineMedian)}.`);
  }
  if (facts.pattern === "card_testing") {
    bits.push(
      `Between ${shortClock(facts.episode[0].ts)} and ${shortClock(facts.episode[facts.episode.length - 1].ts)} there were ${facts.episode.length} attempts, ${facts.declineCount} declined, across ${nameList(facts.episodeMerchants)}.`,
    );
  }
  if (facts.pattern === "legitimate" && facts.patternDetail === "travel") {
    bits.push("The contrast with account takeover is the device: takeover arrives on hardware the customer has never used.");
  }
  return bits.join(" ");
}

function where(merchant: World["merchants"][number] | null | undefined): string {
  return merchant ? `at ${merchant.name}` : "by UPI transfer";
}

function buildGraph(state: State) {
  const facts = state.facts;
  const catalog = state.catalog;
  const nodes: Investigation["graph"]["nodes"] = [];
  const edges: Investigation["graph"]["edges"] = [];
  const add = (id: string, type: string, label: string, sublabel: string, emphasis: boolean) => {
    if (nodes.some((node) => node.id === id)) return;
    nodes.push({ id, type, label, sublabel, x: 0, y: 0, emphasis });
  };
  add(facts.customer.id, "customer", facts.customer.name, facts.customer.id, true);
  add(facts.account.id, "account", "Account", facts.account.id, true);
  edges.push({ source: facts.customer.id, target: facts.account.id, kind: "owns", label: "owns" });
  for (const deviceId of facts.episodeDevices) {
    add(deviceId, "device", catalog.devices.get(deviceId)?.hardware ?? "Device", deviceId, facts.newDevices.includes(deviceId));
    edges.push({ source: facts.account.id, target: deviceId, kind: "uses", label: "uses" });
  }
  if (facts.merchant) {
    add(facts.merchant.id, "merchant", facts.merchant.name, facts.merchant.category.replaceAll("_", " "), true);
    edges.push({ source: facts.account.id, target: facts.merchant.id, kind: "pays", label: "pays" });
  }
  for (const item of facts.linked) {
    add(item.customer_id, "customer", item.name, item.customer_id, false);
    edges.push({ source: item.device_id, target: item.customer_id, kind: "shared", label: "shared device" });
  }
  nodes.forEach((node, index) => {
    node.x = nodes.length === 1 ? 0.5 : index / (nodes.length - 1);
    node.y = index % 2 === 0 ? 0.32 : 0.72;
  });
  let caption = "The episode stays on devices and a country already associated with this customer.";
  if (facts.chainLabels.length) caption = `Money path: ${facts.chainLabels.join(" → ")}`;
  else if (facts.linked.length) caption = `Devices in this episode are shared with ${facts.linked.slice(0, 3).map((item) => item.name).join(", ")}`;
  else if (facts.newDevices.length) caption = `New device ${facts.newDevices[0]} sits next to the account. The customer's older devices are not in this episode.`;
  return { nodes, edges, caption };
}
