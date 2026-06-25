import fs from "fs";
import path from "path";
import crypto from "crypto";
import { withLock } from "./lock";

// Contracts / Obligations / Compliances (certs) / Custom-compliance catalog.
// File-backed for the demo (gitignored), same pattern as the submission store.
// PRODUCTION: move to the DB; the function signatures stay the same.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const COMP = path.join(DIR, "compliance");
const F = {
  contracts: path.join(COMP, "contracts.json"),
  obligations: path.join(COMP, "obligations.json"),
  compliances: path.join(COMP, "compliances.json"),
  catalog: path.join(COMP, "catalog.json"),
};

function ensure() { fs.mkdirSync(COMP, { recursive: true }); }
function readMap<T>(file: string): Record<string, T[]> {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}
function writeJson(file: string, data: unknown) {
  ensure();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

// ---- Types ----
export interface ContractFile { id: string; filename: string; size: number }
export interface ClauseCheck { key: string; present: boolean | null; note?: string }
export interface Contract {
  id: string;
  vendorId: string;
  title: string;
  counterparty: string;
  startDate?: string;
  renewalDate?: string;
  expiryDate?: string;
  file?: ContractFile;
  clauses: ClauseCheck[];
  createdAt: string;
  createdBy: string;
}
export type ObligationStatus = "open" | "in_progress" | "done";
export type Recurrence = "none" | "monthly" | "quarterly" | "annual";
export interface Obligation {
  id: string;
  vendorId: string;
  title: string;
  description?: string;
  owner?: string;
  dueDate?: string;
  recurrence: Recurrence;
  source: "contract" | "regulation" | "finding" | "manual";
  status: ObligationStatus;
  createdAt: string;
}
export type ComplianceState = "valid" | "expiring" | "expired" | "in_progress" | "missing";
export interface Compliance {
  id: string;
  vendorId: string;
  framework: string; // catalog item name
  status: ComplianceState;
  issuedDate?: string;
  expiryDate?: string;
  file?: ContractFile;
  note?: string;
  createdAt: string;
}
export interface CatalogItem { id: string; name: string; description?: string; custom: boolean }

// ---- Mandatory contract clauses, mapped to the regulators (the QSA checklist) ----
export const CLAUSE_TEMPLATE: { key: string; label: string; frameworks: string[] }[] = [
  { key: "audit_rights", label: "Audit & inspection rights (incl. regulator access)", frameworks: ["MAS", "RBI", "SEBI"] },
  { key: "breach_notification", label: "Security-breach / incident notification SLA", frameworks: ["RBI", "SEBI", "MAS"] },
  { key: "data_residency", label: "Data residency / localisation", frameworks: ["RBI", "SEBI", "MAS"] },
  { key: "subcontracting", label: "Sub-contracting prior consent; provider remains liable", frameworks: ["MAS", "RBI", "SEBI"] },
  { key: "exit_termination", label: "Exit strategy, termination & data return/destruction", frameworks: ["MAS", "RBI"] },
  { key: "confidentiality", label: "Confidentiality & data protection", frameworks: ["MAS", "RBI", "SEBI"] },
  { key: "bcp_dr", label: "BCP/DR & recovery commitments (RTO/RPO)", frameworks: ["MAS", "SEBI"] },
  { key: "liability", label: "Liability, indemnity & insurance", frameworks: ["MAS", "RBI"] },
  { key: "governing_law", label: "Governing law & jurisdiction", frameworks: ["MAS", "RBI"] },
  { key: "regulator_step_in", label: "Regulator step-in / right to direct", frameworks: ["RBI", "MAS"] },
];

const DEFAULT_CATALOG: CatalogItem[] = [
  { id: "iso27001", name: "ISO/IEC 27001", description: "Information security management", custom: false },
  { id: "soc2", name: "SOC 2 Type II", description: "Trust services criteria", custom: false },
  { id: "pcidss", name: "PCI DSS", description: "Payment card data security", custom: false },
  { id: "iso22301", name: "ISO 22301", description: "Business continuity", custom: false },
  { id: "mastrm", name: "MAS TRM", description: "MAS Technology Risk Management", custom: false },
  { id: "rbicsf", name: "RBI Cyber Security Framework", description: "RBI CSF", custom: false },
  { id: "sebicscrf", name: "SEBI CSCRF", description: "SEBI Cyber Security & Cyber Resilience", custom: false },
  { id: "dpdp", name: "DPDP / GDPR", description: "Data protection", custom: false },
];

// ---- Derived status helpers (the reminder surface) ----
export function daysUntil(date?: string): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}
function certStatus(c: Compliance): ComplianceState {
  if (c.status === "in_progress" || c.status === "missing") return c.status;
  const d = daysUntil(c.expiryDate);
  if (d === null) return c.status || "valid";
  if (d < 0) return "expired";
  if (d <= 60) return "expiring";
  return "valid";
}

// ---- Contracts ----
function newClauses(): ClauseCheck[] { return CLAUSE_TEMPLATE.map((t) => ({ key: t.key, present: null })); }
export function listContracts(vendorId: string): Contract[] { return readMap<Contract>(F.contracts)[vendorId] || []; }
export function createContract(input: Omit<Contract, "id" | "clauses" | "createdAt"> & { clauses?: ClauseCheck[] }): Promise<Contract> {
  return withLock("comp:contracts", () => {
    const all = readMap<Contract>(F.contracts);
    const c: Contract = { ...input, id: id(), clauses: input.clauses?.length ? input.clauses : newClauses(), createdAt: now() };
    all[input.vendorId] = [...(all[input.vendorId] || []), c];
    writeJson(F.contracts, all);
    return c;
  });
}
export function updateContract(vendorId: string, contractId: string, patch: Partial<Contract>): Promise<Contract | null> {
  return withLock("comp:contracts", () => {
    const all = readMap<Contract>(F.contracts);
    const arr = all[vendorId] || [];
    const i = arr.findIndex((c) => c.id === contractId);
    if (i < 0) return null;
    arr[i] = { ...arr[i], ...patch, id: arr[i].id, vendorId };
    all[vendorId] = arr;
    writeJson(F.contracts, all);
    return arr[i];
  });
}
export function deleteContract(vendorId: string, contractId: string): Promise<boolean> {
  return withLock("comp:contracts", () => {
    const all = readMap<Contract>(F.contracts);
    const arr = all[vendorId] || [];
    const next = arr.filter((c) => c.id !== contractId);
    all[vendorId] = next;
    writeJson(F.contracts, all);
    return next.length !== arr.length;
  });
}

// ---- Obligations ----
export function listObligations(vendorId: string): Obligation[] { return readMap<Obligation>(F.obligations)[vendorId] || []; }
export function createObligation(input: Omit<Obligation, "id" | "createdAt">): Promise<Obligation> {
  return withLock("comp:obligations", () => {
    const all = readMap<Obligation>(F.obligations);
    const o: Obligation = { ...input, id: id(), createdAt: now() };
    all[input.vendorId] = [...(all[input.vendorId] || []), o];
    writeJson(F.obligations, all);
    return o;
  });
}
export function updateObligation(vendorId: string, oid: string, patch: Partial<Obligation>): Promise<Obligation | null> {
  return withLock("comp:obligations", () => {
    const all = readMap<Obligation>(F.obligations);
    const arr = all[vendorId] || [];
    const i = arr.findIndex((o) => o.id === oid);
    if (i < 0) return null;
    arr[i] = { ...arr[i], ...patch, id: arr[i].id, vendorId };
    all[vendorId] = arr;
    writeJson(F.obligations, all);
    return arr[i];
  });
}
export function deleteObligation(vendorId: string, oid: string): Promise<boolean> {
  return withLock("comp:obligations", () => {
    const all = readMap<Obligation>(F.obligations);
    const arr = all[vendorId] || [];
    const next = arr.filter((o) => o.id !== oid);
    all[vendorId] = next;
    writeJson(F.obligations, all);
    return next.length !== arr.length;
  });
}

// ---- Compliances (certs) ----
export function listCompliances(vendorId: string): Compliance[] {
  return (readMap<Compliance>(F.compliances)[vendorId] || []).map((c) => ({ ...c, status: certStatus(c) }));
}
export function createCompliance(input: Omit<Compliance, "id" | "createdAt">): Promise<Compliance> {
  return withLock("comp:compliances", () => {
    const all = readMap<Compliance>(F.compliances);
    const c: Compliance = { ...input, id: id(), createdAt: now() };
    all[input.vendorId] = [...(all[input.vendorId] || []), c];
    writeJson(F.compliances, all);
    return { ...c, status: certStatus(c) };
  });
}
export function updateCompliance(vendorId: string, cid: string, patch: Partial<Compliance>): Promise<Compliance | null> {
  return withLock("comp:compliances", () => {
    const all = readMap<Compliance>(F.compliances);
    const arr = all[vendorId] || [];
    const i = arr.findIndex((c) => c.id === cid);
    if (i < 0) return null;
    arr[i] = { ...arr[i], ...patch, id: arr[i].id, vendorId };
    all[vendorId] = arr;
    writeJson(F.compliances, all);
    return { ...arr[i], status: certStatus(arr[i]) };
  });
}
export function deleteCompliance(vendorId: string, cid: string): Promise<boolean> {
  return withLock("comp:compliances", () => {
    const all = readMap<Compliance>(F.compliances);
    const arr = all[vendorId] || [];
    const next = arr.filter((c) => c.id !== cid);
    all[vendorId] = next;
    writeJson(F.compliances, all);
    return next.length !== arr.length;
  });
}

// ---- Custom compliance catalog (org-wide list) ----
export function listCatalog(): CatalogItem[] {
  ensure();
  let custom: CatalogItem[] = [];
  try { custom = JSON.parse(fs.readFileSync(F.catalog, "utf8")); } catch { custom = []; }
  return [...DEFAULT_CATALOG, ...custom];
}
export function addCatalogItem(name: string, description?: string): Promise<CatalogItem> {
  return withLock("comp:catalog", () => {
    let custom: CatalogItem[] = [];
    try { custom = JSON.parse(fs.readFileSync(F.catalog, "utf8")); } catch { custom = []; }
    const item: CatalogItem = { id: id(), name: name.trim(), description: description?.trim(), custom: true };
    custom.push(item);
    writeJson(F.catalog, custom);
    return item;
  });
}
export function deleteCatalogItem(itemId: string): Promise<boolean> {
  return withLock("comp:catalog", () => {
    let custom: CatalogItem[] = [];
    try { custom = JSON.parse(fs.readFileSync(F.catalog, "utf8")); } catch { custom = []; }
    const next = custom.filter((c) => c.id !== itemId); // built-ins can't be deleted
    writeJson(F.catalog, next);
    return next.length !== custom.length;
  });
}

// ---- Reminder surface: everything due/expiring across a vendor ----
export interface ReminderItem { kind: "contract" | "obligation" | "compliance"; title: string; due?: string; days: number | null; severity: "overdue" | "soon" | "ok" }
export function upcomingReminders(vendorId: string): ReminderItem[] {
  const sev = (d: number | null): ReminderItem["severity"] => (d === null ? "ok" : d < 0 ? "overdue" : d <= 60 ? "soon" : "ok");
  const items: ReminderItem[] = [];
  for (const c of listContracts(vendorId)) {
    const d = daysUntil(c.renewalDate || c.expiryDate);
    if (d !== null) items.push({ kind: "contract", title: `${c.title} renewal`, due: c.renewalDate || c.expiryDate, days: d, severity: sev(d) });
  }
  for (const o of listObligations(vendorId)) {
    if (o.status !== "done" && o.dueDate) { const d = daysUntil(o.dueDate); items.push({ kind: "obligation", title: o.title, due: o.dueDate, days: d, severity: sev(d) }); }
  }
  for (const c of listCompliances(vendorId)) {
    if (c.expiryDate) { const d = daysUntil(c.expiryDate); items.push({ kind: "compliance", title: `${c.framework} expiry`, due: c.expiryDate, days: d, severity: sev(d) }); }
  }
  return items.filter((i) => i.severity !== "ok").sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
}
