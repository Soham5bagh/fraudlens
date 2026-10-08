import { readFileSync } from "fs";
import path from "path";

export function readSeed(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), "data", "seed", relativePath), "utf8");
}
