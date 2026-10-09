"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Info } from "@/components/info-tip";
import { countLabel, money, patternName, pct } from "@/lib/format";
import { patternPlain, TERM_HELP } from "@/lib/glossary";
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
      <p className="kicker">Synthetic book · the answers were hidden from FraudLens</p>
      <h1>Did it catch the fraud without stopping real customers?</h1>
      <p className="lede">
        On {population.transactions.toLocaleString()} synthetic payments, FraudLens caught {agent.tp} of {population.fraud_transactions} frauds and raised {agent.fp} false alarms.
        A basic rule queue caught the same {naive.tp} frauds and raised {naive.fp} false alarms. Following that queue would have blocked {headline.genuine_customers_blocked_by_queue} genuine customers. Following FraudLens would have blocked {headline.genuine_customers_blocked_by_agent}.
      </p>
      <div className="compare-plain">
        <article className="panel">
          <h2>Basic rule queue <Info text={`${TERM_HELP.queue} If someone blocked every flag, this is the result.`} /></h2>
          <div className="figure">
            <div><b>{naive.tp}</b><span>frauds caught, of {population.fraud_transactions}</span></div>
            <div><b>{headline.genuine_customers_blocked_by_queue}</b><span>genuine customers wrongly blocked</span></div>
            <div><b>{naive.fp}</b><span>false alarms <Info text={TERM_HELP.falseAlarms} /></span></div>
          </div>
        </article>
        <article className="panel fraudlens">
          <h2>FraudLens <Info text="The same flagged payments, read one by one. A person still has to agree." /></h2>
          <div className="figure">
            <div><b>{agent.tp}</b><span>frauds caught, of {population.fraud_transactions}</span></div>
            <div><b>{headline.genuine_customers_blocked_by_agent}</b><span>genuine customers wrongly blocked</span></div>
            <div><b>{agent.fp}</b><span>false alarms <Info text={TERM_HELP.falseAlarms} /></span></div>
          </div>
        </article>
      </div>
      <details className="fold" open>
        <summary>Scorecard note</summary>
        <p>{metrics.narrative}</p>
      </details>
      <div className="stats">
        <article className="stat">
          <span className="kicker">Frauds caught <Info text={TERM_HELP.recall} /></span>
          <b>{pct(headline.frauds_caught_recall)}</b>
          <span className="muted">{agent.tp} of {agent.tp + agent.fn} fraud payments</span>
        </article>
        <article className="stat">
          <span className="kicker">Precision <Info text={TERM_HELP.precision} /></span>
          <b>{pct(headline.precision)}</b>
          <span className="muted">Rule queue {pct(naive.precision)}</span>
        </article>
        <article className="stat">
          <span className="kicker">False alarms <Info text={TERM_HELP.falseAlarms} /></span>
          <b>{headline.false_alarms}</b>
          <span className="muted">Rule queue {naive.fp} · rate {pct(headline.false_positive_rate)}</span>
        </article>
        <article className="stat">
          <span className="kicker">Genuine customers blocked</span>
          <b>{headline.genuine_customers_blocked_by_agent}</b>
          <span className="muted">Rule queue would block {headline.genuine_customers_blocked_by_queue}</span>
        </article>
      </div>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h2>Rates <Info text="Grey is the basic rule queue. Blue is FraudLens. Frauds caught is recall. Precision is how often a fraud call was right." /></h2>
        <div className="bars">
          <Bar label="Frauds caught" naive={naive.recall} agent={agent.recall} />
          <Bar label="Right when it says fraud" naive={naive.precision} agent={agent.precision} />
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
        <Matrix title="If an analyst follows FraudLens" row={agent} />
      </div>

      <section className="panel" style={{ margin: "14px 0" }}>
        <h2>By pattern <Info text="Caught is fraudulent payments stopped. Named correctly means the case file used the right pattern." /></h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Pattern</th>
                <th>Fraud payments</th>
                <th>Caught</th>
                <th title={TERM_HELP.recall}>Share caught</th>
                <th>Cases named correctly</th>
              </tr>
            </thead>
            <tbody>
              {metrics.by_pattern.map((row) => (
                <tr key={row.pattern}>
                  <td>{patternName(row.pattern)} <Info text={patternPlain(row.pattern)} /></td>
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

      {metrics.robustness ? (
        <section className="panel" style={{ marginBottom: 14 }}>
          <h2>Other seeds <Info text="A seed rebuilds the book. These were not used to tune the demo. Frauds caught is recall. Precision is how often a fraud call was right." /></h2>
          <p>{metrics.robustness.note}</p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Seed</th>
                  <th title={TERM_HELP.recall}>Frauds caught</th>
                  <th title={TERM_HELP.precision}>Right when it says fraud</th>
                  <th title={TERM_HELP.falseAlarms}>False alarms</th>
                  <th>Genuine customers blocked</th>
                  <th>Fraud cases named</th>
                  <th>Legitimate cases approved</th>
                </tr>
              </thead>
              <tbody>
                {metrics.robustness.seeds.map((row) => (
                  <tr key={row.seed}>
                    <td>{row.seed}</td>
                    <td>{pct(row.agent_recall)}</td>
                    <td>{pct(row.agent_precision)}</td>
                    <td>{row.agent_false_alarms}</td>
                    <td>{row.genuine_blocked_by_agent} <span className="muted">(queue {row.genuine_blocked_by_queue})</span></td>
                    <td>{row.fraud_cases_named_correctly} / {row.fraud_cases}</td>
                    <td>{row.legitimate_cases_approved} / {row.legitimate_cases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {metrics.robustness.seeds.flatMap((row) =>
            (row.false_alarm_examples ?? []).map((example) => (
              <p className="note" key={`${row.seed}-${example.transaction_id}`}>
                Seed {row.seed} counts {example.transaction_id} ({money(example.amount_cents)} at {example.merchant_name}, {example.customer_name}) with {example.case_id} ({patternName(example.predicted_pattern)}).
                The payment is legitimate and sits inside that case&apos;s time window, so it is scored with the case.
              </p>
            )),
          )}
          <p className="note">{metrics.robustness.limitations}</p>
        </section>
      ) : null}

      <section className="panel">
        <h2>Genuine customers the rule queue would have stopped</h2>
        <p>FraudLens approved every one of them. These are real-looking trips, big purchases, and ordinary spending that only looked odd to the rules.</p>
        <ul>
          {metrics.customers_wrongly_blocked.cleared_by_agent.map((customer) => (
            <li key={customer.customer_id}>
              {customer.name} <span className="muted">({customer.customer_id}, {countLabel(customer.payments, "queued payment")})</span>
            </li>
          ))}
        </ul>
        <p>
          <a href="/api/report">Download the detection report (Markdown)</a>
          {" · "}
          <Link href="/demo">Walk the guided demo</Link>
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
        <span>{label} · FraudLens</span>
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
            <th>Called genuine</th>
            <th>Called fraud</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Actually genuine</td>
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
      <p className="note">False alarms as a share of genuine payments: {pct(row.fpr)}. F1, a blend of frauds caught and precision: {pct(row.f1)}.</p>
    </section>
  );
}
