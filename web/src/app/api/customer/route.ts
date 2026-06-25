import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { customerList, vendorRequirementDetail } from "@/lib/portfolio";

export const runtime = "nodejs";

// Holistic customer view: the vendor list, or — with ?vendorId= — the
// requirement-wise compliance drill-down for one vendor.
export async function GET(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vendorId = req.nextUrl.searchParams.get("vendorId");
  if (vendorId) return NextResponse.json(vendorRequirementDetail(vendorId));
  return NextResponse.json({ vendors: customerList() });
}
