// Deterministic SBOM parser (CycloneDX / SPDX JSON) → SEBI CSCRF field coverage.
// No AI. Maps components to the SEBI-required SBOM fields and reports coverage.

export interface SbomComponent {
  name: string;
  version: string;
  supplier: string;
  license: string;
  hash: string;
  identifier: string;
}
export interface SbomReport {
  format: "CycloneDX" | "SPDX" | "unknown";
  componentCount: number;
  components: SbomComponent[];
  coverage: { field: string; pct: number; note?: string }[];
  error?: string;
}

const SEBI_FIELDS = ["Component name", "Version", "Supplier", "License", "Cryptographic hash", "Unique identifier"];
const ATTESTED = ["Encryption details", "Update/patch frequency", "Known unknowns"]; // supplier-attested, not standard SBOM

export function parseSbom(text: string): SbomReport {
  let json: any;
  try { json = JSON.parse(text); } catch { return { format: "unknown", componentCount: 0, components: [], coverage: [], error: "Not valid JSON — provide a CycloneDX or SPDX JSON SBOM." }; }

  let components: SbomComponent[] = [];
  let format: SbomReport["format"] = "unknown";

  if (json.bomFormat === "CycloneDX" || Array.isArray(json.components)) {
    format = "CycloneDX";
    components = (json.components || []).map((c: any) => ({
      name: c.name || "", version: c.version || "",
      supplier: c.supplier?.name || c.publisher || c.author || "",
      license: (c.licenses || []).map((l: any) => l.license?.id || l.license?.name || l.expression).filter(Boolean).join(", "),
      hash: (c.hashes || []).map((h: any) => h.alg).join(", "),
      identifier: c.purl || c["bom-ref"] || "",
    }));
  } else if (json.spdxVersion || Array.isArray(json.packages)) {
    format = "SPDX";
    components = (json.packages || []).map((p: any) => ({
      name: p.name || "", version: p.versionInfo || "",
      supplier: (p.supplier || p.originator || "").replace(/^Organization:\s*/i, ""),
      license: p.licenseConcluded || p.licenseDeclared || "",
      hash: (p.checksums || []).map((c: any) => c.algorithm).join(", "),
      identifier: (p.externalRefs || []).find((r: any) => r.referenceType === "purl")?.referenceLocator || p.SPDXID || "",
    }));
  } else {
    return { format: "unknown", componentCount: 0, components: [], coverage: [], error: "Unrecognised SBOM — expected CycloneDX or SPDX JSON." };
  }

  const n = components.length || 1;
  const pct = (sel: (c: SbomComponent) => string) => Math.round((components.filter((c) => !!sel(c)).length / n) * 100);
  const coverage = [
    { field: "Component name", pct: pct((c) => c.name) },
    { field: "Version", pct: pct((c) => c.version) },
    { field: "Supplier", pct: pct((c) => c.supplier) },
    { field: "License", pct: pct((c) => c.license) },
    { field: "Cryptographic hash", pct: pct((c) => c.hash) },
    { field: "Unique identifier", pct: pct((c) => c.identifier) },
    ...ATTESTED.map((f) => ({ field: f, pct: 0, note: "supplier-attested (not in standard SBOM)" })),
  ];

  return { format, componentCount: components.length, components: components.slice(0, 200), coverage };
}
