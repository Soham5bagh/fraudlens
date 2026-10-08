import { Suspense } from "react";
import { InvestigateDesk } from "@/components/investigate-desk";

export default function InvestigatePage() {
  return (
    <Suspense fallback={<div className="state">Opening a live file…</div>}>
      <InvestigateDesk />
    </Suspense>
  );
}
