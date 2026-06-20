import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { createInvite, getInvite, listInvites } from "@/lib/users";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

// Public lookup so the onboarding link can pre-fill (token acts as the secret).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const inv = getInvite(token);
    if (!inv || inv.used) return NextResponse.json({ error: "Invalid or used invite." }, { status: 404 });
    return NextResponse.json({ invite: { company: inv.company, email: inv.email } });
  }
  // List invites (assessor/root)
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ invites: listInvites() });
}

// Assessor/root creates an invite.
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { company, email } = await req.json();
  if (!company || !email) return NextResponse.json({ error: "company and email required" }, { status: 400 });
  const inv = createInvite({ company, email, createdBy: s!.username });
  audit(s!.username, "invited vendor", company);
  return NextResponse.json({ invite: inv, link: `/onboard?invite=${inv.token}` });
}
