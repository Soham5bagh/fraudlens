import type { PlantedScenario, ScenarioChoice } from "./types";

export const PLANTED: PlantedScenario[] = [
  "card_testing",
  "account_takeover",
  "mule_chain",
  "merchant_collusion",
  "genuine",
];

export function resolveScenario(choice: ScenarioChoice, seed: number): PlantedScenario {
  if (choice === "random") return PLANTED[Math.abs(seed) % PLANTED.length];
  return PLANTED.includes(choice) ? choice : "card_testing";
}
