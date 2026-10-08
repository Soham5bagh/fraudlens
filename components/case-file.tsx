"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NetworkGraph } from "@/components/network-graph";
import { ACTIONS, loadDecisions, saveDecision } from "@/lib/decisions";
import { actionLabel, money, patternName, when } from "@/lib/format";
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
          <section className="panel">
            <div className="row-title">
              <span className={`pill ${file.action}`}>{actionLabel(file.action)}</span>
              <span className="pill">{file.pattern_label}</span>
              <span className="pill">{file.confidence} confidence</span>
            </div>
            <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>{file.customer.name}</h1>
            <p className="lede" style={{ marginBottom: 0 }}>
              {money(file.lead.amount_cents)} at {file.lead.merchant_name} · {when(file.lead.occurred_at)}
            </p>
            <p className="meta">
              {file.lead.id} · card ••{file.lead.card_last4 ?? "none"} · {file.lead.device_id} · {file.customer.home_city}, {file.customer.home_country}
            </p>
          </section>

          <section className="panel">
            <h2>What Halden thinks happened</h2>
            <p className="narrative">{file.narrative}</p>
          </section>

          <section className="panel">
            <h2>Why the score is {file.risk_score}</h2>
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
          </section>

          <section className="panel">
            <h2>How the file was worked</h2>
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
                      <span className={`pill ${step.status}`}>{step.status}</span>
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
          </section>

          <section className="panel">
            <h2>Payments in the episode</h2>
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
                      <td>{money(txn.amount_cents)}</td>
                      <td>{txn.status}</td>
                      <td>{txn.merchant_name}</td>
                      <td>{txn.device_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="sticky-side">
          <section className="panel">
            <p className="kicker">Suggested action</p>
            <h2 style={{ textTransform: "capitalize" }}>{file.action}</h2>
            <p>{file.action_rationale}</p>
            <p className="note">Halden does not apply this. You do.</p>
            <div className="actions" style={{ marginTop: 12 }}>
              {ACTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
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
                {(decision?.override ?? action !== file.action) ? " · override" : " · matches Halden"}.
                Kept in this browser. A production desk would write a database.
              </p>
            ) : null}
          </section>

          <section className="panel">
            <h2>Linked entities</h2>
            <NetworkGraph graph={file.graph} />
          </section>

          <section className="panel">
            <h2>Held-out label</h2>
            <p className="note">The investigator never saw this. It is only for the scorecard.</p>
            {truth ? (
              <p>
                {truth.is_fraud ? `Fraud · ${patternName(truth.pattern)}` : "Legitimate"}.
                {" "}Halden said {patternName(truth.predicted_pattern)} and {truth.action}.
                {" "}{truth.correct_action ? "Action matches the label." : "Action does not match the label."}
              </p>
            ) : (
              <button className="ghost" type="button" onClick={reveal}>Reveal ground truth</button>
            )}
            {truthError ? <p className="note">{truthError}</p> : null}
            <button className="ghost" type="button" onClick={download} style={{ marginLeft: 8 }}>
              Download case report
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
