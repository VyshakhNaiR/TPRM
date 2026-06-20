import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { setReview } from "@/lib/store";

export const runtime = "nodejs";

// Assessor returns a finding to the vendor for remediation.
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { vendorId, controlId, verdict, risk, riskStatement, recommendations } = await req.json();
  if (!vendorId || !controlId) return NextResponse.json({ error: "vendorId and controlId required" }, { status: 400 });
  const sub = setReview(vendorId, controlId, {
    verdict: verdict || "Non-Compliant",
    risk: risk || "Medium Risk",
    riskStatement: riskStatement || "",
    recommendations: Array.isArray(recommendations) ? recommendations : [],
  });
  return NextResponse.json({ ok: true, review: sub.reviews?.[controlId] });
}
