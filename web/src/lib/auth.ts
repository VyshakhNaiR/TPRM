import crypto from "crypto";
import { cookies } from "next/headers";
import { verifyStored } from "./users";
import { sessionSecret, ALLOW_DEMO_ACCOUNTS } from "./config";

// Lightweight signed-cookie sessions. PRODUCTION: swap this module for an IdP /
// Auth.js with MFA — the rest of the app only depends on currentSession()/verify()/can().
// The signing secret is resolved lazily (see config.sessionSecret) so prod fails
// loudly if it isn't set, while the demo runs with a safe dev default.
export const SESSION_COOKIE = "ni_session";
export const SESSION_TTL_SEC = 60 * 60 * 8; // 8h

export type Role = "root" | "assessor" | "vendor" | "customer";

export interface Session {
  username: string;
  role: Role;
  vendorId?: string;
  name: string;
  exp?: number; // unix seconds; set at encode time, enforced at decode time
}

// Permissions — what each role may do.
export type Permission =
  | "submission:read:own"
  | "submission:write:own"
  | "submission:read:all"
  | "verdict:override" // assessor overrules the engine verdict with rationale
  | "adjudicate:run"
  | "users:read"
  | "users:manage"
  | "settings:read"
  | "settings:manage"
  | "audit:read";

const MATRIX: Record<Role, Permission[]> = {
  root: [
    "submission:read:own", "submission:write:own", "submission:read:all",
    "verdict:override", "adjudicate:run",
    "users:read", "users:manage", "settings:read", "settings:manage", "audit:read",
  ],
  assessor: ["submission:read:all", "verdict:override", "adjudicate:run", "audit:read"],
  vendor: ["submission:read:own", "submission:write:own"],
  // Customer: read-only holistic consumer (bank stakeholder). Sees the portfolio
  // of vendors + per-requirement compliance detail; no write, no admin/settings.
  customer: ["submission:read:all"],
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
  customer: { password: "demo", session: { username: "customer", role: "customer", name: "Customer (Bank Stakeholder)" } },
};

export const LANDING: Record<Role, string> = {
  root: "/admin",
  customer: "/customer",
  assessor: "/console",
  vendor: "/vendor",
};

function sign(data: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(data).digest("base64url");
}
// Timing-safe HMAC comparison.
function sigValid(payload: string, sig: string): boolean {
  const expected = sign(payload);
  if (expected.length !== sig.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
export function encodeSession(s: Session): string {
  const withExp: Session = { ...s, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC };
  const payload = Buffer.from(JSON.stringify(withExp)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function decodeSession(token?: string): Session | null {
  if (!token) return null;
  // Split on the LAST dot so a payload that itself contains dots can't be
  // verified against the wrong segment.
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sigValid(payload, sig)) return null;
  try {
    const s: Session = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (s.exp && s.exp < Math.floor(Date.now() / 1000)) return null; // expired
    return s;
  } catch {
    return null;
  }
}
// Constant-time string compare for the demo plaintext passwords.
function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
export function verify(username: string, password: string): Session | null {
  // Seeded demo accounts are only honored where explicitly allowed (off in prod
  // unless ALLOW_DEMO_ACCOUNTS=true).
  if (ALLOW_DEMO_ACCOUNTS) {
    const u = USERS[(username || "").toLowerCase().trim()];
    if (u && safeEq(u.password, password || "")) return u.session;
  }
  // Fall through to dynamically-onboarded vendor accounts (users.ts only type-imports auth, so no runtime cycle).
  return verifyStored(username, password);
}
export async function currentSession(): Promise<Session | null> {
  const c = await cookies();
  return decodeSession(c.get(SESSION_COOKIE)?.value);
}
