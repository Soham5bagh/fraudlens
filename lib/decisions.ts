import type { Action, AnalystDecision } from "./types";

const KEY = "fraudlens.decisions.v1";

export function loadDecisions(): Record<string, AnalystDecision> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, AnalystDecision>) : {};
  } catch {
    return {};
  }
}

export function saveDecision(decision: AnalystDecision): Record<string, AnalystDecision> {
  const all = loadDecisions();
  all[decision.caseId] = decision;
  window.localStorage.setItem(KEY, JSON.stringify(all));
  void fetch("/api/decisions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(decision),
  }).catch(() => {
    // The browser copy is the demo record. /tmp is best-effort on the server.
  });
  return all;
}

export function decisionFor(
  decisions: Record<string, AnalystDecision>,
  caseId: string,
): AnalystDecision | undefined {
  return decisions[caseId];
}

export const ACTIONS: Action[] = ["approve", "hold", "escalate", "block"];
