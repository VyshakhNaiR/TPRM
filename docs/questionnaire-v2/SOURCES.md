# SOURCES — NI-TPRM Controls v2

Reference list for `NI-TPRM-Controls-v2.xlsx`. Titles, dates and key requirement
areas were re-confirmed via web research in **June 2026**. Clause/section numbers
in the workbook are indicative and **must be verified against the official PDFs**
before use as a system of record (see the workbook **Readme** sheet disclaimer).

The workbook's `Source reference(s)` column reuses the in-app clause IDs defined in:
- `web/src/data/sources/mas.json`
- `web/src/data/sources/rbi.json`
- `web/src/data/sources/sebi.json`

---

## MAS (Singapore)

| Framework | Key dates / status (confirmed) | Key requirement areas used | Primary source |
|---|---|---|---|
| **MAS Notice 658 — Management of Outsourced Relevant Services for Banks** | Issued 2023; **effective 11 Dec 2024**. Register submission **within ~15 business days** of the 30 Jun / 31 Dec reporting dates. **MOORS** materiality concept. Adverse-development **notification within 14 working days**. | Register, materiality (MOORS), audit/inspection access, adverse-development notification, risk management | https://www.mas.gov.sg/regulation/notices/notice-658 ; FAQ (11 Dec 2024): https://www.mas.gov.sg/-/media/mas-media-library/regulation/faqs/bd/faq-on-outsourcing-guidelines/faq-for-notice-658-and-1121_11dec2024.pdf |
| **MAS Guidelines on Outsourcing (Banks)** | Current guidelines (companion to Notice 658). | Board responsibility, due diligence, agreement terms, sub-contracting, cross-border, exit, monitoring, concentration, independent audit (~3-yearly) | https://www.mas.gov.sg/regulation/guidelines/guidelines-on-outsourcing-banks |
| **MAS Technology Risk Management (TRM) Guidelines** | Revised **18 Jan 2021**. | Tech-risk governance, third-party/API, access/PAM, cryptography, data/infra security, SOC/detection, incident response, VAPT, red-team, secure SDLC, source-code review, patch, IT audit | https://www.mas.gov.sg/-/media/MAS/Regulations-and-Financial-Stability/Regulatory-and-Supervisory-Framework/Risk-Management/TRM-Guidelines-18-January-2021.pdf |
| **MAS Notice 655 — Cyber Hygiene** | Issued **6 Aug 2019**, effective **6 Aug 2020**. **NOTE: now CANCELLED/superseded** — baseline measures persist via TRM / Notice 658-era requirements. | Admin-account security, security patches, security standards/hardening, perimeter defence, malware protection, MFA | https://www.mas.gov.sg/regulation/notices/notice-655 ; PDF: https://www.mas.gov.sg/-/media/MAS/Notices/PDF/MAS-Notice-655.pdf |
| **MAS Guidelines on Business Continuity Management (BCM)** | Revised **6 Jun 2022** (supersedes Jun 2003). | Dependency mapping, Service Recovery Time Objective (SRTO), contractual recovery commitments, third-party BCP testing, resilience concentration | https://www.mas.gov.sg/regulation/guidelines/guidelines-on-business-continuity-management ; PDF: https://www.mas.gov.sg/-/media/mas/regulations-and-financial-stability/regulatory-and-supervisory-framework/risk-management/bcm-guidelines/bcm-guidelines-june-2022.pdf |
| **PDPA 2012 (Singapore)** | Personal Data Protection Act. | Cross-border transfer limitation (S26), breach notification, access/correction | https://sso.agc.gov.sg/Act/PDPA2012 |

---

## RBI (India)

| Framework | Key dates / status (confirmed) | Key requirement areas used | Primary source |
|---|---|---|---|
| **RBI (Outsourcing of Information Technology Services) Directions, 2023** | Issued **10 Apr 2023**, **effective 1 Oct 2023** (RBI/2023-24/102). | Materiality, due diligence (incl. staff/sub-contractors), agreement schedule, **data storage in India**, audit & RBI-inspection rights, sub-contracting (prior consent; provider liable), incident reporting enabling **6-hour** RBI report, concentration, BCP/DR, cross-border, **exit (no data erasure in transition)**, **Cloud Appendix** (keys/HSM under RE control, RBAC/MFA, CSP logs to RE SOC, patching) | https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12562 ; PDF: https://fidcindia.org.in/wp-content/uploads/2023/04/RBI-OUTSOURCING-OF-IT-SERVICES-10-04-23.pdf |
| **RBI Master Direction — IT Governance, Risk, Controls and Assurance Practices, 2023** | Notified **7 Nov 2023**, **effective 1 Apr 2024**. | Third-party arrangements (S10), vendor support agreement (S12), **source code / escrow** (S12), **vulnerability-free certification** (S12), change/patch (S13), BCP incl. vendor (S29), IS audit covers third parties, annual PT / semi-annual VA, SBOM-aligned | https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12562 ; summary: https://www.medianama.com/2023/11/223-summary-rbi-direction-it-governance-risk-controls/ |
| **RBI (Digital Lending) Directions, 2025** | Consolidated directions (2025) superseding 2022 guidelines. | LSP/DLA due diligence, **data minimisation & India-only storage (24-hour repatriation)**, **no biometric storage**, grievance-redressal officer, DLA conduct/transparency (KFS), consent-driven data | Overview: https://www.argus-p.com/updates/updates/rbi-digital-lending-directions-2025-an-overview/ ; https://www.lawrbit.com/article/reserve-bank-of-india-digital-lending-directions-2025/ |
| **RBI Storage of Payment System Data, 2018** | Circular **DPSS.CO.OD No.2785/06.08.005/2017-2018, 6 Apr 2018**; SAR initially due 31 Dec 2018. | **Entire payment data stored only in India**, foreign-leg purge/return within **24 hours**, **System Audit Report by CERT-In empanelled auditor** (board-approved) | RBI FAQ: https://www.rbi.org.in/commonman/english/scripts/FAQs.aspx?Id=2995 ; clarification: https://www.azbpartners.com/bank/rbi-clarification-on-the-circular-on-storage-of-payment-system-data/ |
| **Payment and Settlement Systems (PSS) Act, 2007** | Enabling statute for payment-system authorisation/regulation. | Authorisation basis for payment-system providers | https://www.rbi.org.in (PSS Act) |
| **RBI Guidelines on Regulation of Payment Aggregators & Payment Gateways** | Issued **Mar 2020**; **RBI PA Master Directions — Sep 2025** overhaul (PA-O / PA-P). Existing-merchant compliance by **31 Dec 2025**. | PA authorisation/standards, merchant onboarding/CDD, escrow & InCA/OCA, PCI DSS/PA-DSS adherence, data storage, incident reporting | https://www.rbi.org.in (PA/PG MD) ; https://authbridge.com/blog/rbi-payment-aggregator-master-direction-2025/ ; https://www.investindia.gov.in/team-india-blogs/regulation-payment-ecosystem-rbi |
| **RBI Card-on-File Tokenisation (CoFT)** | No-storage rule **effective 1 Jan 2022**. | **No CoF (actual card) storage** except card issuers/networks; tokenisation with consent + AFA; token uniqueness per card+requestor+merchant | https://www.rbi.org.in (CoFT circulars / FAQ) |
| **RBI Cyber Security Framework in Banks, 2016** | Circular DBS.CO/CSITE; Annex with baseline controls. | Vendor risk management (C11), DLP extends to vendor (15.3), secure config (C5), patch/vuln (C7), access/encryption (C8), logging (C16/17), awareness for vendors (23.1), app security/source-code audit (6.2) | https://www.rbi.org.in (CSF 2016) |
| **RBI IT Framework for NBFC Sector, 2017 / Cyber Security Framework for UCBs, 2018/2020** | Sector frameworks. | Vendor background checks & NDAs, vendor incident notification (risk-tiered) | https://www.rbi.org.in (NBFC / UCB frameworks) |
| **RBI Outsourcing of Financial Services, 2006** | Foundational FS-outsourcing guidelines. | Core functions not outsourceable, contract terms, RBI inspection, breach notification, concentration/systemic risk, grievance | https://www.rbi.org.in (Outsourcing of FS) |
| **CERT-In Directions, 28 Apr 2022 (s.70B IT Act)** | In force. | **6-hour incident reporting**; **180-day log retention within India** | https://www.cert-in.org.in (Directions 28 Apr 2022) |
| **DPDP Act, 2023 (India)** | Digital Personal Data Protection Act. | Data-principal rights, breach notification, processor obligations | https://www.meity.gov.in (DPDP Act 2023) |

---

## SEBI (India)

| Framework | Key dates / status (confirmed) | Key requirement areas used | Primary source |
|---|---|---|---|
| **SEBI Cybersecurity and Cyber Resilience Framework (CSCRF)** | Circular **SEBI/HO/ITD-1/ITD_CSC_EXT/P/CIR/2024/113, 20 Aug 2024**; effective phased. | **GV.SC** supply-chain risk mgmt (strategy, risk assessment, equal-or-higher vendor standards, contractual clauses, audit rights, breach notification, material-subcontractor audit, RE accountability); **SBOM**; **PR.DS** encryption & keys-in-India; **PR.AA** MFA/PAM; **PR.MA** patch timelines; **DE.CM** 24x7 SOC / M-SOC; **RC.RP** recovery; **VAPT/cyber audit** by CERT-In empanelled; **ISO 27001** for MIIs/critical facilities; **Cloud** (MeitY/STQC, India localisation) | https://www.sebi.gov.in/legal/circulars/aug-2024/cybersecurity-and-cyber-resilience-framework-cscrf-for-sebi-regulated-entities-res-_85964.html |
| **SEBI CSCRF — Technical Clarifications (2025)** | **Aug 2025** technical clarifications (.../2025/96329); FAQs June 2025; amendments 30 Apr 2025 / 28 Aug 2025. **NOTE:** PR.DS **data-localisation provisions reportedly kept in abeyance** pending consultation; HSM mandate for MIIs/Qualified REs; equivalence principle for multi-regulator entities. | SBOM minimum fields & board-approved exceptions; keys-in-India clarification; data-localisation abeyance | https://www.sebi.gov.in/legal/circulars/aug-2025/technical-clarifications-to-cybersecurity-and-cyber-resilience-framework-cscrf-for-sebi-regulated-entities-res-_96329.html |
| **SEBI Framework for Adoption of Cloud Services by REs** | Woven into CSCRF; FAQs June 2025. | MeitY-empanelled + STQC-certified CSPs; India localisation of market-critical/regulatory data | https://www.sebi.gov.in (Cloud framework) ; NSDL circular: https://nsdl.co.in/downloadables/pdf/2025-0001-Policy-SEBI_circular_regarding_Clarifications_to_Cybersecurity_and_Cyber_Resilience_Framework_(CSCRF)_for_SEBI_Regulated_Entities_(REs).pdf |

---

## Items to verify manually (could not fully confirm exact clause numbering online)

- **Exact section/sub-section numbers** for MAS TRM 2021 (e.g., "S9/S12/S14"), RBI CSF 2016 annex control IDs (C5/C7/C8/C11/C16/C17/15.3/23.1/6.2), and RBI IT Governance 2023 section numbers (S10/S12/S13/S29) — confirm against the official PDFs; secondary sources paraphrase these.
- **MAS Notice 658 register submission window** — confirm whether the exact wording is "15 business days" vs. another period; PwC/MAS FAQ wording should be checked against the Notice text.
- **RBI Digital Lending Directions 2025** — confirm the precise paragraph numbers (e.g., Para 13 minimal-data for LSPs) and the final consolidated citation, as the 2025 consolidation post-dates several secondary write-ups.
- **RBI PA Master Directions 2025** — confirm the official directions number/date and which 2020 provisions are superseded vs. retained.
- **RBI CoFT** — confirm the operative circular reference(s) and current AFA/token-uniqueness wording.
- **SEBI CSCRF PR.DS data localisation** — confirm current status (reported "in abeyance"); this materially affects the keys-in-India and data-localisation controls (DSR-07, DSR-08, CLD-02, CKM-03).
- **MAS Notice 655 cancellation** — confirm the cancellation/superseding instrument so that any references are reframed against current MAS requirements.
