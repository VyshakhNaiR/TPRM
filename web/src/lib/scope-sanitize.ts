import type { AssessmentScope, DataClassification, AccessLevel, Criticality, DataVolume, Connectivity } from "./users";

// Shared scope sanitiser — used by the save route (PUT /api/scope) and the
// AI-extract route (POST /api/scope/extract) so both coerce input identically.
const FRAMEWORKS = new Set(["RBI", "MAS", "SEBI", "None"]);
const HOSTING = new Set(["on_prem", "cloud", "hybrid"]);
const CLASSIFICATION = new Set(["public", "internal", "confidential", "regulated"]);
const ACCESS = new Set(["none", "read", "privileged"]);
const LEVEL = new Set(["low", "medium", "high"]);
const CONNECTIVITY = new Set(["none", "api", "vpn", "dedicated"]);
const oneOf = <T extends string>(set: Set<string>, v: unknown): T | undefined => (typeof v === "string" && set.has(v) ? (v as T) : undefined);

function str(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max);
}
function strList(v: unknown, max: number): string[] {
  return (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, 50);
}

// Coerce arbitrary input (client form OR AI output) into a well-formed scope.
export function sanitizeScope(raw: any): AssessmentScope {
  const fw = strList(raw?.frameworks, 20).filter((f) => FRAMEWORKS.has(f));
  return {
    name: str(raw?.name, 200),
    type: str(raw?.type, 100),
    periodStart: str(raw?.periodStart, 40),
    periodEnd: str(raw?.periodEnd, 40),
    services: (Array.isArray(raw?.services) ? raw.services : []).map((a: any) => ({ name: str(a?.name, 200), description: str(a?.description, 500) })).filter((a: any) => a.name).slice(0, 100),
    applications: (Array.isArray(raw?.applications) ? raw.applications : []).map((a: any) => ({ name: str(a?.name, 200), url: str(a?.url, 500), description: str(a?.description, 500) })).filter((a: any) => a.name).slice(0, 100),
    hostingModel: HOSTING.has(raw?.hostingModel) ? raw.hostingModel : undefined,
    cloudProvider: str(raw?.cloudProvider, 100),
    regions: strList(raw?.regions, 100),
    dataTypes: strList(raw?.dataTypes, 100),
    subcontractors: (Array.isArray(raw?.subcontractors) ? raw.subcontractors : []).map((a: any) => ({ name: str(a?.name, 200), service: str(a?.service, 200) })).filter((a: any) => a.name).slice(0, 100),
    dataClassification: oneOf<DataClassification>(CLASSIFICATION, raw?.dataClassification),
    accessLevel: oneOf<AccessLevel>(ACCESS, raw?.accessLevel),
    businessCriticality: oneOf<Criticality>(LEVEL, raw?.businessCriticality),
    dataVolume: oneOf<DataVolume>(LEVEL, raw?.dataVolume),
    connectivity: oneOf<Connectivity>(CONNECTIVITY, raw?.connectivity),
    crossBorderTransfer: raw?.crossBorderTransfer === true || raw?.crossBorderTransfer === "true",
    frameworks: fw.length ? fw : ["None"],
    outOfScope: str(raw?.outOfScope, 2000),
    status: raw?.status === "active" ? "active" : "draft",
    version: 1, // re-stamped by setAssessmentScope
  };
}
