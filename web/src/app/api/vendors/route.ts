import { NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { listVendors } from "@/lib/users";
import { getSubmission } from "@/lib/store";
import { CONTROLS } from "@/data/seed";

export const runtime = "nodejs";

// Vendors an assessor can open in the console: the demo vendor + onboarded ones.
export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = [{ vendorId: "apex", name: "Apex Cloud Services Pvt. Ltd. (demo)" }, ...listVendors().map((v) => ({ vendorId: v.vendorId, name: v.name }))];
  const vendors = rows.map((r) => {
    const sub = getSubmission(r.vendorId);
    const answered = CONTROLS.filter((c) => sub.answers[c.id] && (sub.answers[c.id].response?.trim() || sub.answers[c.id].applicable === false)).length;
    return { ...r, status: sub.status, answered, total: CONTROLS.length };
  });
  return NextResponse.json({ vendors });
}
