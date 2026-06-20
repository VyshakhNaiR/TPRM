import { NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { getAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "audit:read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ entries: getAudit() });
}
