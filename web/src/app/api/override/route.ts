import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { setOverride, clearOverride } from "@/lib/store";
import { CONTROLS } from "@/data/seed";
import { readJson } from "@/lib/http";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const VERDICTS = new Set(["Compliant", "Non-Compliant", "Not Applicable"]);
const RISKS = new Set(["High Risk", "Medium Risk", "Low Risk", "None"]);

// Assessor overrides the engine verdict with professional judgment. A rationale
// is mandatory — this is the human-authority record an auditor expects.
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "verdict:override")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJson<{ vendorId?: string; controlId?: string; verdict?: string; risk?: string; rationale?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, controlId, verdict, risk, rationale } = parsed.data;
  if (!vendorId || !controlId || !CONTROLS.some((c) => c.id === controlId)) {
    return NextResponse.json({ error: "valid vendorId and controlId required" }, { status: 400 });
  }
  if (!verdict || !VERDICTS.has(verdict)) return NextResponse.json({ error: "valid verdict required" }, { status: 400 });
  if (!rationale || !rationale.trim()) return NextResponse.json({ error: "an override rationale is required" }, { status: 400 });
  const sub = await setOverride(vendorId, controlId, {
    verdict,
    risk: RISKS.has(risk || "") ? (risk as string) : verdict === "Compliant" ? "None" : "Medium Risk",
    rationale: rationale.trim().slice(0, 4000),
    by: s!.username,
  });
  audit(s!.username, "overrode verdict", `${controlId} · ${vendorId} → ${verdict}`);
  return NextResponse.json({ ok: true, override: sub.overrides?.[controlId] });
}

export async function DELETE(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "verdict:override")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vendorId = req.nextUrl.searchParams.get("vendorId") || "";
  const controlId = req.nextUrl.searchParams.get("controlId") || "";
  if (!vendorId || !controlId) return NextResponse.json({ error: "vendorId and controlId required" }, { status: 400 });
  await clearOverride(vendorId, controlId);
  audit(s!.username, "cleared verdict override", `${controlId} · ${vendorId}`);
  return NextResponse.json({ ok: true });
}
