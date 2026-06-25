import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Session } from "./auth";
import { withLock } from "./lock";
import { IS_PROD } from "./config";

// Dynamic, persisted vendor accounts (onboarding). File-backed for the demo.
// PRODUCTION: move to the DB; passwords already hashed (scrypt) here.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "users.json");

export interface UploadRef { id: string; filename: string; size: number }
export interface VendorProfile {
  company: string;
  address: string;
  website: string;
  spocEmail: string;
  spocPhone: string;
  serviceDescription: string;
  country: string;
  directContract: boolean;
  tier?: string;
  tierScore?: number;
  tierSelfDeclared?: boolean; // true until an assessor validates/overrides it
  // ---- Assessor-led onboarding (Phase A) ----
  engagementType?: "due_diligence" | "existing";
  infraType?: "on_prem" | "cloud" | "hybrid";
  csp?: string; // cloud service provider when cloud/hybrid
  regulators?: string[]; // applicable: any of RBI / MAS / SEBI / None
  tprmInitiatedAt?: string; // ISO; when the assessment was initiated
  agreementFile?: UploadRef; // existing vendors: contract/MSA
  lastAuditFile?: UploadRef; // existing vendors: last TPRM audit report
  onboardedBy?: string; // assessor username who created the vendor
}
export interface StoredUser {
  username: string; // login id (email)
  name: string; // display = company
  vendorId: string;
  salt: string;
  hash: string;
  status: "active";
  profile: VendorProfile;
  createdAt: string;
}

function readAll(): Record<string, StoredUser> {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeAll(all: Record<string, StoredUser>) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}
function hashPw(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

// Password policy. Demo allows short passwords for convenience; prod requires a
// genuine passphrase (>=12 chars with letters + digits) and rejects the most
// common throwaways. Returns null if OK, else a human-readable reason.
const COMMON_PW = new Set([
  "password", "passw0rd", "123456", "12345678", "123456789", "qwerty",
  "111111", "abc123", "letmein", "welcome", "admin123", "changeme", "demo1234",
]);
const MIN_LEN = IS_PROD ? 12 : 6;
export function passwordPolicy(pw: string): string | null {
  if (!pw || pw.length < MIN_LEN) return `Password must be at least ${MIN_LEN} characters.`;
  if (COMMON_PW.has(pw.toLowerCase())) return "That password is too common — choose a stronger one.";
  if (IS_PROD && !(/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw)))
    return "Password must contain both letters and numbers.";
  return null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}
function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "vendor";
}

export function getStoredUser(username: string): StoredUser | null {
  return readAll()[(username || "").toLowerCase().trim()] || null;
}

export function verifyStored(username: string, password: string): Session | null {
  const u = getStoredUser(username);
  if (!u) return null;
  const candidate = hashPw(password, u.salt);
  // constant-time compare
  if (candidate.length !== u.hash.length || !crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(u.hash))) return null;
  return { username: u.username, role: "vendor", vendorId: u.vendorId, name: u.name };
}

export function createVendor(input: { email: string; password: string; profile: VendorProfile }): Promise<Session> {
  const username = input.email.toLowerCase().trim();
  if (!username || !isValidEmail(username)) throw new Error("invalid_email");
  const pwErr = passwordPolicy(input.password);
  if (pwErr) throw new Error("weak_password");
  // Serialize the read-modify-write so two concurrent registrations can't both
  // pass the existence check and clobber each other.
  return withLock("users", () => {
    const all = readAll();
    if (all[username]) throw new Error("exists");

    // unique vendorId from company slug
    const base = slug(input.profile.company);
    let vendorId = base;
    const taken = new Set([...Object.values(all).map((u) => u.vendorId), "apex"]);
    let i = 2;
    while (taken.has(vendorId)) vendorId = `${base}-${i++}`;

    const salt = crypto.randomBytes(16).toString("hex");
    const user: StoredUser = {
      username,
      name: input.profile.company || username,
      vendorId,
      salt,
      hash: hashPw(input.password, salt),
      status: "active",
      profile: input.profile,
      createdAt: new Date().toISOString(),
    };
    all[username] = user;
    writeAll(all);
    return { username, role: "vendor", vendorId, name: user.name } as Session;
  });
}

export function listVendors() {
  return Object.values(readAll()).map((u) => ({
    username: u.username,
    name: u.name,
    vendorId: u.vendorId,
    profile: u.profile,
    createdAt: u.createdAt,
  }));
}
export function getVendorProfile(vendorId: string): VendorProfile | null {
  return Object.values(readAll()).find((u) => u.vendorId === vendorId)?.profile ?? null;
}

// Merge fields into a vendor's profile (assessor onboarding: file refs, infra, etc.).
export function updateVendorProfile(vendorId: string, patch: Partial<VendorProfile>): Promise<boolean> {
  return withLock("users", () => {
    const all = readAll();
    const entry = Object.values(all).find((u) => u.vendorId === vendorId);
    if (!entry) return false;
    entry.profile = { ...entry.profile, ...patch };
    all[entry.username] = entry;
    writeAll(all);
    return true;
  });
}

// Assessor/root override of a vendor's inherent-risk tier (the self-declared
// value is advisory only). Serialized against concurrent writes.
export function setVendorTier(vendorId: string, tier: string): Promise<boolean> {
  return withLock("users", () => {
    const all = readAll();
    const entry = Object.values(all).find((u) => u.vendorId === vendorId);
    if (!entry) return false;
    entry.profile.tier = tier;
    entry.profile.tierSelfDeclared = false;
    all[entry.username] = entry;
    writeAll(all);
    return true;
  });
}

// ---- Invite-based onboarding ----
const INVITES = path.join(DIR, "invites.json");
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export interface Invite { token: string; company: string; email: string; createdBy: string; createdAt: string; used: boolean; expiresAt?: string; }
function readInvites(): Record<string, Invite> {
  try { return JSON.parse(fs.readFileSync(INVITES, "utf8")); } catch { return {}; }
}
function writeInvites(all: Record<string, Invite>) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(INVITES, JSON.stringify(all, null, 2));
}
function isExpired(inv: Invite): boolean {
  return !!inv.expiresAt && Date.parse(inv.expiresAt) < Date.now();
}
export function createInvite(input: { company: string; email: string; createdBy: string }): Promise<Invite> {
  // Higher-entropy token (24 bytes) and an expiry.
  const token = crypto.randomBytes(24).toString("hex");
  const inv: Invite = {
    token,
    company: input.company.trim(),
    email: input.email.trim().toLowerCase(),
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    used: false,
  };
  return withLock("invites", () => {
    const all = readInvites();
    all[token] = inv;
    writeInvites(all);
    return inv;
  });
}
export function getInvite(token: string): Invite | null {
  return readInvites()[token] || null;
}
// Atomically validate + mark used. Returns the invite on success, else a reason.
// Optionally enforces that the invite's email matches the registrant.
export function consumeInviteIfValid(token: string, email?: string): Promise<{ ok: true; invite: Invite } | { ok: false; reason: string }> {
  return withLock("invites", () => {
    const all = readInvites();
    const inv = all[token];
    if (!inv) return { ok: false as const, reason: "Invalid invite token." };
    if (inv.used) return { ok: false as const, reason: "This invite has already been used." };
    if (isExpired(inv)) return { ok: false as const, reason: "This invite has expired." };
    if (email && inv.email && inv.email !== email.trim().toLowerCase())
      return { ok: false as const, reason: "Email does not match the invite." };
    inv.used = true;
    writeInvites(all);
    return { ok: true as const, invite: inv };
  });
}
export function listInvites(): Invite[] {
  return Object.values(readInvites()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
