import fs from "fs";
import path from "path";
import crypto from "crypto";
import { withLock } from "./lock";

// File-backed persistence (JSON per vendor). Works instantly for the demo and is
// fine for small scale. Writes are serialized per-vendor (see lib/lock) so
// concurrent requests don't lose data (last-write-wins). PRODUCTION: replace this
// module with a Postgres/Drizzle implementation exporting the same functions —
// callers don't change.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const SUBM = path.join(DIR, "submissions");

export interface Evidence {
  id: string;
  filename: string;
  size: number;
  hash?: string; // SHA-256 -> shared extraction cache
  textChars?: number; // extracted text length (0 = nothing readable)
}
// Who supplied an answer/evidence — kept for audit integrity so an
// assessor-entered ("on behalf") answer can never be mistaken for a vendor
// self-attestation.
export type AnswerSource = "vendor" | "assessor_onsite" | "assessor_remote";
// How the vendor chose to satisfy a requirement (Phase C):
//  - "evidence": upload evidence + comment (the original flow)
//  - "certification": an existing accredited cert covers it (cert type + mapping note + cert file)
//  - "not_applicable": out of scope (mandatory reason)
export type CoverageMode = "evidence" | "certification" | "not_applicable";
export type CertType = "iso27001" | "pci_aoc" | "soc2_type2";
export interface Answer {
  response: string;
  applicable: boolean;
  justification?: string;
  evidence: Evidence[];
  updatedAt: string;
  source?: AnswerSource; // default "vendor"
  enteredBy?: string; // username who entered it (assessor when on-behalf)
  // ---- Certification-as-evidence (Phase C) ----
  coverage?: CoverageMode;
  certType?: CertType;
  certMappingNote?: string; // how the cert covers this requirement
  // the uploaded certificate/attestation report is stored in `evidence` above
}
// Assessor finding sent back to the vendor for remediation (the "(New)" cycle).
export interface Review {
  verdict: string;
  risk: string;
  riskStatement: string;
  recommendations: string[];
  note?: string;
  status: "open" | "resubmitted";
  reviewedAt: string;
}
// Assessor override of the engine verdict — the human is the final authority.
export interface Override {
  verdict: string;
  risk: string;
  rationale: string; // mandatory — why the assessor overruled the engine
  by: string;
  at: string;
}
// Prior-audit findings for an existing vendor (Phase E) — re-check everything,
// but spotlight what failed last time. `confirmed` flips true once the assessor
// validates the parsed result.
export interface PriorFinding {
  verdict: string; // last audit's verdict for this control
  note?: string;
  confirmed?: boolean;
}
// Vendor-level certification library (Phase: upload once, reference per control).
export interface VendorCert {
  id: string;
  certType: CertType;
  filename: string;
  size: number;
  hash?: string;
  uploadedAt: string;
}
export interface Submission {
  vendorId: string;
  status: "draft" | "submitted";
  submittedAt?: string;
  answers: Record<string, Answer>;
  reviews?: Record<string, Review>;
  overrides?: Record<string, Override>;
  priorFindings?: Record<string, PriorFinding>;
  priorAuditAt?: string;
  certs?: VendorCert[];
  updatedAt: string;
}

function ensure() {
  fs.mkdirSync(SUBM, { recursive: true });
}
function fp(vendorId: string) {
  return path.join(SUBM, `${vendorId.replace(/[^\w.-]/g, "_")}.json`);
}
function now() {
  return new Date().toISOString();
}

export function getSubmission(vendorId: string): Submission {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(fp(vendorId), "utf8"));
  } catch {
    return { vendorId, status: "draft", answers: {}, updatedAt: now() };
  }
}
function write(s: Submission) {
  ensure();
  // Atomic-ish write: write to a temp file then rename, so a crash mid-write
  // can't leave a half-written (unparseable) submission file.
  const target = fp(s.vendorId);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, target);
}
function blankAnswer(): Answer {
  return { response: "", applicable: true, evidence: [], updatedAt: now() };
}
// If the vendor edits a control that has an OPEN finding, mark it resubmitted.
function touchReview(s: Submission, controlId: string) {
  if (s.reviews?.[controlId]?.status === "open") s.reviews[controlId].status = "resubmitted";
}

export function saveAnswer(vendorId: string, controlId: string, patch: Partial<Answer>): Promise<Submission> {
  return withLock(`subm:${vendorId}`, () => {
    const s = getSubmission(vendorId);
    s.answers[controlId] = { ...(s.answers[controlId] ?? blankAnswer()), ...patch, updatedAt: now() };
    touchReview(s, controlId);
    s.updatedAt = now();
    write(s);
    return s;
  });
}
export function addEvidence(vendorId: string, controlId: string, ev: Evidence): Promise<Submission> {
  return withLock(`subm:${vendorId}`, () => {
    const s = getSubmission(vendorId);
    const a = s.answers[controlId] ?? blankAnswer();
    a.evidence = [...(a.evidence ?? []), ev];
    a.updatedAt = now();
    s.answers[controlId] = a;
    touchReview(s, controlId);
    s.updatedAt = now();
    write(s);
    return s;
  });
}
export function setReview(vendorId: string, controlId: string, r: { verdict: string; risk: string; riskStatement: string; recommendations: string[]; note?: string }): Promise<Submission> {
  return withLock(`subm:${vendorId}`, () => {
    const s = getSubmission(vendorId);
    s.reviews ??= {};
    s.reviews[controlId] = { ...r, status: "open", reviewedAt: now() };
    s.updatedAt = now();
    write(s);
    return s;
  });
}
export function submitAll(vendorId: string): Promise<Submission> {
  return withLock(`subm:${vendorId}`, () => {
    const s = getSubmission(vendorId);
    s.status = "submitted";
    s.submittedAt = now();
    write(s);
    return s;
  });
}

// Assessor override of the engine verdict for a control. Authoritative — the
// adjudicate route returns this over any AI/static result when present.
export function setOverride(
  vendorId: string,
  controlId: string,
  o: { verdict: string; risk: string; rationale: string; by: string }
): Promise<Submission> {
  return withLock(`subm:${vendorId}`, () => {
    const s = getSubmission(vendorId);
    s.overrides ??= {};
    s.overrides[controlId] = { ...o, at: now() };
    s.updatedAt = now();
    write(s);
    return s;
  });
}
// Vendor certification library — upload a cert once, reference it on many controls.
export function addCert(vendorId: string, cert: Omit<VendorCert, "id" | "uploadedAt">): Promise<VendorCert> {
  return withLock(`subm:${vendorId}`, () => {
    const s = getSubmission(vendorId);
    s.certs ??= [];
    const c: VendorCert = { ...cert, id: crypto.randomUUID(), uploadedAt: now() };
    s.certs.push(c);
    s.updatedAt = now();
    write(s);
    return c;
  });
}
export function removeCert(vendorId: string, certId: string): Promise<Submission> {
  return withLock(`subm:${vendorId}`, () => {
    const s = getSubmission(vendorId);
    s.certs = (s.certs ?? []).filter((c) => c.id !== certId);
    s.updatedAt = now();
    write(s);
    return s;
  });
}

// Seed/confirm prior-audit findings for an existing vendor (Phase E).
export function setPriorFindings(
  vendorId: string,
  findings: Record<string, PriorFinding>,
  auditAt?: string
): Promise<Submission> {
  return withLock(`subm:${vendorId}`, () => {
    const s = getSubmission(vendorId);
    s.priorFindings = findings;
    if (auditAt) s.priorAuditAt = auditAt;
    s.updatedAt = now();
    write(s);
    return s;
  });
}

export function clearOverride(vendorId: string, controlId: string): Promise<Submission> {
  return withLock(`subm:${vendorId}`, () => {
    const s = getSubmission(vendorId);
    if (s.overrides) { delete s.overrides[controlId]; s.updatedAt = now(); write(s); }
    return s;
  });
}

// Authorization helper: confirm an extraction hash was actually uploaded as
// evidence in some submission before its extracted text is served. Prevents a
// hash-oracle that would let a caller pull arbitrary cached extractions by
// guessing/knowing content hashes. Returns the owning vendorId, or null.
export function evidenceHashOwner(hash: string): string | null {
  if (!hash) return null;
  ensure();
  let files: string[] = [];
  try {
    files = fs.readdirSync(SUBM).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }
  for (const f of files) {
    try {
      const s: Submission = JSON.parse(fs.readFileSync(path.join(SUBM, f), "utf8"));
      for (const a of Object.values(s.answers || {})) {
        if ((a.evidence || []).some((e) => e.hash === hash)) return s.vendorId;
      }
    } catch {
      /* skip unreadable file */
    }
  }
  return null;
}
