"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Info } from "@/components/info-tip";
import { actionLabel } from "@/lib/format";
import { patternPlain } from "@/lib/glossary";
import type { DemoStep } from "@/lib/types";

export function DemoWalk() {
  const [steps, setSteps] = useState<DemoStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/demo.json")
      .then((response) => response.json())
      .then((body: { steps: DemoStep[] }) => setSteps(body.steps))
      .catch(() => setError("The demo script did not load."));
  }, []);

  if (error) return <div className="state">{error}</div>;
  if (!steps) return <div className="state">Setting up the walkthrough…</div>;

  return (
    <>
      <p className="kicker">About three minutes</p>
      <h1>Watch Halden work through {steps.length} payments.</h1>
      <p className="lede">
        Open them in order. Each one is a file from the queue: what was flagged, what Halden found, and what it recommends.
        {steps[steps.length - 1]?.slot === "legitimate"
          ? " The last one is a genuine customer a basic rule queue would have blocked."
          : ""}
        {" "}Record a decision so you can see that a person still has to approve it.
      </p>
      <div className="stack">
        {steps.map((step, index) => (
          <article key={step.case_id} className="panel">
            <p className="kicker">Step {index + 1}</p>
            <h2>{step.title} <Info text={patternPlain(step.slot)} /></h2>
            <p>{step.say}</p>
            <p className="meta">
              {step.customer_name} · {step.amount} · risk score {step.risk_score} out of 100 · recommends {actionLabel(step.action)}
            </p>
            <p>{step.summary}</p>
            <Link href={`/cases/${step.case_id}?demo=1`} className="primary" style={{ display: "inline-block", width: "auto", padding: "10px 14px" }}>
              Open this payment
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
