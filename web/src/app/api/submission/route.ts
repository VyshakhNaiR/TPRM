import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { getSubmission, saveAnswer, submitAll, type Answer, type AnswerSource } from "@/lib/store";
import { CONTROLS } from "@/data/seed";
import { readJson, asBool } from "@/lib/http";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_RESPONSE_CHARS = 20_000;

// Resolve who we're writing for + the provenance of the write.
// - Vendor: writes only their own submission (source "vendor").
// - Assessor/Root: may write ON BEHALF of a vendor (onsite or remote) — recorded
//   with attribution so it's never mistaken for a vendor self-attestation.
async function resolve(req: NextRequest, write: boolean) {
  const s = await currentSession();
  if (!s) return { error: "unauthenticated" as const };
  if (s.role === "vendor") return { vendorId: s.vendorId!, source: "vendor" as AnswerSource, by: s.username };
  // assessor / root
  const q = req.nextUrl.searchParams.get("vendorId");
  if (write) {
    if (!can(s.role, "submission:write:onbehalf")) return { error: "forbidden" as const };
    if (!q) return { error: "vendorId required for on-behalf entry" as const };
    const mode = (req.nextUrl.searchParams.get("mode") || "remote").toLowerCase();
    const source: AnswerSource = mode === "onsite" ? "assessor_onsite" : "assessor_remote";
    return { vendorId: q, source, by: s.username, onBehalf: true as const };
  }
  return { vendorId: q || "apex", source: "vendor" as AnswerSource, by: s.username };
}

export async function GET(req: NextRequest) {
  const r = await resolve(req, false);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  return NextResponse.json(getSubmission(r.vendorId));
}

export async function POST(req: NextRequest) {
  const r = await resolve(req, true);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  const parsed = await readJson<{ controlId?: string; response?: unknown; applicable?: unknown; justification?: unknown }>(req);
  if ("error" in parsed) return parsed.error;
  const { controlId, response, applicable, justification } = parsed.data;
  if (!controlId || !CONTROLS.some((c) => c.id === controlId)) {
    return NextResponse.json({ error: "valid controlId required" }, { status: 400 });
  }
  const patch: Partial<Answer> = { source: r.source, enteredBy: r.by };
  if (response !== undefined) patch.response = String(response ?? "").slice(0, MAX_RESPONSE_CHARS);
  if (applicable !== undefined) {
    const b = asBool(applicable);
    if (b === undefined) return NextResponse.json({ error: "applicable must be a boolean" }, { status: 400 });
    patch.applicable = b;
  }
  if (justification !== undefined) patch.justification = String(justification ?? "").slice(0, MAX_RESPONSE_CHARS);
  const out = await saveAnswer(r.vendorId, controlId, patch);
  if ("onBehalf" in r && r.onBehalf) audit(r.by, "entered answer on behalf", `${controlId} · ${r.vendorId} · ${r.source}`);
  return NextResponse.json(out);
}

export async function PUT(req: NextRequest) {
  const r = await resolve(req, true);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  // Submit gate: every applicable control with content must justify any N/A.
  const sub = getSubmission(r.vendorId);
  const missing = CONTROLS.filter((c) => {
    const a = sub.answers[c.id];
    return a && a.applicable === false && !(a.justification && a.justification.trim());
  }).map((c) => c.id);
  if (missing.length) {
    return NextResponse.json(
      { error: "Each control marked Not Applicable needs a reasoning statement.", missing },
      { status: 400 }
    );
  }
  return NextResponse.json(await submitAll(r.vendorId));
}
