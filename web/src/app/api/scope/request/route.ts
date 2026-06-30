import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { addScopeChangeRequest, decideScopeChangeRequest } from "@/lib/users";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

// POST — vendor files a scope-change request (justification only).
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!s || s.role !== "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJson<{ justification?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const justification = (parsed.data.justification || "").trim();
  if (justification.length < 10) {
    return NextResponse.json({ error: "Please describe the change you need (min. 10 characters)." }, { status: 400 });
  }

  const created = await addScopeChangeRequest(s.vendorId!, s.username, justification);
  if (!created) return NextResponse.json({ error: "vendor not found" }, { status: 404 });
  audit(s.username, "requested scope change", `${s.vendorId}`);
  return NextResponse.json({ ok: true, request: created });
}

// PATCH — assessor/root approves or rejects a pending request.
export async function PATCH(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "verdict:override")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJson<{ vendorId?: string; requestId?: string; decision?: string; note?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, requestId, decision, note } = parsed.data;
  if (!vendorId || !requestId || (decision !== "approved" && decision !== "rejected")) {
    return NextResponse.json({ error: "vendorId, requestId and a valid decision required" }, { status: 400 });
  }

  const updated = await decideScopeChangeRequest(vendorId, requestId, decision, s!.username, note);
  if (!updated) return NextResponse.json({ error: "request not found or already decided" }, { status: 404 });
  audit(s!.username, `scope change ${decision}`, `${vendorId}`);
  return NextResponse.json({ ok: true, request: updated });
}
