import { NextRequest, NextResponse } from "next/server";
import { verify, encodeSession, SESSION_COOKIE } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const session = verify(username, password);
  if (!session) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  audit(session.username, "signed in", session.role);
  const res = NextResponse.json({ session });
  res.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
