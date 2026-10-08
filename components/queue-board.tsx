"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadDecisions } from "@/lib/decisions";
import { actionLabel, money, when } from "@/lib/format";
import type { AnalystDecision, DemoStep, QueueItem } from "@/lib/types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "block", label: "Block" },
  { id: "escalate", label: "Escalate" },
  { id: "approve", label: "Approve" },
  { id: "card_testing", label: "Card testing" },
  { id: "account_takeover", label: "Takeover" },
  { id: "mule_chain", label: "Mule chain" },
  { id: "merchant_collusion", label: "Collusion" },
  { id: "legitimate", label: "Cleared" },
];

export function QueueBoard() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [demo, setDemo] = useState<DemoStep[]>([]);
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
      .catch(() => setError("The seed ledger did not load. Regenerate it with python -m engine.build."));
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

  if (error) return <div className="state">{error}</div>;
  if (!items) return <div className="state">Opening the queue…</div>;

  return (
    <>
      <p className="kicker">Morning review · seed 42</p>
      <h1>Thirty cases. One desk.</h1>
      <p className="lede">
        A blunt flagger caught every fraudulent payment and also stopped eight genuine customers.
        Halden re-investigated the queue, kept the fraud, and cleared the honest ones.
        Nothing here is blocked until you say so.
      </p>
      <p>
        <Link href="/investigate" className="primary" style={{ display: "inline-block", width: "auto", padding: "10px 14px" }}>
          Investigate a new payment
        </Link>
      </p>
      <div className="demo-strip">
        {demo.map((step, index) => (
          <Link key={step.case_id} href={`/cases/${step.case_id}?demo=1`}>
            <small>Demo {index + 1}</small>
            <strong>{step.title}</strong>
            <span className={`pill ${step.action}`}>{actionLabel(step.action)} · {step.risk_score}</span>
          </Link>
        ))}
      </div>
      <div className="filters">
        {FILTERS.map((item) => (
          <button key={item.id} className={filter === item.id ? "on" : undefined} onClick={() => setFilter(item.id)} type="button">
            {item.label}
          </button>
        ))}
      </div>
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
                <div className="score" style={{ color: item.risk_score >= 70 ? "var(--block)" : item.risk_score >= 40 ? "var(--escalate)" : "var(--approve)" }}>
                  {item.risk_score}
                  <small>risk</small>
                </div>
                <div>
                  <div className="row-title">
                    <b>{item.customer_name}</b>
                    <span className={`pill ${item.action}`}>{actionLabel(item.action)}</span>
                    <span className="pill">{item.pattern_label}</span>
                    {decision ? <span className="pill">Decided: {actionLabel(decision.action)}</span> : null}
                  </div>
                  <p className="summary">{item.summary}</p>
                  <div className="meta">
                    {item.case_id} · {money(item.amount_cents)} · {item.merchant_name} · {when(item.occurred_at)}
                  </div>
                </div>
                <div className="muted">{item.home}</div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
