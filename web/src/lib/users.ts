import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Session } from "./auth";

// Dynamic, persisted vendor accounts (onboarding). File-backed for the demo.
// PRODUCTION: move to the DB; passwords already hashed (scrypt) here.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "users.json");

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

export function createVendor(input: { email: string; password: string; profile: VendorProfile }): Session {
  const username = input.email.toLowerCase().trim();
  if (!username || !input.password || input.password.length < 6) throw new Error("invalid_input");
  const all = readAll();
  if (all[username]) throw new Error("exists");

  // unique vendorId from company slug
  let base = slug(input.profile.company);
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
  return { username, role: "vendor", vendorId, name: user.name };
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

// ---- Invite-based onboarding ----
const INVITES = path.join(DIR, "invites.json");
export interface Invite { token: string; company: string; email: string; createdBy: string; createdAt: string; used: boolean; }
function readInvites(): Record<string, Invite> {
  try { return JSON.parse(fs.readFileSync(INVITES, "utf8")); } catch { return {}; }
}
function writeInvites(all: Record<string, Invite>) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(INVITES, JSON.stringify(all, null, 2));
}
export function createInvite(input: { company: string; email: string; createdBy: string }): Invite {
  const all = readInvites();
  const token = crypto.randomBytes(12).toString("hex");
  const inv: Invite = { token, company: input.company.trim(), email: input.email.trim().toLowerCase(), createdBy: input.createdBy, createdAt: new Date().toISOString(), used: false };
  all[token] = inv;
  writeInvites(all);
  return inv;
}
export function getInvite(token: string): Invite | null {
  return readInvites()[token] || null;
}
export function consumeInvite(token: string) {
  const all = readInvites();
  if (all[token]) { all[token].used = true; writeInvites(all); }
}
export function listInvites(): Invite[] {
  return Object.values(readInvites()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
