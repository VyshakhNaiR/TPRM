export type Relationship = "equal" | "subset" | "superset" | "intersection";

export type Verdict = "Compliant" | "Non-Compliant" | "Not Applicable";
export type Risk = "High Risk" | "Medium Risk" | "Low Risk" | "None";

export interface Mapping {
  framework: "MAS" | "RBI" | "SEBI";
  clauseId: string;
  relationship: Relationship;
}

// Demo vendor response attached to a subset of controls for the live AI demo.
export interface Demo {
  vendorResponse: string;
  vendorEvidence: string;
  verdict: Verdict | string;
  risk: Risk | string;
  riskStatement: string;
  recommendations: string[];
}

export interface Control {
  id: string;
  sr: number;
  family: string;
  question: string;
  rfi: string;
  applicability: string;
  risk: Risk | string; // inherent risk weight
  mappings: Mapping[];
  demo?: Demo;
}

export interface Clause {
  id: string;
  title: string;
  text: string;
  source?: string;
}

export interface Framework {
  id: "MAS" | "RBI" | "SEBI";
  name: string;
  full: string;
  color: string;
  clauses: Clause[];
}

// Result returned by the AI adjudication endpoint
export interface AdjudicationItem {
  requirement: string;
  provided: boolean;
  substantiates: boolean;
  note: string;
}

export interface Adjudication {
  verdict: Verdict;
  risk: Risk;
  confidence: number; // 0..1
  riskStatement: string;
  recommendations: string[];
  evidenceChecks: AdjudicationItem[];
  citations: string[];
  source: "ai" | "static" | "fallback" | "override" | "attestation";
}
