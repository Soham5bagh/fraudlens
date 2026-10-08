import type { Action } from "./types";

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function pct(value: number): string {
  const points = value * 100;
  if (points === 0 || points === 100) return `${points.toFixed(0)}%`;
  if (points < 1) return `${points.toFixed(2)}%`;
  return `${points.toFixed(1)}%`;
}

export function when(iso: string): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hourCycle: "h23",
  }).format(new Date(iso));
  return `${formatted} UTC`;
}

export function actionLabel(action: Action): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

const PATTERN_NAMES: Record<string, string> = {
  card_testing: "Card testing",
  account_takeover: "Account takeover",
  mule_chain: "Mule-account chain",
  merchant_collusion: "Merchant collusion",
  legitimate: "Legitimate",
};

export function patternName(pattern: string): string {
  return PATTERN_NAMES[pattern] ?? pattern.replaceAll("_", " ");
}
