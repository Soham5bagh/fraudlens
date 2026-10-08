import { NextResponse } from "next/server";
import { readSeed } from "@/lib/seed";

export function GET() {
  return NextResponse.json(JSON.parse(readSeed("metrics.json")));
}
