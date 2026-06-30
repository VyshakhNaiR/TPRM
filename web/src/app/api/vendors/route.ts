import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { listVendors, setVendorTier } from "@/lib/users";
import { getSubmission } from "@/lib/store";
import { CONTROLS } from "@/data/seed";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

const TIERS = new Set(["Critical", "High", "Medium", "Low"]);

// Assessor/root overrides a vendor's inherent-risk tier (the self-declared value
// is advisory). Requires adjudicate:run (assessor or root).
export async function PATCH(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJson<{ vendorId?: string; tier?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, tier } = parsed.data;
  if (!vendorId || !tier || !TIERS.has(tier)) return NextResponse.json({ error: "vendorId and a valid tier required" }, { status: 400 });
  const ok = await setVendorTier(vendorId, tier);
  if (!ok) return NextResponse.json({ error: "vendor not found" }, { status: 404 });
  audit(s!.username, "set vendor tier", `${vendorId} → ${tier}`);
  return NextResponse.json({ ok: true });
}

// Vendors an assessor can open in the console: the demo vendor + onboarded ones.
export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = [
    { vendorId: "apex", name: "Apex Cloud Services Pvt. Ltd. (demo)", profile: null as Record<string, unknown> | null, assignedAssessor: undefined as string | undefined },
    ...listVendors().map((v) => ({
      vendorId: v.vendorId,
      name: v.name,
      // Slim profile for report headers (regulatory scope + hosting).
      profile: {
        regulators: v.profile?.regulators ?? [],
        infraType: v.profile?.infraType,
        csp: v.profile?.csp,
        engagementType: v.profile?.engagementType,
      } as Record<string, unknown>,
      assignedAssessor: v.profile?.assignedAssessor,
    })),
  ];
  // Assessors see vendors assigned to them plus any still-unassigned ones; Root
  // (and the customer view) see everything.
  const visible = s!.role === "assessor"
    ? rows.filter((r) => !r.assignedAssessor || r.assignedAssessor === s!.username)
    : rows;
  const vendors = visible.map((r) => {
    const sub = getSubmission(r.vendorId);
    const answered = CONTROLS.filter((c) => sub.answers[c.id] && (sub.answers[c.id].response?.trim() || sub.answers[c.id].applicable === false)).length;
    return { ...r, status: sub.status, answered, total: CONTROLS.length };
  });
  return NextResponse.json({ vendors });
}
