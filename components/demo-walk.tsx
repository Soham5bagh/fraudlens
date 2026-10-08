"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { actionLabel } from "@/lib/format";
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
      <p className="kicker">Three to five minutes</p>
      <h1>Open these five files, in order.</h1>
      <p className="lede">
        Three fraud patterns, a fourth if you have a minute, then a genuine customer the queue got wrong.
        Record a decision on the last one so the room sees that a person still has to approve it.
      </p>
      <div className="stack">
        {steps.map((step, index) => (
          <article key={step.case_id} className="panel">
            <p className="kicker">Step {index + 1}</p>
            <h2>{step.title}</h2>
            <p>{step.say}</p>
            <p className="meta">
              {step.customer_name} · {step.amount} · risk {step.risk_score} · suggest {actionLabel(step.action)}
            </p>
            <p>{step.summary}</p>
            <Link href={`/cases/${step.case_id}?demo=1`} className="primary" style={{ display: "inline-block", width: "auto", padding: "10px 14px" }}>
              Open {step.case_id}
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
