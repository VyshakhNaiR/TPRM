import fs from "fs";
import path from "path";

// File-backed persistence (JSON per vendor). Works instantly for the demo and is
// fine for small scale. PRODUCTION: replace this module with a Postgres/Drizzle
// implementation exporting the same functions — callers don't change.
const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const SUBM = path.join(DIR, "submissions");

export interface Evidence {
  id: string;
  filename: string;
  size: number;
  hash?: string; // SHA-256 -> shared extraction cache
  textChars?: number; // extracted text length (0 = nothing readable)
}
export interface Answer {
  response: string;
  applicable: boolean;
  justification?: string;
  evidence: Evidence[];
  updatedAt: string;
}
// Assessor finding sent back to the vendor for remediation (the "(New)" cycle).
export interface Review {
  verdict: string;
  risk: string;
  riskStatement: string;
  recommendations: string[];
  status: "open" | "resubmitted";
  reviewedAt: string;
}
export interface Submission {
  vendorId: string;
  status: "draft" | "submitted";
  submittedAt?: string;
  answers: Record<string, Answer>;
  reviews?: Record<string, Review>;
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
  fs.writeFileSync(fp(s.vendorId), JSON.stringify(s, null, 2));
}
function blankAnswer(): Answer {
  return { response: "", applicable: true, evidence: [], updatedAt: now() };
}
// If the vendor edits a control that has an OPEN finding, mark it resubmitted.
function touchReview(s: Submission, controlId: string) {
  if (s.reviews?.[controlId]?.status === "open") s.reviews[controlId].status = "resubmitted";
}
export function saveAnswer(vendorId: string, controlId: string, patch: Partial<Answer>): Submission {
  const s = getSubmission(vendorId);
  s.answers[controlId] = { ...(s.answers[controlId] ?? blankAnswer()), ...patch, updatedAt: now() };
  touchReview(s, controlId);
  s.updatedAt = now();
  write(s);
  return s;
}
export function addEvidence(vendorId: string, controlId: string, ev: Evidence): Submission {
  const s = getSubmission(vendorId);
  const a = s.answers[controlId] ?? blankAnswer();
  a.evidence = [...(a.evidence ?? []), ev];
  a.updatedAt = now();
  s.answers[controlId] = a;
  touchReview(s, controlId);
  s.updatedAt = now();
  write(s);
  return s;
}
export function setReview(vendorId: string, controlId: string, r: { verdict: string; risk: string; riskStatement: string; recommendations: string[] }): Submission {
  const s = getSubmission(vendorId);
  s.reviews ??= {};
  s.reviews[controlId] = { ...r, status: "open", reviewedAt: now() };
  s.updatedAt = now();
  write(s);
  return s;
}
export function submitAll(vendorId: string): Submission {
  const s = getSubmission(vendorId);
  s.status = "submitted";
  s.submittedAt = now();
  write(s);
  return s;
}
