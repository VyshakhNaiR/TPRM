import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { getSubmission, saveAnswer, submitAll, type Answer } from "@/lib/store";
import { findControl, controlsForVendorId, modeForVendorId } from "@/lib/scope";
import { readJson, asBool } from "@/lib/http";

export const runtime = "nodejs";

const MAX_RESPONSE_CHARS = 20_000;

// The VENDOR is the sole data-entry party. Vendors write only their own
// submission; assessors/root may READ any vendor's submission but never write it
// (they validate via verdict override). No on-behalf entry.
async function resolve(req: NextRequest, write: boolean) {
  const s = await currentSession();
  if (!s) return { error: "unauthenticated" as const };
  if (s.role === "vendor") return { vendorId: s.vendorId!, by: s.username };
  if (write) return { error: "forbidden" as const }; // assessors don't write vendor answers
  const q = req.nextUrl.searchParams.get("vendorId");
  return { vendorId: q || "apex", by: s.username };
}

export async function GET(req: NextRequest) {
  const r = await resolve(req, false);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  return NextResponse.json({ ...getSubmission(r.vendorId), questionnaireMode: modeForVendorId(r.vendorId) });
}

export async function POST(req: NextRequest) {
  const r = await resolve(req, true);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  const parsed = await readJson<{ controlId?: string; response?: unknown; applicable?: unknown; justification?: unknown }>(req);
  if ("error" in parsed) return parsed.error;
  const { controlId, response, applicable, justification, coverage, certType, certMappingNote } = parsed.data as any;
  if (!controlId || !findControl(controlId)) {
    return NextResponse.json({ error: "valid controlId required" }, { status: 400 });
  }
  const patch: Partial<Answer> = { source: "vendor", enteredBy: r.by };
  if (response !== undefined) patch.response = String(response ?? "").slice(0, MAX_RESPONSE_CHARS);
  if (applicable !== undefined) {
    const b = asBool(applicable);
    if (b === undefined) return NextResponse.json({ error: "applicable must be a boolean" }, { status: 400 });
    patch.applicable = b;
  }
  if (justification !== undefined) patch.justification = String(justification ?? "").slice(0, MAX_RESPONSE_CHARS);
  // Certification-as-evidence (Phase C)
  if (coverage !== undefined) {
    if (!["evidence", "certification", "not_applicable"].includes(coverage)) {
      return NextResponse.json({ error: "invalid coverage" }, { status: 400 });
    }
    patch.coverage = coverage;
  }
  if (certType !== undefined) {
    if (certType !== null && !["iso27001", "pci_aoc", "soc2_type2"].includes(certType)) {
      return NextResponse.json({ error: "invalid certType" }, { status: 400 });
    }
    patch.certType = certType || undefined;
  }
  if (certMappingNote !== undefined) patch.certMappingNote = String(certMappingNote ?? "").slice(0, MAX_RESPONSE_CHARS);
  const out = await saveAnswer(r.vendorId, controlId, patch);
  return NextResponse.json(out);
}

// A control is "complete" when it has been fully answered in one of the modes.
// Kept in sync with the vendor UI's isAnswered().
export function answerComplete(a: Answer | undefined): boolean {
  if (!a) return false;
  const cov = a.coverage || (a.applicable === false ? "not_applicable" : "evidence");
  if (cov === "not_applicable") return !!(a.justification && a.justification.trim());
  if (cov === "certification") return !!(a.certType && a.certMappingNote && a.certMappingNote.trim());
  return !!(a.response && a.response.trim()) || (a.evidence?.length ?? 0) > 0;
}

export async function PUT(req: NextRequest) {
  const r = await resolve(req, true);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  // Submit gate: the questionnaire must be COMPLETE — every control fully answered
  // (evidence / certification / not-applicable-with-reason). Incomplete submission
  // is blocked, and N/A without a reason is reported specifically.
  const sub = getSubmission(r.vendorId);
  const scope = controlsForVendorId(r.vendorId);
  const missingReason = scope.filter((c) => {
    const a = sub.answers[c.id];
    return a && (a.coverage === "not_applicable" || a.applicable === false) && !(a.justification && a.justification.trim());
  }).map((c) => c.id);
  if (missingReason.length) {
    return NextResponse.json({ error: "Each control marked Not Applicable needs a reasoning statement.", missing: missingReason }, { status: 400 });
  }
  const incomplete = scope.filter((c) => {
    const a = sub.answers[c.id];
    if (!answerComplete(a)) return true;
    // Certification answers need the referenced cert present in the library.
    if (a?.coverage === "certification" && !(a.certType && (sub.certs ?? []).some((ct) => ct.certType === a.certType))) return true;
    return false;
  }).map((c) => c.id);
  if (incomplete.length) {
    return NextResponse.json(
      { error: `Complete all ${scope.length} requirements before submitting — ${incomplete.length} still pending.`, incomplete },
      { status: 400 }
    );
  }
  return NextResponse.json(await submitAll(r.vendorId));
}
