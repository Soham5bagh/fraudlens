import { Suspense } from "react";
import { CaseFileView } from "@/components/case-file";

export default function CasePage() {
  return (
    <Suspense fallback={<div className="state">Reading the file…</div>}>
      <CaseFileView />
    </Suspense>
  );
}
