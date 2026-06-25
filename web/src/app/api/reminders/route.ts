import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { upcomingReminders } from "@/lib/compliance";

export const runtime = "nodejs";

// The reminder surface — contract renewals, obligations due, and cert expiries
// that are overdue or due soon for a vendor. (Email delivery is a Phase-2 add-on;
// this drives the in-app due/expiring badges today.)
export async function GET(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vendorId = req.nextUrl.searchParams.get("vendorId") || "apex";
  return NextResponse.json({ reminders: upcomingReminders(vendorId) });
}
