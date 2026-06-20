// Control-gap -> threat exposure crosswalk. A Non-Compliant control means the
// threat(s) it normally mitigates are EXPOSED for that vendor. Deterministic
// (no AI) — turns abstract compliance gaps into executive-legible threats.
// Business-language labels with a recognized-framework hint (MITRE ATT&CK tactic).

export interface Threat {
  id: string;
  label: string;
  description: string;
  attack: string; // MITRE ATT&CK tactic hint
}

export const THREATS: Threat[] = [
  { id: "account-takeover", label: "Account Takeover", description: "Weak identity/MFA lets attackers seize privileged or customer accounts.", attack: "Credential Access (TA0006)" },
  { id: "data-exfiltration", label: "Data Exfiltration / Leakage", description: "Gaps in encryption, DLP or monitoring allow confidential data to leave undetected.", attack: "Exfiltration (TA0010)" },
  { id: "vuln-exploit", label: "Exploitation of Known Vulnerabilities", description: "Unpatched, unhardened or untested systems are exploited.", attack: "Initial Access / Execution (TA0001)" },
  { id: "ransomware", label: "Ransomware / Availability Loss", description: "Missing resilience, backups or malware defence enable disruption and extortion.", attack: "Impact (TA0040)" },
  { id: "supply-chain", label: "Supply-chain / 4th-party Compromise", description: "Uncontrolled sub-contractors or insecure software supply chain cascade risk.", attack: "Supply Chain Compromise (T1195)" },
  { id: "residency", label: "Regulatory / Data-Residency Exposure", description: "Data stored/processed out of jurisdiction or without audit access breaches MAS/RBI/SEBI.", attack: "Compliance Exposure" },
  { id: "governance", label: "Governance & Oversight Failure", description: "Weak due diligence, audit rights or accountability leave risk unmanaged.", attack: "Governance Gap" },
];

// Each control family maps to the threats its failure exposes.
const FAMILY_THREATS: Record<string, string[]> = {
  "Outsourcing Governance & Register": ["governance", "supply-chain"],
  "Due Diligence & Contracts": ["governance", "supply-chain"],
  "Sub-contracting & 4th Party": ["supply-chain"],
  "Data Security & Residency": ["data-exfiltration", "residency"],
  "Cryptography & Key Mgmt": ["data-exfiltration", "residency"],
  "Access Control & MFA": ["account-takeover"],
  "Vulnerability & Patch Mgmt": ["vuln-exploit"],
  "Network & Malware Defence": ["vuln-exploit", "ransomware"],
  "Logging, SOC & Incident": ["data-exfiltration", "vuln-exploit"],
  "Resilience & BCP": ["ransomware"],
  "Cyber Assessment (VAPT)": ["vuln-exploit"],
  "SDLC & Software Supply Chain": ["supply-chain", "vuln-exploit"],
  "Audit & Assurance": ["governance", "residency"],
  "Privacy": ["residency", "data-exfiltration"],
};

export function threatsForFamily(family: string): string[] {
  return FAMILY_THREATS[family] ?? [];
}
export function threatLabel(id: string): string {
  return THREATS.find((t) => t.id === id)?.label ?? id;
}
