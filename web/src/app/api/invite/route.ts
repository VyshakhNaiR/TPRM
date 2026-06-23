import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { createInvite, getInvite, listInvites, isValidEmail } from "@/lib/users";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

// Public lookup so the onboarding link can pre-fill (token acts as the secret).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const inv = getInvite(token);
    const expired = inv?.expiresAt && Date.parse(inv.expiresAt) < Date.now();
    if (!inv || inv.used || expired) return NextResponse.json({ error: "Invalid, used, or expired invite." }, { status: 404 });
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
  const parsed = await readJson<{ company?: string; email?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { company, email } = parsed.data;
  if (!company || !email) return NextResponse.json({ error: "company and email required" }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "valid email required" }, { status: 400 });
  const inv = await createInvite({ company, email, createdBy: s!.username });
  audit(s!.username, "invited vendor", company);
  return NextResponse.json({ invite: inv, link: `/onboard?invite=${inv.token}` });
}
