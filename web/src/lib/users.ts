import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Session } from "./auth";
import { withLock } from "./lock";
import { IS_PROD } from "./config";
import { computeTier, type IRQ } from "./risk";

// Derive the inherent-risk questionnaire inputs from the assessment-scope
// parameters, so the scope drives the risk tier (null if not enough is set).
function scopeToIRQ(scope: AssessmentScope): IRQ | null {
  if (!scope.dataClassification && !scope.accessLevel && !scope.businessCriticality && !scope.dataVolume) return null;
  return {
    // IRQ has no "public" band — treat public data as the lowest sensitivity.
    dataSensitivity: scope.dataClassification === "public" ? "none" : (scope.dataClassification ?? "internal"),
    access: scope.accessLevel === "read" ? "limited" : (scope.accessLevel ?? "none"),
    criticality: scope.businessCriticality ?? "low",
    volume: scope.dataVolume ?? "low",
    frameworks: scope.frameworks.filter((f) => f !== "None"),
  };
}

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
  scopeDocFile?: UploadRef; // assessment-scope source document (used to auto-fill the scope)
  onboardedBy?: string; // assessor username who created the vendor
  assignedAssessor?: string; // assessor username this vendor is assigned to (Root assigns)
  // ---- Scope definition (Phase B / Phase 4 — assessor-defined) ----
  assessmentScope?: AssessmentScope;
  scopeChangeRequests?: ScopeChangeRequest[];
}

// Scope parameters that drive the inherent-risk tier + regulatory mapping.
export type DataClassification = "public" | "internal" | "confidential" | "regulated";
export type AccessLevel = "none" | "read" | "privileged";
export type Criticality = "low" | "medium" | "high";
export type DataVolume = "low" | "medium" | "high";
export type Connectivity = "none" | "api" | "vpn" | "dedicated";

// The assessment scope is OWNED BY THE ASSESSOR. Vendors view it read-only and
// must file a change request to alter it (versioned + audited).
export interface AssessmentScope {
  name?: string; // assessment name
  type?: string; // Onboarding / Annual / Re-assessment / Ad-hoc
  periodStart?: string; // ISO date
  periodEnd?: string; // ISO date
  services: { name: string; description?: string }[];
  applications: { name: string; url?: string; description?: string }[];
  hostingModel?: "on_prem" | "cloud" | "hybrid";
  cloudProvider?: string;
  regions: string[]; // data residency — where data is stored/processed
  dataTypes: string[];
  subcontractors: { name: string; service?: string }[]; // fourth parties
  // ---- Risk-mapping parameters (feed computeTier + framework applicability) ----
  dataClassification?: DataClassification;
  accessLevel?: AccessLevel; // vendor's access to the bank's systems/data
  businessCriticality?: Criticality;
  dataVolume?: DataVolume;
  connectivity?: Connectivity; // integration / network connection type
  crossBorderTransfer?: boolean; // data leaves the home jurisdiction
  frameworks: string[]; // drives the questionnaire (RBI / MAS / SEBI / None)
  outOfScope?: string;
  status: "draft" | "active";
  version: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ScopeChangeRequest {
  id: string;
  requestedBy: string; // vendor username
  justification: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export function emptyScope(frameworks: string[] = []): AssessmentScope {
  return {
    services: [], applications: [], regions: [], dataTypes: [], subcontractors: [],
    frameworks, status: "draft", version: 1,
  };
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
  contactRole?: string; // optional tag: "Primary SPOC", "Security", "Compliance", etc.
}

export interface VendorContact {
  username: string;
  name: string;
  contactRole?: string;
  createdAt: string;
  primary: boolean; // earliest-created account is the primary login
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

// One row PER VENDOR (deduped by vendorId). A vendor can have several login
// accounts/SPOCs — keep the earliest-created as the canonical record so the
// vendor appears once in every listing (portfolio, customer view, picker).
export function listVendors() {
  const byVendor = new Map<string, { username: string; name: string; vendorId: string; profile: VendorProfile; createdAt: string }>();
  for (const u of Object.values(readAll())) {
    const existing = byVendor.get(u.vendorId);
    if (!existing || u.createdAt < existing.createdAt) {
      byVendor.set(u.vendorId, { username: u.username, name: u.name, vendorId: u.vendorId, profile: u.profile, createdAt: u.createdAt });
    }
  }
  return Array.from(byVendor.values());
}
export function getVendorProfile(vendorId: string): VendorProfile | null {
  return Object.values(readAll()).find((u) => u.vendorId === vendorId)?.profile ?? null;
}

// All login accounts (SPOCs/contacts) for a vendor, oldest first. The earliest
// account is flagged as the primary login.
export function listVendorContacts(vendorId: string): VendorContact[] {
  const rows = Object.values(readAll())
    .filter((u) => u.vendorId === vendorId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return rows.map((u, i) => ({
    username: u.username,
    name: u.name,
    contactRole: u.contactRole,
    createdAt: u.createdAt,
    primary: i === 0,
  }));
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

// Assessor sets/replaces a vendor's assessment scope. Bumps the version, stamps
// who/when, and keeps profile.regulators in sync (frameworks drive the
// questionnaire via lib/scope). Returns the persisted scope, or null if no vendor.
export function setAssessmentScope(vendorId: string, scope: AssessmentScope, actor: string): Promise<AssessmentScope | null> {
  return withLock("users", () => {
    const all = readAll();
    const entry = Object.values(all).find((u) => u.vendorId === vendorId);
    if (!entry) return null;
    const prev = entry.profile.assessmentScope;
    const next: AssessmentScope = {
      ...scope,
      version: (prev?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    entry.profile.assessmentScope = next;
    // Keep the regulator-driven questionnaire selection consistent with scope.
    entry.profile.regulators = next.frameworks;
    // Scope parameters drive the inherent-risk tier (assessor-set => authoritative).
    const irq = scopeToIRQ(next);
    if (irq) {
      const { tier, score } = computeTier(irq);
      entry.profile.tier = tier;
      entry.profile.tierScore = score;
      entry.profile.tierSelfDeclared = false;
    }
    all[entry.username] = entry;
    writeAll(all);
    return next;
  });
}

// Vendor files a scope-change request (justification only — the assessor edits
// the actual scope on approval). Returns the created request, or null if no vendor.
export function addScopeChangeRequest(vendorId: string, requestedBy: string, justification: string): Promise<ScopeChangeRequest | null> {
  return withLock("users", () => {
    const all = readAll();
    const entry = Object.values(all).find((u) => u.vendorId === vendorId);
    if (!entry) return null;
    const req: ScopeChangeRequest = {
      id: crypto.randomBytes(8).toString("hex"),
      requestedBy,
      justification: justification.slice(0, 2000),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const list = entry.profile.scopeChangeRequests ?? [];
    entry.profile.scopeChangeRequests = [req, ...list].slice(0, 100);
    all[entry.username] = entry;
    writeAll(all);
    return req;
  });
}

// Assessor approves/rejects a pending scope-change request.
export function decideScopeChangeRequest(
  vendorId: string, requestId: string, decision: "approved" | "rejected", decidedBy: string, note?: string
): Promise<ScopeChangeRequest | null> {
  return withLock("users", () => {
    const all = readAll();
    const entry = Object.values(all).find((u) => u.vendorId === vendorId);
    if (!entry) return null;
    const list = entry.profile.scopeChangeRequests ?? [];
    const req = list.find((r) => r.id === requestId);
    if (!req || req.status !== "pending") return null;
    req.status = decision;
    req.decidedBy = decidedBy;
    req.decidedAt = new Date().toISOString();
    if (note) req.decisionNote = note.slice(0, 1000);
    all[entry.username] = entry;
    writeAll(all);
    return req;
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

// Root assigns a vendor to an assessor (or clears with "" ). Returns false if no vendor.
export function assignVendorToAssessor(vendorId: string, assessor: string): Promise<boolean> {
  return withLock("users", () => {
    const all = readAll();
    const entry = Object.values(all).find((u) => u.vendorId === vendorId);
    if (!entry) return false;
    entry.profile.assignedAssessor = assessor || undefined;
    all[entry.username] = entry;
    writeAll(all);
    return true;
  });
}

// Add an additional login account for an existing vendor (shared submission workspace).
export function addUserToVendor(input: { vendorId: string; email: string; password: string; name?: string; contactRole?: string }): Promise<Session> {
  return withLock("users", () => {
    const all = readAll();
    const existing = Object.values(all).find((u) => u.vendorId === input.vendorId);
    if (!existing) throw new Error("vendor_not_found");
    const username = (input.email || "").toLowerCase().trim();
    if (!username || !isValidEmail(username)) throw new Error("invalid_email");
    const pwErr = passwordPolicy(input.password);
    if (pwErr) throw new Error(pwErr);
    if (all[username]) throw new Error("exists");
    const salt = crypto.randomBytes(16).toString("hex");
    const user: StoredUser = {
      username,
      name: (input.name || "").trim() || existing.name,
      vendorId: input.vendorId,
      salt,
      hash: hashPw(input.password, salt),
      status: "active",
      profile: existing.profile,
      createdAt: new Date().toISOString(),
      contactRole: (input.contactRole || "").trim() || undefined,
    };
    all[username] = user;
    writeAll(all);
    return { username, role: "vendor" as const, vendorId: input.vendorId, name: user.name };
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
