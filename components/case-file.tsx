"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Info } from "@/components/info-tip";
import { NetworkGraph } from "@/components/network-graph";
import { VerdictBanner } from "@/components/verdict-banner";
import { ACTIONS, loadDecisions, saveDecision } from "@/lib/decisions";
import { actionLabel, money, patternName, when } from "@/lib/format";
import { actionPlain, patternPlain, statusPlain } from "@/lib/glossary";
import { useDecisionKeys } from "@/lib/use-decision-keys";
import type { Action, AnalystDecision, CaseFile, JudgeEntry } from "@/lib/types";

export function CaseFileView() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const [file, setFile] = useState<CaseFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<AnalystDecision | undefined>();
  const [action, setAction] = useState<Action>("approve");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [truth, setTruth] = useState<JudgeEntry | null>(null);
  const [truthError, setTruthError] = useState<string | null>(null);

  useEffect(() => {
    setFile(null);
    setError(null);
    setSaved(false);
    setTruth(null);
    const existing = loadDecisions()[id];
    setDecision(existing);
    fetch(`/data/cases/${id}.json`)
      .then((response) => {
        if (!response.ok) throw new Error("missing");
        return response.json();
      })
      .then((body: CaseFile) => {
        setFile(body);
        setAction(existing?.action ?? body.action);
        setNote(existing?.note ?? "");
      })
      .catch(() => setError("That case is not in the seed ledger."));
  }, [id]);

  function record() {
    if (!file) return;
    const next = saveDecision({
      caseId: file.case_id,
      action,
      note,
      decidedAt: new Date().toISOString(),
      suggested: file.action,
      override: action !== file.action,
    });
    setDecision(next[file.case_id]);
    setSaved(true);
  }

  function reveal() {
    fetch("/data/judge.json")
      .then((response) => response.json())
      .then((body: Record<string, JudgeEntry>) => {
        if (!body[id]) {
          setTruthError("No held-out label for this case.");
          return;
        }
        setTruth(body[id]);
      })
      .catch(() => setTruthError("The held-out labels did not load."));
  }

  useDecisionKeys(
    Boolean(file),
    (next) => {
      setAction(next);
      setSaved(false);
    },
    () => record(),
  );

  function download() {
    if (!file?.report_markdown) return;
    const blob = new Blob([file.report_markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${file.case_id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <div className="state">
        {error} <Link href="/">Back to the queue</Link>
      </div>
    );
  }
  if (!file) return <div className="state">Reading the file…</div>;

  const showDemo = search.get("demo") === "1" && file.showcase;

  return (
    <>
      <p className="kicker">
        <Link href="/">Queue</Link> / {file.case_id}
      </p>
      {showDemo && file.showcase ? (
        <div className="banner">
          <b>Demo {file.showcase.order} · {file.showcase.title}.</b> {file.showcase.say}
        </div>
      ) : null}
      <div className="case-grid">
        <div className="stack">
          <VerdictBanner
            score={file.risk_score}
            action={file.action}
            pattern={file.pattern}
            patternLabel={file.pattern_label}
            why={file.summary}
          />
          <section className="panel">
            <div className="row-title">
              <span className={`pill ${file.action}`} title={actionPlain(file.action)}>{actionLabel(file.action)}</span>
              <span className="pill" title={patternPlain(file.pattern)}>{file.pattern_label}</span>
              <span className="pill" title="How sure FraudLens is about the pattern name. The risk score is separate.">{file.confidence} confidence</span>
            </div>
            <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>{file.customer.name}</h1>
            <p className="lede" style={{ marginBottom: 0 }}>
              {money(file.lead.amount_paise)} {file.lead.type.startsWith("p2p") ? "by UPI transfer" : `at ${file.lead.merchant_name}`} · {when(file.lead.occurred_at)}
            </p>
            <p className="meta">
              {file.lead.id} · {file.lead.card_last4 ? `card ••${file.lead.card_last4}` : "no card on this transfer"} · {file.lead.device_id} · {file.customer.home_city}, {file.customer.home_country}
            </p>
          </section>

          <details className="fold" open>
            <summary>Full explanation</summary>
            <p className="narrative">{file.narrative}</p>
          </details>

          <details className="fold" open>
            <summary>Why the score is {file.risk_score}</summary>
            <ul className="signals">
              {file.signals.map((signal) => (
                <li key={signal.name}>
                  <span className="points">+{signal.points}</span>
                  <span>
                    <b>{signal.name}.</b> {signal.detail}
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <details className="fold" open>
            <summary>Evidence, step by step <Info text="Each row is one check, with the numbers from that check." /></summary>
            <ol className="timeline">
              {file.timeline.map((step, index) => (
                <li key={step.id}>
                  <div className="rail">
                    <span className={`dot ${step.status}`} />
                    {index < file.timeline.length - 1 ? <span className="stem" /> : null}
                  </div>
                  <div className="step">
                    <div className="row-title">
                      <h3>{step.title}</h3>
                      <span className={`pill ${step.status}`}>{statusPlain(step.status)}</span>
                    </div>
                    <p className="meta">{when(step.started_at)} · {step.duration_ms} ms</p>
                    <p>{step.finding}</p>
                    <div className="evidence">
                      {step.evidence.map((item) => (
                        <div key={item.label}>
                          <span>{item.label}</span>
                          <b>{item.value}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </details>

          <details className="fold" open>
            <summary>Payments in the window <Info text="The burst around the flagged payment, with ids, amounts, and devices. Not the customer's whole history." /></summary>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Id</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Merchant</th>
                    <th>Device</th>
                  </tr>
                </thead>
                <tbody>
                  {file.related_transactions.slice(0, 24).map((txn) => (
                    <tr key={txn.id}>
                      <td>{when(txn.occurred_at)}</td>
                      <td>{txn.id}</td>
                      <td>{money(txn.amount_paise)}</td>
                      <td>{txn.status}</td>
                      <td>{txn.merchant_name}</td>
                      <td>{txn.device_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <aside className="sticky-side">
          <section className="panel">
            <p className="kicker">Your decision <Info text="FraudLens does not apply this. You do." /></p>
            <h2 style={{ textTransform: "capitalize" }}>{actionLabel(file.action)} <Info text={actionPlain(file.action)} /></h2>
            <p>{file.action_rationale}</p>
            <div className="actions" style={{ marginTop: 12 }}>
              {ACTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  title={`${actionPlain(option)} Shortcut ${option[0].toUpperCase()}.`}
                  className={`${option === action ? "chosen" : ""} pill ${option}`}
                  onClick={() => {
                    setAction(option);
                    setSaved(false);
                  }}
                >
                  {actionLabel(option)}
                </button>
              ))}
            </div>
            <p className="keys"><kbd>A</kbd> <kbd>H</kbd> <kbd>E</kbd> <kbd>B</kbd> choose · <kbd>R</kbd> record</p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Note for the audit log"
              aria-label="Decision note"
              style={{ marginTop: 10 }}
            />
            <button className="primary" type="button" onClick={record}>
              Record decision
            </button>
            {saved || decision ? (
              <p className="note">
                Recorded {decision ? when(decision.decidedAt) : "just now"}: {actionLabel(decision?.action ?? action)}
                {(decision?.override ?? action !== file.action) ? " · override" : " · matches FraudLens"}.
                Kept in this browser. A production desk would write a database.
              </p>
            ) : null}
          </section>

          <details className="fold" open>
            <summary>Linked accounts <Info text="Customers, devices, and shops tied to this payment." /></summary>
            <NetworkGraph graph={file.graph} />
          </details>

          <section className="panel">
            <h2>What was actually planted <Info text="Hidden from FraudLens. Open it after you decide." /></h2>
            {truth ? (
              <p>
                {truth.is_fraud ? `Fraud · ${patternName(truth.pattern)}. ${patternPlain(truth.pattern)}` : "A genuine customer."}
                {" "}FraudLens said {patternName(truth.predicted_pattern)} and {truth.action}.
                {" "}{truth.correct_action ? "The recommendation matches the planted label." : "The recommendation does not match the planted label."}
              </p>
            ) : (
              <div className="button-row">
                <button className="ghost" type="button" onClick={reveal}>Show the planted answer</button>
                <button className="ghost" type="button" onClick={download}>Download case report</button>
              </div>
            )}
            {truthError ? <p className="note">{truthError}</p> : null}
            {truth ? (
              <div className="button-row">
                <button className="ghost" type="button" onClick={download}>Download case report</button>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
