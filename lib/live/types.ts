import type { Action } from "@/lib/types";

export type PlantedScenario =
  | "card_testing"
  | "account_takeover"
  | "mule_chain"
  | "merchant_collusion"
  | "genuine";

export type ScenarioChoice = PlantedScenario | "random";

export type Txn = {
  id: string;
  ts: number;
  occurred_at: string;
  customer_id: string;
  account_id: string;
  card_last4: string | null;
  device_id: string;
  ip_id: string;
  merchant_id: string | null;
  amount_paise: number;
  status: string;
  type: string;
  counterparty_account_id: string | null;
};

export type Customer = {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  home_city: string;
  home_country: string;
  created_at: string;
  created_ts: number;
};

export type Account = {
  id: string;
  customer_id: string;
  opened_at: string;
  opened_ts: number;
  status: string;
};

export type Device = {
  id: string;
  hardware: string;
  os: string;
  browser: string;
};

export type Ip = {
  id: string;
  address: string;
  city: string;
  country: string;
  is_datacenter: boolean;
  is_vpn: boolean;
};

export type Merchant = {
  id: string;
  name: string;
  category: string;
  city: string;
  country: string;
};

export type Enrollment = {
  customer_id: string;
  device_id: string;
  enrolled_ts: number;
};

export type World = {
  customers: Customer[];
  accounts: Account[];
  devices: Device[];
  ips: Ip[];
  merchants: Merchant[];
  transactions: Txn[];
  enrollments: Enrollment[];
};

export type CaseInput = {
  case_id: string;
  customer_id: string;
  lead_transaction_id: string;
  flagged_transaction_ids: string[];
  covered_transaction_ids: string[];
  window_start: number;
  window_end: number;
  flag_reasons: string[];
};

export type Evidence = { label: string; value: string };

export type TimelineStep = {
  id: string;
  title: string;
  status: "clear" | "watch" | "alert";
  started_at: string;
  duration_ms: number;
  finding: string;
  evidence: Evidence[];
};

export type Investigation = {
  caseId: string;
  riskScore: number;
  pattern: string;
  patternLabel: string;
  patternDetail: string;
  action: Action;
  actionRationale: string;
  summary: string;
  narrative: string;
  confidence: "high" | "medium";
  signals: { name: string; points: number; detail: string }[];
  timeline: TimelineStep[];
  graph: {
    nodes: {
      id: string;
      type: string;
      label: string;
      sublabel: string;
      x: number;
      y: number;
      emphasis: boolean;
    }[];
    edges: { source: string; target: string; kind: string; label: string }[];
    caption: string;
  };
  customer: {
    id: string;
    name: string;
    homeCity: string;
    homeCountry: string;
    accountId: string;
  };
  lead: {
    id: string;
    amountPaise: number;
    merchantName: string;
    occurredAt: string;
    deviceId: string;
    cardLast4: string | null;
    type: string;
  };
  related: {
    id: string;
    occurredAt: string;
    amountPaise: number;
    status: string;
    merchantName: string;
    deviceId: string;
  }[];
};

export type Truth = {
  scenario: PlantedScenario;
  label: string;
  fraud: boolean;
};
