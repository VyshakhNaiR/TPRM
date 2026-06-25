// Product changelog / release notes. Surfaced to Root and Assessor users on the
// /changelog page. Newest release first. Keep entries factual and user-facing.

export type ChangeType = "security" | "feature" | "fix" | "ai" | "ux" | "infra";
// Who a change is most relevant to. The /changelog page filters by the viewer's
// role: Assessors see assessor + all; Root sees root + all (developer/platform).
export type Audience = "assessor" | "root" | "all";

export interface ChangeItem {
  type: ChangeType;
  text: string;
  audience?: Audience; // default "all"
}
export interface Release {
  version: string;
  date: string; // ISO yyyy-mm-dd
  title: string;
  summary?: string;
  items: ChangeItem[];
}

export const CHANGE_LABEL: Record<ChangeType, string> = {
  security: "Security",
  feature: "Feature",
  fix: "Fix",
  ai: "AI",
  ux: "UX",
  infra: "Infra",
};

export const CHANGELOG: Release[] = [
  {
    version: "0.7.0",
    date: "2026-06-25",
    title: "Workflow overhaul",
    summary:
      "Assessor-led lifecycle, certification-as-evidence, and tighter validation — plus platform changes. This page is role-filtered: assessors see workflow changes, Root sees developer/platform changes.",
    items: [
      // --- Assessor-facing (functional workflow) ---
      { type: "feature", audience: "assessor", text: "Questionnaire modification — assessor-led vendor onboarding captures engagement type (due-diligence / existing), infrastructure (on-prem / cloud+CSP / hybrid), and applicable regulators (RBI/MAS/SEBI/None)." },
      { type: "feature", audience: "assessor", text: "Existing vendors: upload the agreement + last TPRM audit report at onboarding; prior Non-Compliant findings are parsed and spotlighted as a focus list." },
      { type: "feature", audience: "assessor", text: "Certification-as-evidence — vendors satisfy a requirement with an accredited cert (ISO 27001 / PCI DSS AOC / SOC 2 Type 2), uploaded once to a certification library and referenced per control; a cert only counts for its eligible domain (over-claims are flagged)." },
      { type: "ai", audience: "assessor", text: "Processing & adjudication — engine verdicts with a verified 'attestation' tier for certifications; assessor verdict override with a mandatory rationale (the human is the final authority)." },
      { type: "fix", audience: "assessor", text: "Validation — every requirement must be completed (evidence / certification / N-A-with-reason) before a vendor can submit; Not-Applicable always needs a reasoning statement." },
      { type: "ux", audience: "assessor", text: "Cleaner assessor console — a collapsible sidebar replaces the crowded top bar." },
      // --- Root-facing (developer / platform) ---
      { type: "infra", audience: "root", text: "Removed the SBOM analyzer feature; the Cost dashboard is now Root-only." },
      { type: "security", audience: "root", text: "Removed the 'act on behalf' capability — the vendor is the sole data-entry party; assessor writes are rejected (the assessor validates via override)." },
      { type: "infra", audience: "root", text: "New 'Customer' role (replaces Viewer) with a read-only holistic portfolio (PDF/Excel export)." },
      { type: "infra", audience: "root", text: "Custom-questionnaire upload/auto-map relocated into onboarding (gated by regulators = None)." },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-06-21",
    title: "Production hardening",
    summary:
      "Full remediation pass across security, reliability, the adjudication engine, and UX. The demo keeps its conveniences; production enforces every control via environment gating.",
    items: [
      { type: "security", text: "Session cookies are now signed with a required secret in production (the app refuses the public dev default), with timing-safe verification and an 8-hour expiry baked into the token." },
      { type: "security", text: "Seeded demo accounts are disabled in production by default; vendor self-onboarding now requires an assessor-issued, single-use, expiring invite (email-matched)." },
      { type: "security", text: "Adjudication is now hardened against prompt injection — vendor evidence is treated as untrusted data, and model verdicts are validated against the allowed set before use." },
      { type: "security", text: "Provider API keys are encrypted at rest (AES-256-GCM); added per-IP rate limiting on sign-in/onboarding, same-origin checks on changes, security headers (CSP/HSTS), upload type+content validation, and an SSRF guard on AI endpoints." },
      { type: "security", text: "Failed sign-in attempts are now recorded in the audit log; the log is write-serialized and preserves corrupt files instead of overwriting history." },
      { type: "fix", text: "Eliminated a data-loss race in the file-backed stores by serializing writes per vendor and writing atomically." },
      { type: "fix", text: "Fixed the portfolio/console risk dial colour scale (high posture now reads green, not red) and made evidence highlighting crash-proof." },
      { type: "ai", text: "Static engine now scores evidence on extracted document content (not just the filename or the vendor's own wording), closing a false-Compliant gap." },
      { type: "ai", text: "All AI providers run at temperature 0 with JSON mode and an automatic retry; long evidence is searched for the most relevant sections instead of being truncated at the top." },
      { type: "ai", text: "Accuracy panel now reports a confusion matrix with precision/recall and an explicit methodology note." },
      { type: "ux", text: "Every action now surfaces clear success/error feedback; failed loads show a Retry instead of an endless spinner." },
      { type: "ux", text: "Vendor questionnaire autosaves while you type with a visible save status; the evidence viewer is now a proper keyboard-accessible dialog and the console/admin views are mobile-friendly." },
      { type: "feature", text: "Assessors can now override a vendor's self-declared inherent-risk tier." },
      { type: "feature", text: "Added this changelog, visible to Root and Assessor users." },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-06-20",
    title: "Evidence, audit & onboarding",
    items: [
      { type: "feature", text: "Evidence viewer: read the extracted text of an uploaded file with the control's key terms highlighted." },
      { type: "feature", text: "Append-only audit log of every sign-in, adjudication, settings change, and onboarding event." },
      { type: "feature", text: "Invite-based vendor onboarding so assessors can bring vendors onto the platform." },
      { type: "ux", text: "Refreshed theme to match the Network Intelligence palette with an animated backdrop." },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-06-19",
    title: "Risk tiering, ratings & cost",
    items: [
      { type: "feature", text: "Inherent-risk tiering at intake (Critical/High/Medium/Low) driving assessment depth and cadence." },
      { type: "feature", text: "Consolidated risk rating with the approval-authority matrix (auto-approve through board escalation)." },
      { type: "feature", text: "Cost dashboard comparing the static, local, integrated, and hybrid processing engines." },
      { type: "feature", text: "SBOM analyzer mapping CycloneDX/SPDX components to SEBI CSCRF field coverage." },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06-18",
    title: "Portfolio & remediation loop",
    items: [
      { type: "feature", text: "Portfolio dashboard with threat mapping, framework coverage, and supplier-concentration views." },
      { type: "feature", text: "Remediation loop — return a finding to the vendor and track the resubmission cycle." },
      { type: "feature", text: "Per-control engine and confidence badges, vendor picker, accuracy evaluation, and PDF export." },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06-17",
    title: "Platform foundation",
    items: [
      { type: "feature", text: "Network Intelligence TPRM platform: role-based access (Root, Assessor, Vendor, Viewer)." },
      { type: "feature", text: "Four-category processing engine (static rules, local AI, integrated AI, hybrid) with deterministic content extraction." },
      { type: "feature", text: "Vendor onboarding and a 54-control questionnaire auto-mapped to MAS, RBI, and SEBI." },
    ],
  },
];
