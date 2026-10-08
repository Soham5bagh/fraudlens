"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { patternName, pct } from "@/lib/format";
import type { Metrics } from "@/lib/types";

export function MetricsBoard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/metrics.json")
      .then((response) => response.json())
      .then((body: Metrics) => setMetrics(body))
      .catch(() => setError("Metrics did not load."));
  }, []);

  if (error) return <div className="state">{error}</div>;
  if (!metrics) return <div className="state">Scoring the book…</div>;

  const { headline, naive, agent, population } = metrics;

  return (
    <>
      <p className="kicker">Held-out labels · not shown to the agent</p>
      <h1>Frauds caught, honest customers spared.</h1>
      <p className="lede">{metrics.narrative}</p>
      <div className="stats">
        <article className="stat">
          <span className="kicker">Frauds caught</span>
          <b>{pct(headline.frauds_caught_recall)}</b>
          <span className="muted">{agent.tp} of {agent.tp + agent.fn} fraud payments</span>
        </article>
        <article className="stat">
          <span className="kicker">Precision</span>
          <b>{pct(headline.precision)}</b>
          <span className="muted">Queue alone was {pct(naive.precision)}</span>
        </article>
        <article className="stat">
          <span className="kicker">False alarms</span>
          <b>{headline.false_alarms}</b>
          <span className="muted">Queue raised {naive.fp}. False positive rate {pct(headline.false_positive_rate)}.</span>
        </article>
        <article className="stat">
          <span className="kicker">Genuine customers blocked</span>
          <b>{headline.genuine_customers_blocked_by_agent}</b>
          <span className="muted">Rubber-stamping the queue would block {headline.genuine_customers_blocked_by_queue}.</span>
        </article>
      </div>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h2>Queue versus Halden</h2>
        <div className="bars">
          <Bar label="Recall" naive={naive.recall} agent={agent.recall} />
          <Bar label="Precision" naive={naive.precision} agent={agent.precision} />
          <Bar
            label="Genuine blocked"
            naive={headline.genuine_customers_blocked_by_queue / Math.max(headline.genuine_customers_blocked_by_queue, 1)}
            agent={headline.genuine_customers_blocked_by_agent / Math.max(headline.genuine_customers_blocked_by_queue, 1)}
            naiveText={String(headline.genuine_customers_blocked_by_queue)}
            agentText={String(headline.genuine_customers_blocked_by_agent)}
          />
        </div>
      </section>

      <div className="compare">
        <Matrix title="If an analyst blocks every flag" row={naive} />
        <Matrix title="If an analyst follows Halden" row={agent} />
      </div>

      <section className="panel" style={{ margin: "14px 0" }}>
        <h2>By pattern</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Fraud payments</th>
                <th>Caught</th>
                <th>Recall</th>
                <th>Cases named correctly</th>
              </tr>
            </thead>
            <tbody>
              {metrics.by_pattern.map((row) => (
                <tr key={row.pattern}>
                  <td>{patternName(row.pattern)}</td>
                  <td>{row.fraud_transactions}</td>
                  <td>{row.caught_by_agent}</td>
                  <td>{pct(row.agent_recall)}</td>
                  <td>{row.cases_named_correctly} / {row.cases_with_pattern}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          {population.transactions.toLocaleString()} payments, {population.customers} customers, {population.cases} cases.
          Legitimate cases approved: {metrics.queue.legitimate_cases_approved} / {metrics.queue.legitimate_cases}.
          Fraud cases named correctly: {metrics.queue.fraud_cases_named_correctly} / {metrics.queue.fraud_cases}.
        </p>
      </section>

      <section className="panel">
        <h2>Genuine customers the queue would have stopped</h2>
        <p>Halden approved every one of them.</p>
        <ul>
          {metrics.customers_wrongly_blocked.cleared_by_agent.map((customer) => (
            <li key={customer.customer_id}>
              {customer.name} <span className="muted">({customer.customer_id}, {customer.payments} queued payments)</span>
            </li>
          ))}
        </ul>
        <p>
          <a href="/api/report">Download the detection report (Markdown)</a>
          {" · "}
          <Link href="/demo">Walk the five demo cases</Link>
        </p>
      </section>
    </>
  );
}

function Bar({
  label,
  naive,
  agent,
  naiveText,
  agentText,
}: {
  label: string;
  naive: number;
  agent: number;
  naiveText?: string;
  agentText?: string;
}) {
  return (
    <div>
      <div className="bar-row">
        <span>{label} · queue</span>
        <div className="track" aria-hidden>
          <i className="naive" style={{ width: `${Math.max(2, naive * 100)}%` }} />
        </div>
      </div>
      <div className="meta">{naiveText ?? pct(naive)}</div>
      <div className="bar-row">
        <span>{label} · Halden</span>
        <div className="track" aria-hidden>
          <i className="agent" style={{ width: `${Math.max(agent > 0 ? 2 : 0, agent * 100)}%` }} />
        </div>
      </div>
      <div className="meta">{agentText ?? pct(agent)}</div>
    </div>
  );
}

function Matrix({ title, row }: { title: string; row: Metrics["agent"] }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <table className="matrix">
        <thead>
          <tr>
            <th></th>
            <th>Predicted legitimate</th>
            <th>Predicted fraud</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Actually legitimate</td>
            <td>{row.tn}</td>
            <td>{row.fp}</td>
          </tr>
          <tr>
            <td>Actually fraud</td>
            <td>{row.fn}</td>
            <td>{row.tp}</td>
          </tr>
        </tbody>
      </table>
      <p className="note">False positive rate {pct(row.fpr)} · F1 {pct(row.f1)}</p>
    </section>
  );
}
