import { NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { buildPortfolio } from "@/lib/portfolio";

export const runtime = "nodejs";

export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(buildPortfolio());
}
