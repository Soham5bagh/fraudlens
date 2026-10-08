import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PLANTED, runLive } from "../../lib/live/generate";
import { investigate } from "../../lib/live/investigate";
import type { CaseInput, PlantedScenario, World } from "../../lib/live/types";

const FRAUD = new Set<PlantedScenario>(["card_testing", "account_takeover", "mule_chain", "merchant_collusion"]);

test("same seed produces the same investigation", () => {
  const first = runLive("card_testing", 1234);
  const second = runLive("card_testing", 1234);
  assert.deepEqual(first.investigation, second.investigation);
  assert.deepEqual(first.truth, second.truth);
  assert.notEqual(runLive("card_testing", 1234).investigation.narrative, runLive("card_testing", 99).investigation.narrative);
});

test("the investigator does not need the planted label", () => {
  const built = runLive("genuine", 77);
  assert.equal(built.investigation.pattern, "legitimate");
  assert.equal(built.truth.scenario, "genuine");
  assert.equal("scenario" in built.investigation, false);
});

test("fraud scenarios are named and challenged across 200 seeds", () => {
  const misses: string[] = [];
  for (const scenario of PLANTED) {
    let patternHits = 0;
    let actionHits = 0;
    const holds: number[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const { investigation, truth } = runLive(scenario, seed);
      assert.ok(investigation.timeline.length >= 8, `${scenario} ${seed} timeline`);
      assert.ok(investigation.riskScore >= 0 && investigation.riskScore <= 100);
      assert.ok(["approve", "hold", "escalate", "block"].includes(investigation.action));
      const patternOk = truth.fraud ? investigation.pattern === scenario : investigation.pattern === "legitimate";
      const actionOk = truth.fraud
        ? investigation.action === "block" || investigation.action === "escalate"
        : investigation.action === "approve";
      if (patternOk) patternHits += 1;
      if (actionOk) actionHits += 1;
      else if (!truth.fraud && investigation.action === "hold") holds.push(seed);
      if (!patternOk || !actionOk) misses.push(`${scenario} seed ${seed} -> ${investigation.pattern}/${investigation.action}`);
    }
    console.log(`${scenario}: pattern ${patternHits}/200, action ${actionHits}/200, genuine holds ${holds.length}`);
    assert.equal(patternHits, 200, `${scenario} pattern misses`);
    if (FRAUD.has(scenario as PlantedScenario)) assert.equal(actionHits, 200, `${scenario} action misses`);
    else assert.ok(actionHits >= 190, `${scenario} approved ${actionHits}/200`);
  }
  assert.deepEqual(misses, []);
});

test("random seeds do not crash", () => {
  for (let seed = 1; seed <= 1000; seed += 1) {
    const result = runLive("random", seed);
    assert.ok(result.investigation.narrative.length > 40);
    assert.ok(result.investigation.timeline.every((step) => step.finding.length > 0));
    assert.equal(result.truth.scenario, PLANTED[seed % PLANTED.length]);
  }
});

test("live agent agrees with the Python agent on the 30 desk cases", () => {
  const book = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/parity-book.json"), "utf8")) as {
    world: World;
    cases: { case: CaseInput; pattern: string; action: string }[];
  };
  const expected = new Map<string, { pattern: string; action: string }>();
  const dir = path.join(process.cwd(), "public/data/cases");
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const file = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as { case_id: string; pattern: string; action: string };
    expected.set(file.case_id, { pattern: file.pattern, action: file.action });
  }
  let agree = 0;
  const diffs: string[] = [];
  for (const row of book.cases) {
    const result = investigate(book.world, row.case);
    const fromFile = expected.get(row.case.case_id);
    assert.ok(fromFile, row.case.case_id);
    assert.equal(row.pattern, fromFile.pattern);
    assert.equal(row.action, fromFile.action);
    const ok = result.pattern === fromFile.pattern && result.action === fromFile.action;
    if (ok) agree += 1;
    else diffs.push(`${row.case.case_id} python ${fromFile.pattern}/${fromFile.action} ts ${result.pattern}/${result.action}`);
  }
  console.log(`parity ${agree}/${book.cases.length}`);
  assert.deepEqual(diffs, []);
});
