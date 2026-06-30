import { CONTROLS, FRAMEWORKS } from "@/data/seed";
import { THREATS, threatsForFamily } from "./threats";
import { listVendors } from "./users";
import { getSubmission } from "./store";
import { controlsForVendorId } from "./scope";
import { APPROVAL_MATRIX } from "./risk";

// Map a posture-derived rating to its residual-risk band + approval authority.
function approvalForRating(rating: string): { risk: string; approval: string } {
  const m = APPROVAL_MATRIX.find((x) => x.rating === rating);
  return m ? { risk: m.risk, approval: m.approval } : { risk: "—", approval: "—" };
}

// Deterministic 0..1 hash so synthetic verdicts are stable across renders.
function h(s: string): number {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  return (x >>> 0) / 4294967295;
}

type Verdict = "Compliant" | "Non-Compliant" | "Not Applicable";

// Demo book of vendors (synthetic but realistic distributions) so the portfolio
// view shows scale. Real onboarded vendors are appended from their submissions.
const DEMO_VENDORS = [
  { id: "apex", name: "Apex Cloud Services Pvt. Ltd.", tier: "Critical", rate: 0.42, cloud: "AWS", region: "India" },
  { id: "helios", name: "Helios Payments", tier: "Critical", rate: 0.74, cloud: "AWS", region: "India" },
  { id: "meridian", name: "Meridian Analytics", tier: "High", rate: 0.82, cloud: "Azure", region: "Singapore" },
  { id: "vertex", name: "Vertex KYC Services", tier: "High", rate: 0.61, cloud: "AWS", region: "India" },
  { id: "nimbus", name: "Nimbus DataOps", tier: "Medium", rate: 0.88, cloud: "GCP", region: "Singapore" },
  { id: "orbit", name: "Orbit Messaging", tier: "Medium", rate: 0.69, cloud: "Azure", region: "EU" },
  { id: "quanta", name: "Quanta Identity", tier: "High", rate: 0.54, cloud: "AWS", region: "US" },
  { id: "stellar", name: "Stellar Backup Co", tier: "Low", rate: 0.91, cloud: "GCP", region: "India" },
  { id: "zephyr", name: "Zephyr Print & Mail", tier: "Low", rate: 0.6, cloud: "On-prem", region: "India" },
];

function syntheticVerdict(vid: string, controlId: string, rate: number): Verdict {
  if (h(vid + controlId + "na") < 0.07) return "Not Applicable";
  return h(vid + controlId) < rate ? "Compliant" : "Non-Compliant";
}
function ratingFor(posture: number): string {
  if (posture >= 90) return "Good";
  if (posture >= 75) return "Satisfactory";
  if (posture >= 50) return "Needs Improvement";
  return "Unsatisfactory";
}

// Per-control verdict for a vendor (shared by the portfolio + customer views).
function verdictOf(v: any, c: (typeof CONTROLS)[number]): Verdict {
  if (v._real) {
    const a = v._real.answers?.[c.id];
    if (!a) return "Not Applicable"; // unanswered -> excluded from posture
    if (a.applicable === false) return "Not Applicable";
    // An assessor override is authoritative for the rollup.
    const ov = v._real.overrides?.[c.id];
    if (ov?.verdict) return ov.verdict as Verdict;
    return (a.evidence?.length ?? 0) > 0 && a.response?.trim() ? "Compliant" : "Non-Compliant";
  }
  return syntheticVerdict(v.id, c.id, v.rate);
}

export function buildPortfolio() {
  const vendors: any[] = DEMO_VENDORS.map((v) => ({ ...v }));

  // append real onboarded vendors (lightweight verdict from their submission)
  for (const ov of listVendors()) {
    const sub = getSubmission(ov.vendorId);
    vendors.push({
      id: ov.vendorId,
      name: ov.name,
      tier: ov.profile.tier || "Unrated",
      rate: 0.7, // unused for real vendors; verdicts derived from answers below
      cloud: "—",
      region: ov.profile.country || "—",
      _real: sub, // constructed in one shot (no post-push mutation)
    });
  }

  // per-vendor rollup + accumulate threats/domains/frameworks/concentration
  const threatCount: Record<string, { vendors: Set<string>; controls: number }> = {};
  THREATS.forEach((t) => (threatCount[t.id] = { vendors: new Set(), controls: 0 }));
  const domainAgg: Record<string, { compliant: number; nc: number }> = {};
  const fwCompliant: Record<string, number> = { MAS: 0, RBI: 0, SEBI: 0 };
  const fwTotal: Record<string, number> = { MAS: 0, RBI: 0, SEBI: 0 };

  const vendorRows = vendors.map((v) => {
    let compliant = 0, nc = 0, na = 0;
    const set = controlsForVendorId(v.id); // baseline vs standard per vendor
    const isStandard = set === CONTROLS; // framework coverage only applies to regulated vendors
    const compliantClauses: Record<string, Set<string>> = { MAS: new Set(), RBI: new Set(), SEBI: new Set() };
    for (const c of set) {
      const verdict = verdictOf(v, c);
      domainAgg[c.family] ??= { compliant: 0, nc: 0 };
      if (verdict === "Compliant") {
        compliant++; domainAgg[c.family].compliant++;
        for (const m of c.mappings) compliantClauses[m.framework].add(m.clauseId);
      } else if (verdict === "Non-Compliant") {
        nc++; domainAgg[c.family].nc++;
        for (const t of threatsForFamily(c.family)) { threatCount[t].vendors.add(v.id); threatCount[t].controls++; }
      } else na++;
    }
    if (isStandard) for (const f of FRAMEWORKS) { fwTotal[f.id] += f.clauses.length; fwCompliant[f.id] += compliantClauses[f.id].size; }
    const applicable = compliant + nc;
    const posture = applicable ? Math.round((compliant / applicable) * 100) : 0;
    return { id: v.id, name: v.name, tier: v.tier, region: v.region, cloud: v.cloud, compliant, nc, na, posture, rating: ratingFor(posture) };
  });

  const totalVendors = vendorRows.length;
  const threats = THREATS.map((t) => ({
    id: t.id, label: t.label, description: t.description, attack: t.attack,
    exposedVendors: threatCount[t.id].vendors.size,
    controls: threatCount[t.id].controls,
    severity: threatCount[t.id].vendors.size / Math.max(1, totalVendors),
  })).sort((a, b) => b.exposedVendors - a.exposedVendors);

  const domains = Object.entries(domainAgg).map(([family, d]) => ({
    family, compliant: d.compliant, nc: d.nc,
    pct: d.compliant + d.nc ? Math.round((d.compliant / (d.compliant + d.nc)) * 100) : 0,
  })).sort((a, b) => a.pct - b.pct);

  const frameworks = FRAMEWORKS.map((f) => ({
    id: f.id, name: f.name,
    covered: fwCompliant[f.id], total: fwTotal[f.id],
    pct: fwTotal[f.id] ? Math.round((fwCompliant[f.id] / fwTotal[f.id]) * 100) : 0,
  }));

  // concentration: shared cloud / region dependencies
  const byCloud: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  for (const v of vendorRows) { byCloud[v.cloud] = (byCloud[v.cloud] || 0) + 1; byRegion[v.region] = (byRegion[v.region] || 0) + 1; }
  const concentration = {
    cloud: Object.entries(byCloud).map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count),
    region: Object.entries(byRegion).map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count),
  };

  const totals = {
    vendors: totalVendors,
    critical: vendorRows.filter((v) => v.tier === "Critical").length,
    unsatisfactory: vendorRows.filter((v) => v.rating === "Unsatisfactory").length,
    avgPosture: Math.round(vendorRows.reduce((s, v) => s + v.posture, 0) / Math.max(1, totalVendors)),
  };

  return { vendorRows, threats, domains, frameworks, concentration, totals };
}

// ---------- Customer holistic view ----------
// Reassessment cadence by inherent-risk tier → drives "Next due" (decision #6).
const CADENCE_MONTHS: Record<string, number> = { Critical: 12, High: 12, Medium: 24, Low: 36, Unrated: 12 };

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}
// Stable synthetic initiation date for demo vendors (6–24 months ago).
function synthInitiated(id: string): string {
  const months = 6 + Math.floor(h(id + "init") * 18);
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setDate(1 + Math.floor(h(id + "day") * 27));
  return d.toISOString();
}

function vendorObjs(): any[] {
  const objs: any[] = DEMO_VENDORS.map((v) => ({ ...v, initiatedAt: synthInitiated(v.id) }));
  for (const ov of listVendors()) {
    objs.push({
      id: ov.vendorId,
      name: ov.name,
      tier: ov.profile.tier || "Unrated",
      rate: 0.7,
      cloud: "—",
      region: ov.profile.country || "—",
      regulators: (ov.profile as any).regulators,
      _real: getSubmission(ov.vendorId),
      initiatedAt: ov.createdAt || synthInitiated(ov.vendorId),
    });
  }
  return objs;
}

export interface CustomerRow {
  vendorId: string;
  name: string;
  tier: string; // criticality
  posture: number; // % compliant of applicable
  rating: string; // compliance status (Good → Unsatisfactory)
  compliant: number;
  nc: number;
  na: number;
  total: number;
  regulators: string[];
  initiatedAt: string;
  nextDueAt: string;
  overdue: boolean;
}

function rollup(v: any) {
  let compliant = 0, nc = 0, na = 0;
  const set = controlsForVendorId(v.id); // hygiene vendors roll up over the baseline set
  for (const c of set) {
    const verdict = verdictOf(v, c);
    if (verdict === "Compliant") compliant++;
    else if (verdict === "Non-Compliant") nc++;
    else na++;
  }
  const applicable = compliant + nc;
  const posture = applicable ? Math.round((compliant / applicable) * 100) : 0;
  return { compliant, nc, na, posture, total: set.length };
}

export function customerList(): CustomerRow[] {
  const now = Date.now();
  return vendorObjs().map((v) => {
    const { compliant, nc, na, posture, total } = rollup(v);
    const nextDueAt = addMonths(v.initiatedAt, CADENCE_MONTHS[v.tier] ?? 12);
    return {
      vendorId: v.id,
      name: v.name,
      tier: v.tier,
      posture,
      rating: ratingFor(posture),
      compliant, nc, na,
      total,
      regulators: Array.isArray(v.regulators) ? v.regulators : [],
      initiatedAt: v.initiatedAt,
      nextDueAt,
      overdue: Date.parse(nextDueAt) < now,
    };
  });
}

export interface RequirementDetail {
  id: string;
  family: string;
  question: string;
  verdict: Verdict;
  frameworks: string[];
  // Enriched fields for the per-vendor report (empty for synthetic demo vendors).
  response: string;
  coverage?: string;
  evidence: string[];
  override?: { verdict: string; risk?: string; rationale: string; by?: string };
}
export interface VendorDetailPayload {
  vendor: CustomerRow | null;
  controls: RequirementDetail[];
  rating: { rating: string; risk: string; approval: string };
}
export function vendorRequirementDetail(vendorId: string): VendorDetailPayload {
  const v = vendorObjs().find((x) => x.id === vendorId);
  if (!v) return { vendor: null, controls: [], rating: { rating: "—", risk: "—", approval: "—" } };
  const row = customerList().find((r) => r.vendorId === vendorId) ?? null;
  const real = v._real;
  const controls: RequirementDetail[] = controlsForVendorId(vendorId).map((c) => {
    const a = real?.answers?.[c.id];
    const ov = real?.overrides?.[c.id];
    return {
      id: c.id,
      family: c.family,
      question: c.question,
      verdict: verdictOf(v, c),
      frameworks: Array.from(new Set(c.mappings.map((m) => m.framework))),
      response: a?.response || (a?.applicable === false ? "Not Applicable" : ""),
      coverage: a?.coverage,
      evidence: (a?.evidence ?? []).map((e: any) => e.filename),
      override: ov?.verdict ? { verdict: ov.verdict, risk: ov.risk, rationale: ov.rationale, by: ov.by } : undefined,
    };
  });
  const ratingStr = row?.rating ?? "—";
  const { risk, approval } = approvalForRating(ratingStr);
  return { vendor: row, controls, rating: { rating: ratingStr, risk, approval } };
}
