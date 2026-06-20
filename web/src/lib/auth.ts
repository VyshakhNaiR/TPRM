import crypto from "crypto";
import { cookies } from "next/headers";
import { verifyStored } from "./users";

// Lightweight signed-cookie sessions. PRODUCTION: swap this module for an IdP /
// Auth.js with MFA — the rest of the app only depends on currentSession()/verify()/can().
const SECRET = process.env.SESSION_SECRET || "dev-only-secret-change-me";
export const SESSION_COOKIE = "ni_session";

export type Role = "root" | "assessor" | "vendor" | "viewer";

export interface Session {
  username: string;
  role: Role;
  vendorId?: string;
  name: string;
}

// Permissions — what each role may do.
export type Permission =
  | "submission:read:own"
  | "submission:write:own"
  | "submission:read:all"
  | "adjudicate:run"
  | "users:read"
  | "users:manage"
  | "settings:read"
  | "settings:manage"
  | "audit:read";

const MATRIX: Record<Role, Permission[]> = {
  root: [
    "submission:read:own", "submission:write:own", "submission:read:all", "adjudicate:run",
    "users:read", "users:manage", "settings:read", "settings:manage", "audit:read",
  ],
  assessor: ["submission:read:all", "adjudicate:run", "audit:read"],
  vendor: ["submission:read:own", "submission:write:own"],
  viewer: ["submission:read:all", "users:read", "settings:read", "audit:read"],
};

export function can(role: Role | undefined, perm: Permission): boolean {
  return !!role && MATRIX[role].includes(perm);
}

// Seeded demo accounts. PRODUCTION: users live in the DB / IdP, passwords hashed,
// and the Root user manages them via the admin console.
export const USERS: Record<string, { password: string; session: Session }> = {
  root: { password: "demo", session: { username: "root", role: "root", name: "Root Administrator" } },
  dbs: { password: "demo", session: { username: "dbs", role: "assessor", name: "DBS Assessor" } },
  apex: { password: "demo", session: { username: "apex", role: "vendor", vendorId: "apex", name: "Apex Cloud Services Pvt. Ltd." } },
  viewer: { password: "demo", session: { username: "viewer", role: "viewer", name: "Audit Viewer" } },
};

export const LANDING: Record<Role, string> = {
  root: "/admin",
  viewer: "/admin",
  assessor: "/console",
  vendor: "/vendor",
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
  if (u && u.password === password) return u.session;
  // Fall through to dynamically-onboarded vendor accounts (users.ts only type-imports auth, so no runtime cycle).
  return verifyStored(username, password);
}
export async function currentSession(): Promise<Session | null> {
  const c = await cookies();
  return decodeSession(c.get(SESSION_COOKIE)?.value);
}
