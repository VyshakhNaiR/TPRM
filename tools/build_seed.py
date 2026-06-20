#!/usr/bin/env python3
"""Generate web/src/data/seed.ts from the saved MAS/RBI/SEBI clause catalogs
plus a unified, coverage-complete control library. Verifies every clause is
covered by >=1 control (no orphans). Re-runnable, no network, no agents."""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "web", "src", "data", "sources")
OUT = os.path.join(ROOT, "web", "src", "data", "seed.ts")

frameworks = {}
for fw in ("mas", "rbi", "sebi"):
    frameworks[fw] = json.load(open(os.path.join(SRC, f"{fw}.json")))

FW_META = {
    "MAS": ("MAS", "Monetary Authority of Singapore", "#e11d48"),
    "RBI": ("RBI", "Reserve Bank of India", "#f59e0b"),
    "SEBI": ("SEBI CSCRF", "SEBI Cyber Security & Cyber Resilience Framework", "#6366f1"),
}

def fw_of(clause_id):
    return clause_id.split("-")[0]

# ---- Unified control library (each question authored once, mapped across frameworks) ----
# c(id, family, question, rfi, applicability, risk, {clauseId: relationship}, demo=None)
C = []
def c(id, family, q, rfi, app, risk, maps, demo=None):
    C.append(dict(id=id, family=family, question=q, rfi=rfi, applicability=app,
                  risk=risk, maps=maps, demo=demo))

# Demo responses (faithful to the NIPL/SMICC sample) attached to matching controls
D = {
 "residency": dict(resp="APAC", ev="", verdict="Non-Compliant", risk="Medium Risk",
   stmt="Vendor response 'APAC' does not confirm India-only storage/processing or statutory compliance; no evidence provided.",
   recs=["Provide a signed India data-residency declaration for all data and artifacts.","Provide storage location details (data-centre location, on-prem/cloud/SaaS, backup location).","Provide evidence dated within the last 12 months."]),
 "change": dict(resp="Yes", ev="", verdict="Non-Compliant", risk="Low Risk",
   stmt="Vendor stated 'Yes' only; no change-management policy or sample closed change record was provided.",
   recs=["Provide approved change-management policy.","Provide a sanitized sample closed change ticket with approver, testing and rollback.","Include closure status."]),
 "dlp": dict(resp="Yes, we have Defender Plan 1 in place.", ev="", verdict="Non-Compliant", risk="Medium Risk",
   stmt="Defender Plan 1 asserted but no DLP policy, configured rules, or sample DLP logs were provided.",
   recs=["Provide approved DLP policy covering email, endpoint, cloud and removable media.","Provide list/screenshot of configured DLP rules.","Provide a sanitized DLP alert/log sample for the last 7 days."]),
 "soc": dict(resp="1. IBM QRadar", ev="NIPL_Security Incident Response_Policy.pdf", verdict="Non-Compliant", risk="Medium Risk",
   stmt="QRadar named and an incident-response policy provided, but no logging policy, log-source list, retention, QRadar configuration, activity logs or review evidence.",
   recs=["Provide a logging & monitoring policy (sources, retention, backup, review frequency).","Provide a sanitized QRadar configuration screenshot for relevant systems.","Provide sample activity/security logs and latest management review (last 6 months)."]),
 "malware": dict(resp="Cortex XDR is implemented. Check evidence file.", ev="Screenshot of Status from Cortex XDR.png", verdict="Compliant", risk="None",
   stmt="Cortex XDR screenshot shows agent v9.1.0 with Anti-Exploit and Anti-Malware enabled, connected, last check-in 28-05-2026 — accepted as endpoint malware protection.",
   recs=[]),
 "crypto": dict(resp="BitLocker in place.", ev="", verdict="Non-Compliant", risk="Medium Risk",
   stmt="BitLocker asserted; no encryption/key-management policy or evidence for data at rest/in transit was provided.",
   recs=["Provide an encryption & key-management policy (at rest, in transit, endpoints, media, backups).","Provide full-disk/file encryption evidence for endpoints/storage holding our data.","Describe the secure data-transfer method and key/password ownership."]),
 "access": dict(resp="No personal/BYOD devices are used; only managed corporate endpoints with least-privilege access.", ev="", verdict="Compliant", risk="None",
   stmt="BYOD prohibition confirmed and managed-endpoint, least-privilege access asserted; accepted as a management declaration for this engagement.",
   recs=[]),
 "cloud": dict(resp="", ev="", verdict="Non-Compliant", risk="Medium Risk",
   stmt="No response or evidence provided regarding cloud hosting of business-critical applications handling our data.",
   recs=["Confirm the cloud hosting model and CSP.","Provide CSP empanelment/certification and data-region configuration.","Confirm market-critical data resides in the required jurisdiction."]),
 "mfa": dict(resp="MFA is enabled for MS products.", ev="", verdict="Non-Compliant", risk="Medium Risk",
   stmt="MFA stated for Microsoft products only; no evidence that MFA covers all administrative/privileged and internet-facing access to systems holding our data.",
   recs=["Provide MFA policy and enforcement configuration across all admin/privileged and internet-facing access.","List MFA methods supported.","Provide coverage evidence beyond Microsoft products."]),
 "bcp": dict(resp="", ev="", verdict="Non-Compliant", risk="Medium Risk",
   stmt="No BCP/DR documentation, RTO/RPO targets or test evidence provided.",
   recs=["Provide a BCP/DR plan with RTO/RPO.","Provide latest DR test results.","Confirm coverage of sub-contractor dependencies."]),
}

F_GOV="Outsourcing Governance & Register"; F_DD="Due Diligence & Contracts"; F_SUB="Sub-contracting & 4th Party"
F_DATA="Data Security & Residency"; F_CRY="Cryptography & Key Mgmt"; F_AC="Access Control & MFA"
F_VULN="Vulnerability & Patch Mgmt"; F_NET="Network & Malware Defence"; F_LOG="Logging, SOC & Incident"
F_BCP="Resilience & BCP"; F_VAPT="Cyber Assessment (VAPT)"; F_SDLC="SDLC & Software Supply Chain"
F_AUD="Audit & Assurance"; F_PRIV="Privacy"

c("NI-GOV-01",F_GOV,"Can you provide the service description, legal entities, processing locations and sub-contractors needed for us to assess materiality and maintain our outsourcing register?","Service/scope document, legal entities & processing locations, sub-contractor list, and any prior materiality/criticality classification.","always","Medium",{"MAS-N658-REGISTER":"equal","MAS-N658-MOORS":"subset","RBI-ITO-MATERIALITY":"subset","RBI-ITG-S10":"subset"})
c("NI-GOV-02",F_GOV,"Describe your security governance with board/senior-management oversight, and confirm you support our retained regulatory accountability.","Governance/operating model, ISMS/risk policy with approval, and a named accountable owner for our account.","always","Medium",{"MAS-N658-RISKMGMT":"subset","MAS-OB-GOV":"subset","MAS-TRM-GOV":"subset","SEBI-GVSC-STRATEGY":"equal","SEBI-GVSC-ACCOUNTABLE":"equal"})
c("NI-GOV-03",F_GOV,"How do you report service levels, control effectiveness and risk changes so we can monitor the arrangement across its lifecycle?","Sample SLA/KPI reports and the service-review cadence.","always","Low",{"MAS-OB-MONITOR":"equal"})
c("NI-GOV-04",F_GOV,"Does your service involve any core management, compliance or decision-making functions that cannot be outsourced under RBI rules?","Scope statement confirming no prohibited core functions are performed on our behalf.","always","Medium",{"RBI-OFS-NOOUTSOURCE":"equal"})
c("NI-GOV-05",F_GOV,"What single points of failure or shared infrastructure exist, and how many regulated clients do you serve from the same environment?","Dependency/SPOF disclosure and shared-infrastructure/location concentration details.","material","Medium",{"MAS-OB-CONCENTRATION":"equal","MAS-BCM-CONCENTRATION":"subset","RBI-ITO-CONCENTRATION":"equal","RBI-OFS-CONCENTRATION":"subset"})
c("NI-GOV-06",F_GOV,"Do any components, support or data flows occur outside the home jurisdiction, and how do you manage country/legal risk?","List of offshore locations/flows and an assessment preserving regulator/RE access and local-law enforceability.","cross-border","Medium",{"MAS-OB-CROSSBORDER":"equal","RBI-ITO-CROSSBORDER":"equal"})

c("NI-DD-01",F_DD,"Provide evidence of financial soundness, capability, ownership and security posture for our due diligence.","Audited financials, certifications (ISO 27001/SOC 2), ownership disclosure, and latest independent security assessment.","always","Medium",{"MAS-OB-DUEDIL":"equal","MAS-TRM-3RDPARTY":"subset","RBI-ITO-DD":"equal","RBI-CSF-VRM":"subset","SEBI-GVSC-RISKASSESS":"equal"})
c("NI-DD-02",F_DD,"Will you support re-assessment of your standing and controls at least every 24 months and notify us of material changes between reviews?","Commitment to recurring assurance, updated financials/certifications, and a change-notification procedure.","material","Medium",{"MAS-OB-REDD":"equal"})
c("NI-DD-03",F_DD,"Does our agreement include all mandated terms (scope, SLAs, confidentiality, security, audit rights, sub-contracting, BCP, termination/exit, liability, governing law)?","Executed agreement or a clause-mapping matrix demonstrating coverage.","always","High",{"MAS-OB-AGREEMENT":"equal","RBI-ITO-AGREEMENT":"equal","RBI-OFS-CONTRACT":"subset","SEBI-GVSC-CONTRACT":"equal"})
c("NI-DD-04",F_DD,"Can you attest that your controls meet or exceed the standards required of regulated entities, with a controls mapping?","Controls mapping to CSCRF/NIST/ISO and current certifications.","always","Medium",{"SEBI-GVSC-EQUALHIGHER":"equal"})
c("NI-DD-05",F_DD,"Do personnel handling our data receive regular security awareness training?","Security awareness programme and completion records for relevant staff.","always","Low",{"RBI-CSF-AWARENESS":"equal"})
c("NI-DD-06",F_DD,"Do you perform background verification on staff and sub-contractors with access, and execute NDAs/confidentiality agreements?","Background-check policy, screening summary, and executed NDA/confidentiality evidence.","always","Medium",{"RBI-ITO-DD-STAFF":"equal","RBI-NBFC-VENDORBG":"equal","RBI-UCB-VENDOR":"subset"})

c("NI-SUB-01",F_SUB,"Will you obtain our prior written consent before sub-contracting material parts, and remain fully liable for your sub-contractors?","Sub-contractor inventory, flow-down policy, and the contract clause on consent and provider liability.","always","High",{"MAS-OB-SUBCON":"equal","RBI-ITO-SUBCON":"equal"})
c("NI-SUB-02",F_SUB,"Do you flow down equivalent security requirements to material subcontractors and allow them within our audit scope?","Subcontractor register, flow-down clauses, and the latest material-subcontractor assessment.","always","High",{"SEBI-GVSC-SUBAUDIT":"equal"})
c("NI-SUB-03",F_SUB,"Where the service involves our customer information, how do you ensure secrecy compliance and control onward disclosure to sub-contractors / across borders?","Data-flow diagram, confidentiality clause, and onward-disclosure controls.","handles customer information","High",{"MAS-OB-CONSENT":"equal"})

c("NI-DATA-01",F_DATA,"Is all of our data stored and processed only within the required jurisdiction (India), with no copies held outside it?","Data-flow/residency diagram, hosting-region attestation, and data-centre locations.","handles customer/payment data","High",{"RBI-ITO-DATALOC":"equal","RBI-PSD-LOC":"equal","RBI-DL-DATAMIN":"subset","SEBI-CLOUD":"subset"},demo=D["residency"])
c("NI-DATA-02",F_DATA,"For cross-border transactions, is foreign-leg data returned to India and any foreign copy deleted within 24 hours?","Procedure and logs evidencing 24-hour deletion/return of foreign-processed data.","handles customer/payment data","High",{"RBI-PSD-24HR":"equal"})
c("NI-DATA-03",F_DATA,"In which countries is our data processed, stored and backed up (including by sub-processors), and will you notify us before changing locations?","Residency disclosure of all processing/storage/backup and sub-processor locations, plus a change-notification commitment.","cross-border","High",{"MAS-XB-RESIDENCY":"equal"})
c("NI-DATA-04",F_DATA,"How do you protect confidentiality/integrity of our data, segregate it in multi-tenant environments, and prevent data leakage (DLP)?","Data classification & handling policy, tenant-isolation architecture, and DLP controls.","always","High",{"MAS-OB-CONFID":"equal","MAS-TRM-DATASEC":"subset","RBI-CSF-DLP":"equal"},demo=D["dlp"])
c("NI-DATA-06",F_DATA,"If cloud-hosted, is the CSP MeitY-empanelled and STQC-certified, with market-critical data within India?","CSP empanelment/STQC evidence and data-region configuration.","cloud-hosted","High",{"SEBI-CLOUD":"equal"},demo=D["cloud"])

c("NI-CRY-01",F_CRY,"Is our data encrypted in transit (strong TLS) and at rest (AES-256-class) according to its classification?","Encryption standard (algorithms/key lengths), TLS scan, and at-rest encryption configuration.","always","High",{"MAS-TRM-CRYPTO":"subset","MAS-XB-ENCRYPTION":"equal","RBI-CSF-ACCESS-ENC":"subset","SEBI-PRDS-ENC":"equal"},demo=D["crypto"])
c("NI-CRY-02",F_CRY,"Describe your key-management lifecycle (HSM/KMS, rotation, revocation); are keys and key operations for our data located in India and under our control where applicable?","Key-management policy, HSM/KMS location, BYOK/HYOK arrangement, and rotation/revocation procedure.","always","High",{"MAS-TRM-CRYPTO":"subset","RBI-ITO-CLOUDKEY":"equal","SEBI-PRDS-KEYLOC":"equal"})

c("NI-AC-01",F_AC,"How do you enforce least-privilege, segregation of duties, PAM and periodic access reviews for systems handling our data (including device/BYOD controls)?","Access/PAM policy, privileged-account inventory & review, and a sample access recertification.","always","High",{"MAS-TRM-ACCESS":"equal","RBI-ITO-CLOUDRBAC":"subset","RBI-CSF-ACCESS-ENC":"subset","SEBI-PRAA-MFA":"subset"},demo=D["access"])
c("NI-AC-02",F_AC,"Is MFA enforced for all administrative/privileged accounts on critical systems and for internet access to systems holding our data?","MFA policy, enforcement configuration, and methods supported.","always","High",{"MAS-655-MFA":"equal","SEBI-PRAA-MFA":"equal","RBI-ITO-CLOUDRBAC":"subset"},demo=D["mfa"])
c("NI-AC-03",F_AC,"How are administrative accounts secured and prevented from use for non-administrative activity, with monitoring?","Administrative-account hardening standard and monitoring logs.","always","High",{"MAS-655-ADMIN":"equal"})

c("NI-VULN-01",F_VULN,"What is your patch/vulnerability management process and remediation SLAs by severity (including high/critical within one week)?","Patch/vulnerability policy with SLAs, recent compliance/scan report, and handling for unpatchable systems.","always","High",{"MAS-TRM-PATCH":"subset","MAS-655-PATCH":"equal","RBI-ITO-CLOUDPATCH":"subset","RBI-CSF-PATCHVULN":"subset","SEBI-PRMA-PATCH":"equal"})
c("NI-VULN-02",F_VULN,"Are systems hardened to documented baselines (e.g. CIS) with default credentials removed, and verified?","Hardening/baseline standards and a configuration-compliance scan.","always","Medium",{"MAS-655-STANDARDS":"equal","RBI-CSF-SECCONFIG":"equal"})
c("NI-VULN-03",F_VULN,"Do you follow a controlled change-management process (testing, approval, rollback) for changes affecting our services?","Change-management policy and sample change records.","always","Medium",{"RBI-ITG-S13-CHANGE":"equal"},demo=D["change"])

c("NI-NET-01",F_NET,"What perimeter controls (firewall, IPS/IDS, WAF, DDoS, segmentation) restrict unauthorised traffic?","Network/segmentation diagram, firewall/IPS/WAF configuration overview, and DDoS arrangements.","internet-facing","High",{"MAS-655-PERIMETER":"equal"})
c("NI-NET-02",F_NET,"What malware/EDR and email/web filtering is deployed and kept current across systems handling our data?","EDR/anti-malware coverage report, update process, and alerting configuration.","always","Medium",{"MAS-655-MALWARE":"equal"},demo=D["malware"])
c("NI-NET-03",F_NET,"For API/system connectivity with us, how is it secured (authentication, TLS, input validation, rate limiting, monitoring)?","API security standard, authentication methods (OAuth2/mTLS), TLS configuration, and API logging.","cloud-hosted","High",{"MAS-TRM-API":"equal"})

c("NI-LOG-01",F_LOG,"Do you run 24x7 security monitoring (SOC + SIEM) with efficacy reporting, and can you feed cloud/security logs to our SOC?","SOC operating model, SIEM/log coverage, sample efficacy report, and log-feed capability.","always","High",{"MAS-TRM-SOC":"subset","SEBI-DECM-SOC":"equal","RBI-ITO-CLOUDLOG":"subset"},demo=D["soc"])
c("NI-LOG-02",F_LOG,"Do you generate, protect and retain security/audit logs (including 180-day retention within India where applicable)?","Logging policy, retention configuration, and log-protection controls.","always","Medium",{"RBI-CSF-LOGS":"equal","RBI-CERTIN-LOGS":"equal"})
c("NI-LOG-03",F_LOG,"Do you have a tested incident-response plan covering containment, eradication, recovery and reporting (including sub-contractor incidents)?","Incident-response plan and latest test/tabletop results.","always","High",{"MAS-TRM-INCIDENT":"equal"})
c("NI-LOG-04",F_LOG,"What is your SLA to notify us of incidents/breaches so we can meet regulatory timelines (e.g. RBI/CERT-In 6 hours, MAS 14 working days)?","Notification SLA/runbook with timings, escalation contacts, and a sample notification.","always","High",{"MAS-N658-NOTIFY":"equal","RBI-ITO-INCIDENT6H":"equal","RBI-OFS-BREACH":"subset","RBI-CERTIN-6H":"equal","RBI-NBFC-INCIDENT":"subset","SEBI-GVSC-BREACHNOTIFY":"equal","SEBI-INCIDENT":"equal"})

c("NI-BCP-01",F_BCP,"Do you maintain and regularly test BCP/DR with defined RTO/RPO (including dependencies on your own vendors), and maintain spare capacity for critical infrastructure?","BCP/DR plan with RTO/RPO, latest DR test results, and spare-capacity evidence.","always","High",{"MAS-OB-BCP":"equal","RBI-ITO-BCPDR":"equal","RBI-ITG-S29-BCP":"subset","SEBI-RCRP":"equal"},demo=D["bcp"])
c("NI-BCP-02",F_BCP,"What recovery objectives do you commit to for our critical services, and are they reflected contractually to meet our service recovery time objective?","RTO/RPO commitments, contractual recovery clause, and achieved-recovery evidence.","material","High",{"MAS-BCM-SRTO":"equal","MAS-BCM-CONTRACT":"equal"})
c("NI-BCP-03",F_BCP,"Can you identify the critical sub-contractors, infrastructure and locations our services depend on?","Dependency map of critical sub-contractors, infrastructure and locations.","material","Medium",{"MAS-BCM-DEPENDENCY":"equal"})
c("NI-BCP-04",F_BCP,"How often do you test BCP/DR for our services, and will you join coordinated exercises and share results?","Latest BCP/DR test report, test schedule, and joint-exercise willingness.","material","High",{"MAS-BCM-TEST":"equal"})
c("NI-BCP-05",F_BCP,"What exit support do you provide (orderly transfer, certified data return/destruction), and do you commit not to delete or withhold our data during transition?","Exit/transition plan, data return-and-destruction procedure, and a no-erasure clause.","material","High",{"MAS-OB-TERMINATION":"equal","RBI-ITO-EXIT":"equal"})

c("NI-VAPT-01",F_VAPT,"Do you perform periodic VAPT/penetration testing (by CERT-In empanelled auditors where applicable) and remediate findings?","Latest VAPT/penetration-test summary, remediation status, and auditor credentials.","always","High",{"MAS-TRM-VAPT":"equal","RBI-CSF-PATCHVULN":"subset","SEBI-VAPT":"equal"})
c("NI-VAPT-02",F_VAPT,"Do you conduct scenario-based adversarial/red-team exercises to validate detection and response?","Red-team methodology and latest exercise summary with lessons learned.","material","Medium",{"MAS-TRM-REDTEAM":"equal"})
c("NI-VAPT-03",F_VAPT,"If you handle payment data, do you undergo a System Audit Report by a CERT-In empanelled auditor?","Latest CERT-In empanelled SAR and closure status.","handles customer/payment data","Medium",{"RBI-PSD-SAR":"equal"})

c("NI-SDLC-01",F_SDLC,"Describe your secure SDLC (secure coding, code review, SAST/DAST/SCA, security gates) for software serving us.","Secure SDLC policy, pipeline SAST/DAST/SCA evidence, and developer training records.","software vendor","High",{"MAS-TRM-SDLC":"equal","RBI-CSF-APPSEC":"equal"})
c("NI-SDLC-02",F_SDLC,"How do you assure delivered-software security (source-code review/SCA) and provide source-code escrow plus support for critical applications?","Source-code review/SCA results, escrow agreement, and support/maintenance SLA.","critical application","High",{"MAS-TRM-SOURCECODE":"equal","RBI-ITG-ESCROW":"equal","RBI-ITG-S12-SUPPORT":"equal"})
c("NI-SDLC-03",F_SDLC,"Will you certify in writing that delivered applications are free of known vulnerabilities, malware and covert channels/back-doors?","Signed certification plus supporting SAST/DAST/SCA and malware-scan results.","critical application","High",{"RBI-ITG-VULNCERT":"equal"})
c("NI-SDLC-04",F_SDLC,"Do you provide a Software Bill of Materials (SBOM) at purchase and updated SBOMs on every change, with the prescribed minimum fields?","Sample SBOM (SPDX/CycloneDX), the update process, and any documented exceptions.","software vendor","High",{"SEBI-SBOM":"equal"})

c("NI-AUD-01",F_AUD,"Do you grant us, our auditors and our regulator the right to audit/inspect your (and sub-contractors') operations, enforceable across all locations?","Right-to-audit and regulator-access clauses including sub-contractors and offshore enforceability.","material","High",{"MAS-N658-AUDIT":"equal","MAS-XB-AUDITACCESS":"equal","RBI-ITO-AUDIT":"equal","RBI-ITO-RBIINSPECT":"equal","RBI-OFS-RBIINSPECT":"subset","SEBI-GVSC-AUDITRIGHTS":"equal"})
c("NI-AUD-02",F_AUD,"Do you undergo independent audits at least every 3 years (SOC 2 Type II / ISO 27001 / IS audit) and share the reports?","Latest SOC 2 Type II / ISO 27001 + Statement of Applicability / IS audit summary.","material","High",{"MAS-OB-AUDIT3Y":"equal","MAS-TRM-ITAUDIT":"subset","RBI-ITG-ISAUDIT":"equal"})
c("NI-AUD-03",F_AUD,"Do you and any critical facilities (PDC/DR/NDR/SOC/colocation) hold current ISO/IEC 27001 certification?","Valid ISO 27001 certificate(s) with scope and a Statement of Applicability summary.","critical facility (PDC/DR/SOC)","High",{"SEBI-ISO27001":"equal"})

c("NI-PRIV-01",F_PRIV,"For personal data transferred cross-border, how do you ensure comparable protection (SCCs/BCRs/certification) per applicable law (PDPA/DPDP)?","Data processing agreement with transfer clauses, sub-processor list, and any BCRs/certifications.","cross-border","High",{"MAS-PDPA-XBORDER":"equal"})
c("NI-PRIV-02",F_PRIV,"Do you support our grievance redressal process and (for digital lending) designate a nodal grievance officer?","Grievance/escalation procedure and nodal officer details.","handles customer/payment data","Medium",{"RBI-OFS-GRIEVANCE":"equal","RBI-DL-GRO":"equal"})
c("NI-PRIV-03",F_PRIV,"Do you confirm borrower biometric data is not stored except where explicitly permitted by statute/regulation?","Policy and technical attestation confirming no biometric storage.","digital lending","High",{"RBI-DL-BIOMETRIC":"equal"})
c("NI-PRIV-04",F_PRIV,"As an LSP/DLA, can you provide due-diligence evidence on technical, security and conduct practices?","DLA technical/security assessment and conduct/compliance attestations.","digital lending","Medium",{"RBI-DL-DD":"equal"})

# ---- Coverage verification ----
all_clause_ids = set()
for fw in frameworks.values():
    for cl in fw["clauses"]:
        all_clause_ids.add(cl["id"])
covered = set()
for ctrl in C:
    for cid in ctrl["maps"]:
        covered.add(cid)
orphans = sorted(all_clause_ids - covered)
unknown = sorted(covered - all_clause_ids)
if unknown:
    print("ERROR: control references unknown clause ids:", unknown); sys.exit(1)
if orphans:
    print(f"ERROR: {len(orphans)} clauses NOT covered by any control:"); print("\n".join(orphans)); sys.exit(1)
print(f"COVERAGE OK: {len(C)} controls cover all {len(all_clause_ids)} clauses "
      f"(MAS {sum(1 for x in all_clause_ids if x.startswith('MAS'))}, "
      f"RBI {sum(1 for x in all_clause_ids if x.startswith('RBI'))}, "
      f"SEBI {sum(1 for x in all_clause_ids if x.startswith('SEBI'))}).")

# ---- Emit seed.ts ----
def j(s): return json.dumps(s, ensure_ascii=False)

fw_ts = []
for key in ("mas", "rbi", "sebi"):
    fw = frameworks[key]
    fid = fw["framework"]
    name, full, color = FW_META[fid]
    clauses = ",".join(f'{{id:{j(cl["id"])},title:{j(cl["title"])},text:{j(cl["text"])},source:{j(cl.get("source",""))}}}' for cl in fw["clauses"])
    fw_ts.append(f'  {{id:{j(fid)},name:{j(name)},full:{j(full)},color:{j(color)},clauses:[{clauses}]}}')

ctrl_ts = []
for i, ctrl in enumerate(C, 1):
    maps = ",".join(f'{{framework:{j(fw_of(cid))},clauseId:{j(cid)},relationship:{j(rel)}}}' for cid, rel in ctrl["maps"].items())
    demo_ts = "undefined"
    if ctrl["demo"]:
        d = ctrl["demo"]
        recs = ",".join(j(r) for r in d["recs"])
        demo_ts = (f'{{vendorResponse:{j(d["resp"])},vendorEvidence:{j(d["ev"])},'
                   f'verdict:{j(d["verdict"])},risk:{j(d["risk"])},riskStatement:{j(d["stmt"])},'
                   f'recommendations:[{recs}]}}')
    ctrl_ts.append(
        f'  {{id:{j(ctrl["id"])},sr:{i},family:{j(ctrl["family"])},question:{j(ctrl["question"])},'
        f'rfi:{j(ctrl["rfi"])},applicability:{j(ctrl["applicability"])},risk:{j(ctrl["risk"])},'
        f'mappings:[{maps}],demo:{demo_ts}}}')

out = f"""// AUTO-GENERATED by tools/build_seed.py — DO NOT EDIT BY HAND.
// Unified, coverage-complete control library: each question authored once and
// mapped across MAS / RBI / SEBI CSCRF. Every regulatory clause is covered by
// >=1 control (verified at build). Demo vendor responses (faithful to the
// NIPL/SMICC sample) are attached to a subset for the live AI adjudication demo.
import type {{ Control, Framework }} from "./types";

export const VENDOR = {{
  name: "Apex Cloud Services Pvt. Ltd.",
  engagement: "Cloud hosting & managed security services",
  client: "DBS Bank",
  scope: "TPRM Vendor Security Assessment",
}};

export const FRAMEWORKS: Framework[] = [
{",".join(fw_ts)}
];

export const CONTROLS: Control[] = [
{",".join(ctrl_ts)}
];
"""
open(OUT, "w").write(out)
print(f"Wrote {OUT}: {len(out)} bytes, {len(C)} controls, "
      f"{sum(len(fw['clauses']) for fw in frameworks.values())} clauses, "
      f"{sum(1 for x in C if x['demo'])} demo responses.")
