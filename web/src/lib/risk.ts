// Consolidated risk rating + approval matrix (from the sample's Risk Summary
// Dashboard) and inherent-risk tiering. Pure functions, no AI.

export interface RatingResult {
  rating: string;
  risk: string;
  approval: string;
}

// Highest residual risk among non-compliant controls drives the consolidated
// rating and the approval authority required.
export function consolidatedRating(risks: string[]): RatingResult {
  const has = (level: string) => risks.some((r) => (r || "").toLowerCase().startsWith(level));
  if (has("high")) return { rating: "Unsatisfactory", risk: "High Risk", approval: "CBO & CRO (Board escalation)" };
  if (has("medium")) return { rating: "Needs Improvement", risk: "Medium Risk", approval: "CBO & CRO" };
  if (has("low")) return { rating: "Satisfactory", risk: "Low Risk", approval: "Digital Business Head & Digital Policy Head (CRO concurrence)" };
  return { rating: "Good", risk: "None", approval: "Auto-approve — no material findings" };
}

export const APPROVAL_MATRIX = [
  { rating: "Good", risk: "Compliant", approval: "Auto-approve" },
  { rating: "Satisfactory", risk: "Low Risk", approval: "Digital Business Head & Digital Policy Head (CRO concurrence)" },
  { rating: "Needs Improvement", risk: "Medium Risk", approval: "CBO & CRO" },
  { rating: "Unsatisfactory", risk: "High Risk", approval: "CBO & CRO (Board escalation)" },
];

// ---- Inherent-risk tiering (intake) ----
export interface IRQ {
  dataSensitivity: "none" | "internal" | "confidential" | "regulated";
  access: "none" | "limited" | "privileged";
  criticality: "low" | "medium" | "high";
  frameworks: string[]; // MAS / RBI / SEBI in scope
  volume: "low" | "medium" | "high";
}
export type Tier = "Critical" | "High" | "Medium" | "Low";

export function computeTier(irq: IRQ): { tier: Tier; score: number } {
  const d = { none: 0, internal: 2, confidential: 3, regulated: 4 }[irq.dataSensitivity] ?? 0;
  const a = { none: 0, limited: 2, privileged: 3 }[irq.access] ?? 0;
  const c = { low: 1, medium: 2, high: 3 }[irq.criticality] ?? 1;
  const v = { low: 0, medium: 1, high: 2 }[irq.volume] ?? 0;
  const f = Math.min(3, (irq.frameworks || []).length);
  const score = d + a + c + v + f; // max 15
  const tier: Tier = score >= 11 ? "Critical" : score >= 8 ? "High" : score >= 4 ? "Medium" : "Low";
  return { tier, score };
}

export function tierPolicy(tier: Tier): { depth: string; cadence: string } {
  switch (tier) {
    case "Critical": return { depth: "Full 54-control assessment", cadence: "Annual deep + quarterly review + continuous monitoring" };
    case "High": return { depth: "Full assessment", cadence: "Annual" };
    case "Medium": return { depth: "Core control subset", cadence: "Biennial + event-driven" };
    default: return { depth: "Lite questionnaire", cadence: "Event-driven only" };
  }
}
