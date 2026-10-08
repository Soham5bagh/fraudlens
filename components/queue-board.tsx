"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { HowItWorks } from "@/components/how-it-works";
import { Info } from "@/components/info-tip";
import { ACTIONS, loadDecisions, saveDecision } from "@/lib/decisions";
import { actionLabel, money, when } from "@/lib/format";
import { ACTION_HELP, patternPlain, riskBand, TERM_HELP } from "@/lib/glossary";
import type { Action, AnalystDecision, DemoStep, Metrics, QueueItem } from "@/lib/types";

const SORTS = [
  { id: "risk", label: "Risk, high first" },
  { id: "amount", label: "Amount" },
  { id: "time", label: "Newest" },
  { id: "customer", label: "Customer" },
  { id: "pattern", label: "Pattern" },
  { id: "queue", label: "Queue order" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

const KEY_ACTIONS: Record<string, Action> = {
  a: "approve",
  h: "hold",
  e: "escalate",
  b: "block",
};

const FILTERS: { id: string; label: string; tip: string }[] = [
  { id: "all", label: "All", tip: "Every payment the basic rule queue flagged." },
  { id: "block", label: "Block", tip: ACTION_HELP.block.plain },
  { id: "escalate", label: "Escalate", tip: ACTION_HELP.escalate.plain },
  { id: "approve", label: "Approve", tip: ACTION_HELP.approve.plain },
  { id: "card_testing", label: "Card testing", tip: patternPlain("card_testing") },
  { id: "account_takeover", label: "Account takeover", tip: patternPlain("account_takeover") },
  { id: "mule_chain", label: "Mule chain", tip: patternPlain("mule_chain") },
  { id: "merchant_collusion", label: "Merchant collusion", tip: patternPlain("merchant_collusion") },
  { id: "legitimate", label: "Genuine", tip: patternPlain("legitimate") },
];

export function QueueBoard() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [demo, setDemo] = useState<DemoStep[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsNote, setMetricsNote] = useState("Loading the scorecard…");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<SortId>("risk");
  const [query, setQuery] = useState("");
  const [decisions, setDecisions] = useState<Record<string, AnalystDecision>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDecisions(loadDecisions());
    Promise.all([
      fetch("/data/queue.json").then((response) => response.json()),
      fetch("/data/demo.json").then((response) => response.json()),
    ])
      .then(([queue, demoFile]: [{ cases: QueueItem[] }, { steps: DemoStep[] }]) => {
        setItems(queue.cases);
        setDemo(demoFile.steps);
      })
      .catch(() => setError("The case list did not load. Regenerate it with python -m engine.build."));
    fetch("/data/metrics.json")
      .then((response) => {
        if (!response.ok) throw new Error("missing");
        return response.json();
      })
      .then((body: Metrics) => setMetrics(body))
      .catch(() => setMetricsNote("The scorecard did not load."));
  }, []);

  const visible = useMemo(() => {
    if (!items) return [];
    const needle = query.trim().toLowerCase();
    const matched = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const filterOk = filter === "all" || item.action === filter || item.pattern === filter;
        const queryOk =
          !needle ||
          item.customer_name.toLowerCase().includes(needle) ||
          item.case_id.includes(needle) ||
          item.merchant_name.toLowerCase().includes(needle);
        return filterOk && queryOk;
      });
    matched.sort((a, b) => compareQueue(a, b, sort));
    return matched.map((row) => row.item);
  }, [items, filter, query, sort]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key === "/" && searchRef.current) {
        event.preventDefault();
        searchRef.current.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function decide(item: QueueItem, action: Action) {
    const next = saveDecision({
      caseId: item.case_id,
      action,
      note: decisions[item.case_id]?.note ?? "",
      decidedAt: new Date().toISOString(),
      suggested: item.action,
      override: action !== item.action,
    });
    setDecisions(next);
  }

  function onQueueKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    const rows = [...(queueRef.current?.querySelectorAll<HTMLElement>(".case-row") ?? [])];
    const current = rows.findIndex((row) => row === document.activeElement || row.contains(document.activeElement));
    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      rows[Math.min(rows.length - 1, Math.max(0, current + 1))]?.focus();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      rows[Math.max(0, current <= 0 ? 0 : current - 1)]?.focus();
      return;
    }
    if (event.key === "Enter" && target.classList.contains("case-row")) {
      event.preventDefault();
      target.querySelector<HTMLAnchorElement>("a.row-main")?.click();
      return;
    }
    const action = KEY_ACTIONS[event.key.toLowerCase()];
    if (!action || current < 0 || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    decide(visible[current], action);
  }

  return (
    <>
      <p className="kicker">Synthetic payments · a person still makes the call</p>
      <h1>Halden investigates a suspicious payment, then waits for you.</h1>
      <p className="lede">
        Halden is a fraud analyst. When a payment looks odd, it gathers the evidence, names what kind of fraud it might be, and recommends what to do. It never blocks anyone by itself.
      </p>
      <div className="cta-row">
        <Link href="/demo" className="primary cta">Watch the guided demo</Link>
        <Link href="/investigate" className="primary cta secondary">Investigate a new payment live</Link>
        <Link href="/metrics" className="primary cta secondary">See the results</Link>
      </div>
      <p className="result-line" aria-live="polite">
        {metrics ? <ScoreLine metrics={metrics} /> : metricsNote}
      </p>
      <HowItWorks />

      {error ? <div className="state">{error}</div> : null}
      {!items && !error ? <div className="state">Opening the queue…</div> : null}
      {items ? (
        <>
      <h2 className="section-title">
        Queue <Info text={`${items.length} payments a basic rule queue already flagged. Nothing is blocked until you record a decision. ${TERM_HELP.queue}`} />
      </h2>
      <div className="demo-strip">
        {demo.map((step, index) => (
          <Link key={step.case_id} href={`/cases/${step.case_id}?demo=1`}>
            <small>File {index + 1}</small>
            <strong>{step.title}</strong>
            <span className={`pill ${step.action}`} title={ACTION_HELP[step.action].plain}>{actionLabel(step.action)} · score {step.risk_score}</span>
          </Link>
        ))}
      </div>
      <div className="filters" role="group" aria-label="Filter the queue">
        {FILTERS.map((item) => (
          <button key={item.id} className={filter === item.id ? "on" : undefined} onClick={() => setFilter(item.id)} type="button" title={item.tip}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="queue-tools">
        <input
          ref={searchRef}
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customer, merchant, or case id"
          aria-label="Search the queue"
        />
        <label className="sort">
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value as SortId)} aria-label="Sort the queue">
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="keys"><kbd>/</kbd> search · <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>A</kbd> <kbd>H</kbd> <kbd>E</kbd> <kbd>B</kbd> decide the focused row</p>
      {visible.length === 0 ? (
        <div className="state">No cases match this filter.</div>
      ) : (
        <div className="queue" ref={queueRef} onKeyDown={onQueueKey}>
          {visible.map((item) => {
            const decision = decisions[item.case_id];
            const band = riskBand(item.risk_score);
            return (
              <article key={item.case_id} className="case-row" tabIndex={0}>
                <Link href={`/cases/${item.case_id}`} className="row-main">
                  <div className="score" style={{ color: scoreColor(item.risk_score) }} title={`${band.label}. ${TERM_HELP.riskScore}`}>
                    {item.risk_score}
                    <small>{band.short}</small>
                  </div>
                  <div>
                    <div className="row-title">
                      <b>{item.customer_name}</b>
                      <span className={`pill ${item.action}`} title={ACTION_HELP[item.action].plain}>{actionLabel(item.action)}</span>
                      <span className="pill" title={patternPlain(item.pattern)}>{item.pattern_label}</span>
                      {decision ? <span className="pill">Decided {actionLabel(decision.action)}</span> : null}
                    </div>
                    <p className="summary">{item.summary}</p>
                    <div className="meta">
                      {item.case_id} · {money(item.amount_cents)} · {item.merchant_name} · {item.home} · {when(item.occurred_at)}
                    </div>
                  </div>
                </Link>
                <div className="row-actions" role="group" aria-label={`Decide ${item.customer_name}`}>
                  {ACTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      title={`${actionLabel(option)}. ${ACTION_HELP[option].plain}`}
                      className={`${option} ${item.action === option ? "suggested" : ""} ${decision?.action === option ? "chosen" : ""}`}
                      onClick={() => decide(item, option)}
                    >
                      {actionLabel(option)}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
        </>
      ) : null}
    </>
  );
}

function ScoreLine({ metrics }: { metrics: Metrics }) {
  const frauds = metrics.population.fraud_transactions;
  return (
    <>
      On this synthetic book, Halden caught {metrics.agent.tp} of {frauds} frauds and raised {metrics.agent.fp} false alarms.
      A basic rule queue caught the same {metrics.naive.tp} frauds and raised {metrics.naive.fp} false alarms, which would have blocked {metrics.headline.genuine_customers_blocked_by_queue} genuine customers.
      Halden would have blocked {metrics.headline.genuine_customers_blocked_by_agent}.
    </>
  );
}

function compareQueue(a: { item: QueueItem; index: number }, b: { item: QueueItem; index: number }, sort: SortId): number {
  const left = a.item;
  const right = b.item;
  if (sort === "risk") return right.risk_score - left.risk_score || a.index - b.index;
  if (sort === "amount") return right.amount_cents - left.amount_cents || a.index - b.index;
  if (sort === "time") return right.occurred_at.localeCompare(left.occurred_at) || a.index - b.index;
  if (sort === "customer") return left.customer_name.localeCompare(right.customer_name) || a.index - b.index;
  if (sort === "pattern") return left.pattern_label.localeCompare(right.pattern_label) || right.risk_score - left.risk_score;
  return a.index - b.index;
}

function scoreColor(score: number): string {
  const tone = riskBand(score).tone;
  if (tone === "high") return "var(--block)";
  if (tone === "mid") return "var(--escalate)";
  return "var(--approve)";
}
