import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import type { Action } from "@/lib/types";

const FILE = path.join("/tmp", "halden-decisions.json");
const ACTIONS = new Set<Action>(["approve", "hold", "escalate", "block"]);

type Stored = {
  decisions: {
    caseId: string;
    action: Action;
    note: string;
    decidedAt: string;
    suggested: Action;
    override: boolean;
  }[];
};

function readStore(): Stored {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Stored;
  } catch {
    return { decisions: [] };
  }
}

export function GET() {
  return NextResponse.json(readStore());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    caseId?: string;
    action?: Action;
    note?: string;
    suggested?: Action;
  };
  if (!body.caseId || !body.action || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: "A case and an action are required." }, { status: 400 });
  }
  const store = readStore();
  const decision = {
    caseId: body.caseId,
    action: body.action,
    note: (body.note ?? "").slice(0, 1000),
    decidedAt: new Date().toISOString(),
    suggested: body.suggested && ACTIONS.has(body.suggested) ? body.suggested : body.action,
    override: Boolean(body.suggested && body.suggested !== body.action),
  };
  store.decisions = store.decisions.filter((row) => row.caseId !== decision.caseId);
  store.decisions.push(decision);
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(store));
  return NextResponse.json({ ok: true, decision });
}
