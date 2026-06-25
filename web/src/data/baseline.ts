import type { Control } from "./types";

// Basic Security Hygiene questionnaire — a predefined baseline used when a vendor
// has NO applicable regulator (regulators = None). Same shape as the regulatory
// controls so adjudication / completion / rollup all work, but with no MAS/RBI/
// SEBI clause mappings (it's a baseline, not a regulatory crosswalk).
export const BASELINE_FAMILY = "Basic Security Hygiene";

export const BASELINE_CONTROLS: Control[] = [
  { id: "HYG-01", sr: 1, family: BASELINE_FAMILY, question: "Is multi-factor authentication (MFA) enforced for all administrative, remote, and privileged access?", rfi: "MFA/access policy and a screenshot or config showing MFA enforced on admin/remote access.", applicability: "always", risk: "High", mappings: [] },
  { id: "HYG-02", sr: 2, family: BASELINE_FAMILY, question: "Is sensitive data encrypted in transit (TLS 1.2+) and at rest (AES-256 or equivalent)?", rfi: "Encryption standard/policy and evidence of TLS config and at-rest encryption.", applicability: "always", risk: "High", mappings: [] },
  { id: "HYG-03", sr: 3, family: BASELINE_FAMILY, question: "Do you operate least-privilege, role-based access control with periodic access reviews and prompt deprovisioning of leavers?", rfi: "Access-control policy, a sample access review, and the joiner/mover/leaver process.", applicability: "always", risk: "High", mappings: [] },
  { id: "HYG-04", sr: 4, family: BASELINE_FAMILY, question: "Do you have a patch- and vulnerability-management process with defined remediation timelines for critical/high issues?", rfi: "Patch/vulnerability policy and a recent vulnerability scan or patch report.", applicability: "always", risk: "High", mappings: [] },
  { id: "HYG-05", sr: 5, family: BASELINE_FAMILY, question: "Is endpoint and server anti-malware/EDR deployed, centrally managed, and kept up to date?", rfi: "Anti-malware/EDR coverage report or console screenshot showing protection status.", applicability: "always", risk: "Medium", mappings: [] },
  { id: "HYG-06", sr: 6, family: BASELINE_FAMILY, question: "Are backups taken regularly, stored securely (and off-site/immutable), and is restoration tested?", rfi: "Backup policy/schedule and evidence of a recent successful restore test.", applicability: "always", risk: "High", mappings: [] },
  { id: "HYG-07", sr: 7, family: BASELINE_FAMILY, question: "Are security logs centrally collected, retained, and monitored for suspicious activity?", rfi: "Logging/monitoring policy, retention period, and a sample of monitored events/alerts.", applicability: "always", risk: "Medium", mappings: [] },
  { id: "HYG-08", sr: 8, family: BASELINE_FAMILY, question: "Do you have a documented, tested incident-response plan with defined notification timelines to customers?", rfi: "Incident-response plan and evidence of the last test/tabletop exercise.", applicability: "always", risk: "High", mappings: [] },
  { id: "HYG-09", sr: 9, family: BASELINE_FAMILY, question: "Do staff complete security-awareness training (including phishing) at least annually?", rfi: "Training policy and completion records/metrics for the last cycle.", applicability: "always", risk: "Medium", mappings: [] },
  { id: "HYG-10", sr: 10, family: BASELINE_FAMILY, question: "Is the network protected by firewalls/segmentation, with inbound/outbound traffic controlled?", rfi: "Network diagram and firewall ruleset summary or segmentation policy.", applicability: "always", risk: "Medium", mappings: [] },
  { id: "HYG-11", sr: 11, family: BASELINE_FAMILY, question: "Are systems built to hardened, secure-configuration baselines (with default credentials removed)?", rfi: "Hardening/secure-config standard and evidence of a baseline applied to a system.", applicability: "always", risk: "Medium", mappings: [] },
  { id: "HYG-12", sr: 12, family: BASELINE_FAMILY, question: "Do you maintain an inventory of assets and the data you hold on our behalf?", rfi: "Asset/data inventory or register (sample/extract).", applicability: "always", risk: "Low", mappings: [] },
  { id: "HYG-13", sr: 13, family: BASELINE_FAMILY, question: "Is data securely disposed of / returned at end of life or end of contract?", rfi: "Data-retention & secure-disposal policy and a sample certificate of destruction.", applicability: "always", risk: "Low", mappings: [] },
  { id: "HYG-14", sr: 14, family: BASELINE_FAMILY, question: "Do you assess and manage the security of your own sub-processors/suppliers who touch our data?", rfi: "Sub-processor list and your supplier security-assessment process.", applicability: "always", risk: "Medium", mappings: [] },
  { id: "HYG-15", sr: 15, family: BASELINE_FAMILY, question: "Do you carry recognised security certification or independent testing (e.g. ISO 27001, SOC 2, annual VAPT)?", rfi: "Current certification/attestation or the latest penetration-test summary.", applicability: "always", risk: "Medium", mappings: [] },
];
