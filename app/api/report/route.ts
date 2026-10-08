import { NextResponse } from "next/server";
import { readSeed } from "@/lib/seed";

export function GET() {
  return new NextResponse(readSeed("report.md"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": "attachment; filename=halden-detection-report.md",
    },
  });
}
