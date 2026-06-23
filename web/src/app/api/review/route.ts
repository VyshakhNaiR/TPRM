import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { setReview } from "@/lib/store";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";
import { CONTROLS } from "@/data/seed";

export const runtime = "nodejs";

const VERDICTS = new Set(["Compliant", "Non-Compliant", "Not Applicable"]);
const RISKS = new Set(["High Risk", "Medium Risk", "Low Risk", "None"]);

// Assessor returns a finding to the vendor for remediation.
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJson<any>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, controlId, verdict, risk, riskStatement, recommendations } = parsed.data;
  if (!vendorId || !controlId || !CONTROLS.some((c) => c.id === controlId)) {
    return NextResponse.json({ error: "valid vendorId and controlId required" }, { status: 400 });
  }
  const sub = await setReview(vendorId, controlId, {
    verdict: VERDICTS.has(verdict) ? verdict : "Non-Compliant",
    risk: RISKS.has(risk) ? risk : "Medium Risk",
    riskStatement: typeof riskStatement === "string" ? riskStatement.slice(0, 5000) : "",
    recommendations: Array.isArray(recommendations) ? recommendations.map((r) => String(r).slice(0, 1000)).slice(0, 20) : [],
  });
  audit(s!.username, "returned for remediation", `${controlId} · ${vendorId}`);
  return NextResponse.json({ ok: true, review: sub.reviews?.[controlId] });
}
