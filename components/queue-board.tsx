"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HowItWorks } from "@/components/how-it-works";
import { loadDecisions } from "@/lib/decisions";
import { actionLabel, money, when } from "@/lib/format";
import { ACTION_HELP, patternPlain, riskBand, TERM_HELP } from "@/lib/glossary";
import type { AnalystDecision, DemoStep, Metrics, QueueItem } from "@/lib/types";

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
  const [query, setQuery] = useState("");
  const [decisions, setDecisions] = useState<Record<string, AnalystDecision>>({});

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
    return items.filter((item) => {
      const filterOk =
        filter === "all" ||
        item.action === filter ||
        item.pattern === filter;
      const queryOk =
        !needle ||
        item.customer_name.toLowerCase().includes(needle) ||
        item.case_id.includes(needle) ||
        item.merchant_name.toLowerCase().includes(needle);
      return filterOk && queryOk;
    });
  }, [items, filter, query]);

  const activeFilter = FILTERS.find((item) => item.id === filter);

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
      <h2 className="section-title">Or stay and review the queue</h2>
      <p className="hint">
        {items.length} payments a basic rule queue already flagged. Open one to read the evidence. Nothing is blocked until you record a decision. {TERM_HELP.queue}
      </p>
      <p className="hint" style={{ marginBottom: 8 }}>{demo.length} files to open first, if you want the short version.</p>
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
      {activeFilter ? <p className="hint">{activeFilter.tip}</p> : null}
      <input
        className="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search customer, merchant, or case id"
        aria-label="Search the queue"
      />
      {visible.length === 0 ? (
        <div className="state">No cases match this filter.</div>
      ) : (
        <div className="queue">
          {visible.map((item) => {
            const decision = decisions[item.case_id];
            return (
              <Link key={item.case_id} href={`/cases/${item.case_id}`} className="case-row">
                <div className="score" style={{ color: scoreColor(item.risk_score) }} title={`${riskBand(item.risk_score).label}. ${TERM_HELP.riskScore}`}>
                  {item.risk_score}
                  <small>{riskBand(item.risk_score).short}</small>
                </div>
                <div>
                  <div className="row-title">
                    <b>{item.customer_name}</b>
                    <span className={`pill ${item.action}`} title={ACTION_HELP[item.action].plain}>{actionLabel(item.action)}</span>
                    <span className="pill" title={patternPlain(item.pattern)}>{item.pattern_label}</span>
                    {decision ? <span className="pill">You decided: {actionLabel(decision.action)}</span> : null}
                  </div>
                  <p className="summary">{item.summary}</p>
                  <div className="meta">
                    {item.case_id} · {money(item.amount_cents)} · {item.merchant_name} · {when(item.occurred_at)}
                  </div>
                </div>
                <div className="muted home">{item.home}</div>
              </Link>
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

function scoreColor(score: number): string {
  const tone = riskBand(score).tone;
  if (tone === "high") return "var(--block)";
  if (tone === "mid") return "var(--escalate)";
  return "var(--approve)";
}
