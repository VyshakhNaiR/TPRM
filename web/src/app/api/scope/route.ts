import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { getVendorProfile, setAssessmentScope, emptyScope } from "@/lib/users";
import { sanitizeScope } from "@/lib/scope-sanitize";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

// GET — vendor reads their own scope (read-only); assessor/root read any vendor.
export async function GET(req: NextRequest) {
  const s = await currentSession();
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const vendorId = s.role === "vendor" ? s.vendorId! : (req.nextUrl.searchParams.get("vendorId") || "");
  if (!vendorId) return NextResponse.json({ error: "vendorId required" }, { status: 400 });
  if (s.role !== "vendor" && !can(s.role, "submission:read:all")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const profile = getVendorProfile(vendorId);
  // Seeded demo vendors (e.g. apex) have no stored profile — return an empty
  // scope so the UI loads cleanly instead of erroring.
  if (!profile) return NextResponse.json({ scope: emptyScope(["None"]), requests: [] });

  // Merge over an empty template so legacy/partial scopes always expose the full
  // shape (arrays present, frameworks defaulting to the vendor's regulators).
  const base = emptyScope(profile.regulators ?? ["None"]);
  const scope = profile.assessmentScope ? { ...base, ...profile.assessmentScope } : base;
  const requests = profile.scopeChangeRequests ?? [];
  return NextResponse.json({ scope, requests, scopeDoc: profile.scopeDocFile ?? null });
}

// PUT — ASSESSOR/root defines or replaces the scope (versioned + audited).
export async function PUT(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "verdict:override")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJson<{ vendorId?: string; scope?: any }>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, scope } = parsed.data;
  if (!vendorId || !scope || typeof scope !== "object") {
    return NextResponse.json({ error: "vendorId and scope object required" }, { status: 400 });
  }

  const saved = await setAssessmentScope(vendorId, sanitizeScope(scope), s!.username);
  if (!saved) return NextResponse.json({ error: "vendor not found" }, { status: 404 });
  audit(s!.username, "set assessment scope", `${vendorId} (v${saved.version}, ${saved.frameworks.join("/")})`);
  return NextResponse.json({ ok: true, scope: saved });
}
