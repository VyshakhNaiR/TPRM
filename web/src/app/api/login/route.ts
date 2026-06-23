import { NextRequest, NextResponse } from "next/server";
import { verify, encodeSession, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";
import { IS_PROD } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const parsed = await readJson<{ username?: string; password?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { username, password } = parsed.data;

  const session = verify(username || "", password || "");
  if (!session) {
    // Log failed attempts (required by MAS TRM / RBI IT security guidelines and
    // needed to detect brute force). Rate limiting is enforced in middleware.ts.
    audit(username || "unknown", "login failed", "invalid credentials");
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  audit(session.username, "signed in", session.role);
  const res = NextResponse.json({ session });
  res.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: IS_PROD,
    maxAge: SESSION_TTL_SEC,
  });
  return res;
}
