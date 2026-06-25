import type { CertType } from "./store";

// Which control DOMAINS each accredited certification can plausibly cover. Used
// to verify a vendor's "this cert covers the requirement" claim — a cert can only
// satisfy controls in its eligible domains (an ISO cert can't cover a PCI-only
// card-data control, etc.). Matching is keyword-based against the control family
// so it's robust to exact family naming.

export const CERT_LABEL: Record<CertType, string> = {
  iso27001: "ISO/IEC 27001 Certification",
  pci_aoc: "PCI DSS AOC",
  soc2_type2: "SOC 2 Type 2 Attestation",
};

// Keyword sets per cert. A control family is eligible if it contains any keyword.
const ELIGIBLE: Record<CertType, string[]> = {
  // ISO 27001 = broad ISMS; covers the security domains but NOT purely
  // contractual / due-diligence / 4th-party items.
  iso27001: [
    "access", "mfa", "crypto", "key", "network", "malware", "vuln", "patch",
    "sdlc", "software", "supply", "logging", "soc", "incident", "resilience",
    "bcp", "audit", "assurance", "vapt", "assessment", "data security", "privacy",
    "governance",
  ],
  // SOC 2 Type 2 = Trust Services Criteria (Security/Availability/Confidentiality/
  // Processing Integrity/Privacy).
  soc2_type2: [
    "access", "mfa", "network", "malware", "logging", "soc", "incident",
    "data security", "resilience", "bcp", "privacy", "vuln", "patch", "sdlc",
    "software", "crypto", "key", "vapt", "assessment", "audit", "assurance",
  ],
  // PCI DSS AOC = card-data security (12 requirements); narrower, infra/control-centric.
  pci_aoc: [
    "access", "mfa", "network", "malware", "crypto", "key", "vuln", "patch",
    "logging", "soc", "incident", "sdlc", "software", "data security",
  ],
};

export function certCoversFamily(certType: CertType, family: string): boolean {
  const f = (family || "").toLowerCase();
  return (ELIGIBLE[certType] || []).some((k) => f.includes(k));
}
