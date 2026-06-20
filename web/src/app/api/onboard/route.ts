import { NextRequest, NextResponse } from "next/server";
import { createVendor } from "@/lib/users";
import { encodeSession, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = await req.json();
  const profile = {
    company: (b.company || "").trim(),
    address: (b.address || "").trim(),
    website: (b.website || "").trim(),
    spocEmail: (b.email || "").trim(),
    spocPhone: (b.spocPhone || "").trim(),
    serviceDescription: (b.serviceDescription || "").trim(),
    country: (b.country || "").trim(),
    directContract: !!b.directContract,
  };
  if (!profile.company || !b.email || !b.password) {
    return NextResponse.json({ error: "Company, email and password are required." }, { status: 400 });
  }
  try {
    const session = createVendor({ email: b.email, password: b.password, profile });
    const res = NextResponse.json({ session });
    res.cookies.set(SESSION_COOKIE, encodeSession(session), {
      httpOnly: true, sameSite: "lax", path: "/",
      secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8,
    });
    return res;
  } catch (e: any) {
    if (e.message === "exists") return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    if (e.message === "invalid_input") return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    return NextResponse.json({ error: "Onboarding failed." }, { status: 500 });
  }
}
