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
  const plain = patternPlain(pattern);
  return (
    <section className={`verdict ${band.tone}`} aria-label="Halden's verdict">
      <div className="verdict-score">
        <b>{score}</b>
        <span>risk score out of 100</span>
        <strong>{band.label}</strong>
      </div>
      <div>
        <p className="kicker">Halden recommends {ACTION_WORD[action]}</p>
        <p className="verdict-why">{why}</p>
        <p className="hint">{actionPlain(action)}</p>
        <p className="hint">
          <b>{patternLabel}.</b> {plain} {TERM_HELP.riskScore}
        </p>
      </div>
    </section>
  );
}

const ACTION_WORD: Record<Action, string> = {
  approve: "approve",
  hold: "hold",
  escalate: "escalate",
  block: "block",
};
