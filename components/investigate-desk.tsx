"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Info } from "@/components/info-tip";
import { NetworkGraph } from "@/components/network-graph";
import { VerdictBanner } from "@/components/verdict-banner";
import { ACTIONS, loadDecisions, saveDecision } from "@/lib/decisions";
import { actionLabel, money, when } from "@/lib/format";
import { actionPlain, patternPlain, statusPlain } from "@/lib/glossary";
import { useDecisionKeys } from "@/lib/use-decision-keys";
import { PLANTED } from "@/lib/live/scenarios";
import type { Investigation, PlantedScenario, ScenarioChoice, Truth } from "@/lib/live/types";
import type { Action, AnalystDecision } from "@/lib/types";

const CHOICES: { id: ScenarioChoice; label: string }[] = [
  { id: "card_testing", label: "Card testing" },
  { id: "account_takeover", label: "Account takeover" },
  { id: "mule_chain", label: "Mule chain" },
  { id: "merchant_collusion", label: "Merchant collusion" },
  { id: "genuine", label: "Genuine customer" },
  { id: "random", label: "Random" },
];

const VALID = new Set<string>([...PLANTED, "random"]);

export function InvestigateDesk() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("scenario") ?? "card_testing";
  const choice: ScenarioChoice = VALID.has(requested) ? (requested as ScenarioChoice) : "card_testing";
  const seedRaw = params.get("seed");
  const seed = seedRaw && /^\d+$/.test(seedRaw) ? Number(seedRaw) : null;

  const [picked, setPicked] = useState<ScenarioChoice>(choice);
  const [file, setFile] = useState<Investigation | null>(null);
  const [truth, setTruth] = useState<Truth | null>(null);
  const [shown, setShown] = useState(0);
  const [decision, setDecision] = useState<AnalystDecision | undefined>();
  const [action, setAction] = useState<Action>("approve");
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    setPicked(choice);
  }, [choice]);

  useEffect(() => {
    void import("@/lib/live/generate");
  }, []);

  useEffect(() => {
    setFile(null);
    setTruth(null);
    setShown(0);
    setFailed(null);
    if (seed == null) return;
    let active = true;
    import("@/lib/live/generate")
      .then(({ runLive }) => runLive(choice, seed))
      .then((result) => {
        if (!active) return;
        const existing = loadDecisions()[decisionKey(result.truth.scenario, seed)];
        setFile(result.investigation);
        setTruth(result.truth);
        setDecision(existing);
        setAction(existing?.action ?? result.investigation.action);
        setNote(existing?.note ?? "");
      })
      .catch(() => {
        if (active) setFailed("This file could not be built. Try another seed.");
      });
    return () => {
      active = false;
    };
  }, [choice, seed]);

  useEffect(() => {
    if (!file || shown >= file.timeline.length) return;
    const timer = window.setTimeout(() => setShown((count) => count + 1), 420);
    return () => window.clearTimeout(timer);
  }, [file, shown]);

  const ready = Boolean(file && shown >= file.timeline.length);
  const planted = truth?.scenario;

  function investigateNew() {
    const nextSeed = crypto.getRandomValues(new Uint32Array(1))[0] % 900_000 + 1_000;
    const scenario = picked;
    router.replace(`/investigate?scenario=${scenario}&seed=${nextSeed}`);
  }

  useDecisionKeys(ready, setAction, () => record());

  function record() {
    if (!file || !truth || seed == null) return;
    const saved = saveDecision({
      caseId: decisionKey(truth.scenario, seed),
      action,
      note,
      decidedAt: new Date().toISOString(),
      suggested: file.action,
      override: action !== file.action,
    });
    setDecision(saved[decisionKey(truth.scenario, seed)]);
  }

  return (
    <>
      <p className="kicker">Live file · made up in your browser</p>
      <h1>Investigate a new payment.</h1>
      <p className="lede">
        Pick the kind of case you want to see, then open a fresh flagged payment. FraudLens checks the history, the device, the location, and where the money went. It does not know which kind you picked. That answer appears only after you decide.
      </p>
      <div className="filters" role="group" aria-label="What kind of case to generate">
        {CHOICES.map((item) => (
          <button key={item.id} type="button" className={picked === item.id ? "on" : undefined} title={patternPlain(item.id)} onClick={() => setPicked(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <p className="verdict-pattern">{labelFor(picked)} <Info text={patternPlain(picked)} /></p>
      <button className="primary" type="button" onClick={investigateNew} style={{ width: "auto", padding: "10px 14px" }}>
        Investigate a new payment
      </button>

      {failed ? (
        <div className="state" style={{ marginTop: 18 }}>{failed}</div>
      ) : seed != null && (!file || !truth) ? (
        <div className="state" style={{ marginTop: 18 }}>Opening the file…</div>
      ) : seed == null || !file || !truth ? (
        <p className="note" style={{ marginTop: 18 }}>
          Nothing is open yet. A seed in the address bar, such as{" "}
          <Link href="/investigate?scenario=card_testing&seed=1234">/investigate?scenario=card_testing&seed=1234</Link>,
          replays the same file.
        </p>
      ) : (
        <div className="case-grid" style={{ marginTop: 22 }}>
          <div className="stack">
            <section className="panel">
              <p className="meta">Seed {seed} · {labelFor(choice)} · {file.customer.id}</p>
              <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)" }}>{file.customer.name}</h2>
              <p className="lede" style={{ marginBottom: 0 }}>
                {money(file.lead.amountCents)} at {file.lead.merchantName} · {when(file.lead.occurredAt)}
              </p>
              <p className="meta">
                {file.lead.id} · {file.lead.cardLast4 ? `card ••${file.lead.cardLast4}` : "no card on this transfer"} · {file.lead.deviceId} · {file.customer.homeCity}, {file.customer.homeCountry}
              </p>
            </section>

            {ready && file ? (
              <VerdictBanner
                score={file.riskScore}
                action={file.action}
                pattern={file.pattern}
                patternLabel={file.patternLabel}
                why={file.summary}
              />
            ) : (
              <section className="verdict pending" aria-live="polite">
                <div>
                  <p className="kicker">Verdict</p>
                  <p className="verdict-why">FraudLens is still checking this payment.</p>
                  <p className="hint">Score and recommendation land when the last check finishes.</p>
                </div>
              </section>
            )}

            <section className="panel">
              <h2>Evidence, step by step</h2>
              {shown === 0 ? <p className="state">Opening the file…</p> : null}
              <ol className="timeline">
                {file.timeline.slice(0, shown).map((step, index) => (
                  <li key={step.id}>
                    <div className="rail">
                      <span className={`dot ${step.status}`} />
                      {index < shown - 1 ? <span className="stem" /> : null}
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
            </section>

            {ready ? (
              <>
                <section className="panel">
                  <h2>What FraudLens thinks happened</h2>
                  <p className="narrative">{file.narrative}</p>
                </section>
                <section className="panel">
                  <h2>Why the score is {file.riskScore}</h2>
                  <ul className="signals">
                    {file.signals.map((signal) => (
                      <li key={signal.name}>
                        <span className="points">+{signal.points}</span>
                        <span><b>{signal.name}.</b> {signal.detail}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="panel">
                  <h2>Payments in the window</h2>
                  <div className="scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Id</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Merchant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {file.related.map((txn) => (
                          <tr key={txn.id}>
                            <td>{when(txn.occurredAt)}</td>
                            <td>{txn.id}</td>
                            <td>{money(txn.amountCents)}</td>
                            <td>{txn.status}</td>
                            <td>{txn.merchantName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}
          </div>

          <aside className="sticky-side">
            <section className="panel">
              <p className="kicker">Your decision <Info text="FraudLens does not apply this. You do." /></p>
              {ready ? (
                <>
                  <h2 style={{ textTransform: "capitalize" }}>{actionLabel(file.action)} <Info text={actionPlain(file.action)} /></h2>
                  <p>{file.actionRationale}</p>
                  <p className="keys"><kbd>A</kbd> <kbd>H</kbd> <kbd>E</kbd> <kbd>B</kbd> choose · <kbd>R</kbd> record</p>
                  <div className="actions" style={{ marginTop: 12 }}>
                    {ACTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        title={actionPlain(option)}
                        className={`${option === action ? "chosen" : ""} pill ${option}`}
                        onClick={() => setAction(option)}
                      >
                        {actionLabel(option)}
                      </button>
                    ))}
                  </div>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note for the audit log" aria-label="Decision note" style={{ marginTop: 10 }} />
                  <button className="primary" type="button" onClick={record}>Record decision</button>
                  {decision ? (
                    <p className="note">
                      Recorded {when(decision.decidedAt)}: {actionLabel(decision.action)}
                      {decision.override ? " · override" : " · matches FraudLens"}. Kept in this browser.
                    </p>
                  ) : (
                    <p className="note">The planted scenario appears after you record a decision.</p>
                  )}
                </>
              ) : (
                <p className="note">The score and the suggested action appear when the last check finishes.</p>
              )}
            </section>

            {ready && decision && planted ? (
              <section className="panel">
                <h2>What was actually planted</h2>
                <p>
                  Planted: {truth.label}. {patternPlain(truth.scenario)} FraudLens named {file.patternLabel} and suggested {file.action}.{" "}
                  {verdict(truth, file) ? "That matches." : "That does not match."}
                </p>
                <p className="note">FraudLens never received this label. It only saw the generated payments.</p>
              </section>
            ) : null}

            {ready ? (
              <section className="panel">
                <h2>Linked accounts <Info text="Customers, devices, and shops tied to this payment." /></h2>
                <NetworkGraph graph={file.graph} />
                <p className="note">{file.graph.caption}</p>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </>
  );
}

function decisionKey(scenario: PlantedScenario, seed: number): string {
  return `live_${scenario}_${seed}`;
}

function labelFor(choice: ScenarioChoice): string {
  return CHOICES.find((item) => item.id === choice)?.label ?? choice;
}

function verdict(truth: Truth, file: Investigation): boolean {
  const patternOk = truth.fraud ? file.pattern === truth.scenario : file.pattern === "legitimate";
  const actionOk = truth.fraud ? file.action === "block" || file.action === "escalate" : file.action === "approve";
  return patternOk && actionOk;
}
