import { NextResponse } from "next/server";
import { readSeed } from "@/lib/seed";

export function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return context.params.then(({ id }) => {
    if (!/^case_\d{4}$/.test(id)) {
      return NextResponse.json({ error: "Unknown case" }, { status: 404 });
    }
    try {
      return NextResponse.json(JSON.parse(readSeed(`cases/${id}.json`)));
    } catch {
      return NextResponse.json({ error: "Unknown case" }, { status: 404 });
    }
  });
}
