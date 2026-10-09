export type Action = "approve" | "hold" | "escalate" | "block";

export type QueueItem = {
  case_id: string;
  lead_transaction_id: string;
  customer_id: string;
  customer_name: string;
  home: string;
  merchant_name: string;
  amount_paise: number;
  occurred_at: string;
  status: string;
  flag_reasons: string[];
  risk_score: number;
  pattern: string;
  pattern_label: string;
  pattern_detail: string;
  action: Action;
  summary: string;
  confidence: string;
  showcase_slot: string | null;
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

export type GraphNode = {
  id: string;
  type: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  emphasis: boolean;
};

export type CaseFile = {
  case_id: string;
  summary: string;
  narrative: string;
  risk_score: number;
  pattern: string;
  pattern_label: string;
  pattern_detail: string;
  action: Action;
  action_rationale: string;
  confidence: string;
  flag_reasons: { code: string; text: string }[];
  signals: { name: string; points: number; detail: string }[];
  timeline: TimelineStep[];
  graph: {
    nodes: GraphNode[];
    edges: { source: string; target: string; kind: string; label: string }[];
    caption: string;
  };
  related_transactions: {
    id: string;
    occurred_at: string;
    amount_paise: number;
    status: string;
    type: string;
    merchant_name: string;
    device_id: string;
    ip_country: string;
    flagged: boolean;
  }[];
  customer: {
    id: string;
    name: string;
    email: string;
    home_city: string;
    home_country: string;
    segment: string;
    customer_since: string;
    account_id: string;
    account_age_days: number;
  };
  lead: {
    id: string;
    occurred_at: string;
    amount_paise: number;
    status: string;
    type: string;
    merchant_name: string;
    merchant_category: string;
    device_id: string;
    device_label: string;
    ip: string;
    card_last4: string | null;
  };
  report_markdown?: string;
  showcase: null | { slot: string; order: number; title: string; say: string };
};

export type DemoStep = {
  slot: string;
  title: string;
  say: string;
  case_id: string;
  customer_name: string;
  summary: string;
  action: Action;
  risk_score: number;
  amount: string;
};

export type ScoreRow = {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  fpr: number;
  f1: number;
  predicted_positive: number;
};

export type FalseAlarmExample = {
  transaction_id: string;
  amount_paise: number;
  merchant_name: string;
  case_id: string;
  predicted_pattern: string;
  customer_name: string;
};

export type Metrics = {
  population: {
    transactions: number;
    fraud_transactions: number;
    legitimate_transactions: number;
    customers: number;
    cases: number;
  };
  naive: ScoreRow;
  agent: ScoreRow;
  customers_wrongly_blocked: {
    naive: number;
    agent_block: number;
    agent_any_intervention: number;
    cleared_by_agent: { customer_id: string; name: string; payments: number }[];
  };
  by_pattern: {
    pattern: string;
    fraud_transactions: number;
    caught_by_agent: number;
    agent_recall: number;
    cases_with_pattern: number;
    cases_named_correctly: number;
  }[];
  queue: {
    cases: number;
    fraud_cases: number;
    fraud_cases_caught: number;
    fraud_cases_named_correctly: number;
    legitimate_cases: number;
    legitimate_cases_approved: number;
  };
  narrative: string;
  false_alarm_examples?: FalseAlarmExample[];
  robustness?: {
    note: string;
    limitations: string;
    seeds: {
      seed: number;
      agent_recall: number;
      agent_precision: number;
      agent_false_alarms: number;
      genuine_blocked_by_queue: number;
      genuine_blocked_by_agent: number;
      fraud_cases_named_correctly: number;
      fraud_cases: number;
      legitimate_cases_approved: number;
      legitimate_cases: number;
      false_alarm_examples?: FalseAlarmExample[];
    }[];
  };
  headline: {
    frauds_caught_recall: number;
    precision: number;
    false_alarms: number;
    false_positive_rate: number;
    genuine_customers_blocked_by_queue: number;
    genuine_customers_blocked_by_agent: number;
    genuine_customers_cleared: number;
  };
};

export type AnalystDecision = {
  caseId: string;
  action: Action;
  note: string;
  decidedAt: string;
  suggested: Action;
  override: boolean;
};

export type JudgeEntry = {
  is_fraud: boolean;
  pattern: string;
  predicted_pattern: string;
  action: Action;
  correct_pattern: boolean;
  correct_action: boolean;
};
