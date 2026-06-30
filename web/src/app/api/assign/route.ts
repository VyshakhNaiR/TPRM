import { NextRequest, NextResponse } from "next/server";
import { currentSession, can, assessorRoster } from "@/lib/auth";
import { assignVendorToAssessor } from "@/lib/users";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

// GET — the assessor roster Root can assign vendors to.
export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "users:manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ assessors: assessorRoster() });
}

// POST — Root assigns a vendor to an assessor (empty assessor clears it).
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "users:manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJson<{ vendorId?: string; assessor?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, assessor = "" } = parsed.data;
  if (!vendorId) return NextResponse.json({ error: "vendorId required" }, { status: 400 });

  if (assessor && !assessorRoster().some((a) => a.username === assessor)) {
    return NextResponse.json({ error: "unknown assessor" }, { status: 400 });
  }

  const ok = await assignVendorToAssessor(vendorId, assessor);
  if (!ok) return NextResponse.json({ error: "vendor not found" }, { status: 404 });
  audit(s!.username, assessor ? "assigned vendor" : "unassigned vendor", `${vendorId}${assessor ? ` → ${assessor}` : ""}`);
  return NextResponse.json({ ok: true });
}
