import crypto from "crypto";
import { cookies } from "next/headers";

// Lightweight signed-cookie sessions. PRODUCTION: swap this module for an IdP /
// Auth.js with MFA — the rest of the app only depends on currentSession()/verify().
const SECRET = process.env.SESSION_SECRET || "dev-only-secret-change-me";
export const SESSION_COOKIE = "ni_session";

export type Role = "vendor" | "assessor";
export interface Session {
  username: string;
  role: Role;
  vendorId?: string;
  name: string;
}

// Seeded demo accounts. PRODUCTION: users live in the DB / IdP, passwords hashed.
const USERS: Record<string, { password: string; session: Session }> = {
  apex: { password: "demo", session: { username: "apex", role: "vendor", vendorId: "apex", name: "Apex Cloud Services Pvt. Ltd." } },
  dbs: { password: "demo", session: { username: "dbs", role: "assessor", name: "DBS Assessor" } },
};

function sign(data: string) {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}
export function encodeSession(s: Session): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function decodeSession(token?: string): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}
export function verify(username: string, password: string): Session | null {
  const u = USERS[(username || "").toLowerCase().trim()];
  return u && u.password === password ? u.session : null;
}
export async function currentSession(): Promise<Session | null> {
  const c = await cookies();
  return decodeSession(c.get(SESSION_COOKIE)?.value);
}
