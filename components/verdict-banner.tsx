import { Info } from "@/components/info-tip";
import { actionLabel } from "@/lib/format";
import { actionPlain, patternPlain, riskBand, TERM_HELP } from "@/lib/glossary";
import type { Action } from "@/lib/types";

export function VerdictBanner({
  score,
  action,
  pattern,
  patternLabel,
  why,
}: {
  score: number;
  action: Action;
  pattern: string;
  patternLabel: string;
  why: string;
}) {
  const band = riskBand(score);
  return (
    <section className={`verdict ${band.tone}`} aria-label="FraudLens verdict">
      <div className="verdict-score">
        <b>{score}</b>
        <span>out of 100 <Info text={TERM_HELP.riskScore} /></span>
        <strong>{band.label}</strong>
      </div>
      <div>
        <p className="kicker">
          Recommends {actionLabel(action)}
          <Info text={actionPlain(action)} />
        </p>
        <p className="verdict-why">{why}</p>
        <p className="verdict-pattern">
          {patternLabel}
          <Info text={patternPlain(pattern)} />
        </p>
      </div>
    </section>
  );
}
