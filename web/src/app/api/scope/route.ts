import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { getVendorProfile, setAssessmentScope, emptyScope, type AssessmentScope } from "@/lib/users";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

const FRAMEWORKS = new Set(["RBI", "MAS", "SEBI", "None"]);
const HOSTING = new Set(["on_prem", "cloud", "hybrid"]);

function str(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max);
}
function strList(v: unknown, max: number): string[] {
  return (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, 50);
}

// Coerce arbitrary client input into a well-formed AssessmentScope (assessor-owned).
function sanitizeScope(raw: any): AssessmentScope {
  const fw = strList(raw?.frameworks, 20).filter((f) => FRAMEWORKS.has(f));
  return {
    name: str(raw?.name, 200),
    type: str(raw?.type, 100),
    periodStart: str(raw?.periodStart, 40),
    periodEnd: str(raw?.periodEnd, 40),
    services: (Array.isArray(raw?.services) ? raw.services : []).map((a: any) => ({ name: str(a?.name, 200), description: str(a?.description, 500) })).filter((a: any) => a.name).slice(0, 100),
    applications: (Array.isArray(raw?.applications) ? raw.applications : []).map((a: any) => ({ name: str(a?.name, 200), url: str(a?.url, 500), description: str(a?.description, 500) })).filter((a: any) => a.name).slice(0, 100),
    hostingModel: HOSTING.has(raw?.hostingModel) ? raw.hostingModel : undefined,
    cloudProvider: str(raw?.cloudProvider, 100),
    regions: strList(raw?.regions, 100),
    dataTypes: strList(raw?.dataTypes, 100),
    assets: (Array.isArray(raw?.assets) ? raw.assets : []).map((a: any) => ({ name: str(a?.name, 200), type: str(a?.type, 100), description: str(a?.description, 500) })).filter((a: any) => a.name).slice(0, 100),
    subcontractors: (Array.isArray(raw?.subcontractors) ? raw.subcontractors : []).map((a: any) => ({ name: str(a?.name, 200), service: str(a?.service, 200) })).filter((a: any) => a.name).slice(0, 100),
    frameworks: fw.length ? fw : ["None"],
    outOfScope: str(raw?.outOfScope, 2000),
    status: raw?.status === "active" ? "active" : "draft",
    version: 1, // re-stamped by setAssessmentScope
  };
}

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
  if (!profile) return NextResponse.json({ error: "vendor not found" }, { status: 404 });

  // Merge over an empty template so legacy/partial scopes always expose the full
  // shape (arrays present, frameworks defaulting to the vendor's regulators).
  const base = emptyScope(profile.regulators ?? ["None"]);
  const scope = profile.assessmentScope ? { ...base, ...profile.assessmentScope } : base;
  const requests = profile.scopeChangeRequests ?? [];
  return NextResponse.json({ scope, requests });
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
