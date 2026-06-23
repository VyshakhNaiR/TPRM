import { NextRequest, NextResponse } from "next/server";
import { createVendor, consumeInviteIfValid, isValidEmail } from "@/lib/users";
import { encodeSession, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth";
import { computeTier } from "@/lib/risk";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";
import { REQUIRE_INVITE, IS_PROD } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const parsed = await readJson<any>(req);
  if ("error" in parsed) return parsed.error;
  const b = parsed.data;

  const email = (b.email || "").trim().toLowerCase();
  if (!b.company || !email || !b.password) {
    return NextResponse.json({ error: "Company, email and password are required." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }

  // Invite enforcement. Required in production (assessor/root must issue it);
  // optional in the demo so the onboarding flow can be shown without one.
  if (REQUIRE_INVITE && !b.invite) {
    return NextResponse.json({ error: "An invite is required to onboard. Ask your bank contact for an invite link." }, { status: 403 });
  }
  if (b.invite) {
    // Atomically validate + mark the invite used BEFORE creating the account, so
    // a token can't be raced into two accounts and the email must match.
    const res = await consumeInviteIfValid(b.invite, email);
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 403 });
  }

  const { tier, score } = computeTier({
    dataSensitivity: b.dataSensitivity || "confidential",
    access: b.access || "limited",
    criticality: b.criticality || "medium",
    frameworks: Array.isArray(b.frameworks) ? b.frameworks : [],
    volume: b.volume || "medium",
  });
  const profile = {
    company: (b.company || "").trim(),
    address: (b.address || "").trim(),
    website: (b.website || "").trim(),
    spocEmail: email,
    spocPhone: (b.spocPhone || "").trim(),
    serviceDescription: (b.serviceDescription || "").trim(),
    country: (b.country || "").trim(),
    directContract: !!b.directContract,
    // Self-declared at intake; an assessor can override (see /api/vendors PATCH).
    tier,
    tierScore: score,
    tierSelfDeclared: true,
  };

  try {
    const session = await createVendor({ email, password: b.password, profile });
    audit(session.username, "vendor onboarded", `${profile.company} · ${tier} tier (self-declared)`);
    const res = NextResponse.json({ session });
    res.cookies.set(SESSION_COOKIE, encodeSession(session), {
      httpOnly: true, sameSite: "strict", path: "/",
      secure: IS_PROD, maxAge: SESSION_TTL_SEC,
    });
    return res;
  } catch (e: any) {
    if (e.message === "exists") return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    if (e.message === "weak_password") return NextResponse.json({ error: "Password is too weak. Use at least 12 characters with letters and numbers." }, { status: 400 });
    if (e.message === "invalid_email") return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    return NextResponse.json({ error: "Onboarding failed." }, { status: 500 });
  }
}
