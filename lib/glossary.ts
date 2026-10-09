import type { Action } from "./types";

export const PATTERN_HELP: Record<string, { name: string; plain: string }> = {
  card_testing: {
    name: "Card testing",
    plain: "Tiny trial charges to see if a stolen card still works, then a real purchase.",
  },
  account_takeover: {
    name: "Account takeover",
    plain: "A stranger is inside a real customer's account, usually from a new phone or a new country.",
  },
  mule_chain: {
    name: "Mule chain",
    plain: "Money lands in a young account and is passed on, often cashed out the same day.",
  },
  merchant_collusion: {
    name: "Merchant collusion",
    plain: "A shop and several new buyers share devices and ring up round amounts together.",
  },
  legitimate: {
    name: "Genuine customer",
    plain: "It looked suspicious, but it fits a real customer: a trip, a big purchase, or a phone already on the account.",
  },
  genuine: {
    name: "Genuine customer",
    plain: "A real customer, for example someone travelling on a phone already enrolled to them.",
  },
  random: {
    name: "Random",
    plain: "FraudLens picks one of the five shapes. The page does not say which until you decide.",
  },
};

export const ACTION_HELP: Record<Action, { label: string; plain: string }> = {
  approve: {
    label: "Approve",
    plain: "Let the payment through. This looks like a real customer.",
  },
  hold: {
    label: "Hold",
    plain: "Pause it. The file is not clear enough to approve or to block.",
  },
  escalate: {
    label: "Escalate",
    plain: "Send it to a specialist. Stopping one account would miss the rest of the scheme.",
  },
  block: {
    label: "Block",
    plain: "Stop the payment. This looks like fraud happening now.",
  },
};

export const TERM_HELP = {
  riskScore: "0 is ordinary spending. 100 is the strongest case FraudLens can make. A person still decides.",
  recall: "Frauds caught: of the fraudulent payments in the book, how many this approach stopped.",
  precision: "Of the payments this approach called fraud, how many really were.",
  falseAlarms: "Legitimate payments that were treated as fraud.",
  falsePositiveRate: "Legitimate payments called fraud, as a share of all legitimate payments.",
  queue: "A basic set of rules: too many payments, an unusual amount, a new device, a foreign location, a shared device, a young account.",
};

export function patternPlain(pattern: string): string {
  return PATTERN_HELP[pattern]?.plain ?? "";
}

export function patternTitle(pattern: string): string {
  return PATTERN_HELP[pattern]?.name ?? pattern.replaceAll("_", " ");
}

export function actionPlain(action: Action): string {
  return ACTION_HELP[action].plain;
}

export type RiskTone = "high" | "mid" | "low";

export function riskBand(score: number): { label: string; short: string; tone: RiskTone } {
  if (score >= 70) return { label: "High risk", short: "High", tone: "high" };
  if (score >= 40) return { label: "Needs a closer look", short: "Review", tone: "mid" };
  return { label: "Low risk", short: "Low", tone: "low" };
}

const STATUS_HELP: Record<string, string> = {
  clear: "Nothing odd in this check",
  watch: "Worth a look",
  alert: "This check found a problem",
};

export function statusPlain(status: string): string {
  return STATUS_HELP[status] ?? status;
}
