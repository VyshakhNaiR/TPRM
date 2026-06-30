// Shared per-vendor assessment report builder — used by both the assessor
// console and the customer portfolio. Produces a print-friendly HTML document
// (Save as PDF from the browser print dialog) and an Excel workbook from one
// common data shape, so the two surfaces stay in sync.
import * as XLSX from "xlsx";

export interface ReportControl {
  id: string;
  family: string;
  question: string;
  response: string;
  coverage?: string;
  evidence: string[]; // evidence/certificate filenames
  verdict: string;
  risk: string;
  riskStatement?: string;
  recommendations: string[];
  override?: { verdict: string; risk?: string; rationale: string; by?: string };
}

export interface VendorReport {
  vendorName: string;
  generatedAt: string; // caller passes a formatted timestamp (client-side)
  scope?: {
    applications?: { name: string }[];
    services?: { name: string }[];
    subcontractors?: { name: string }[];
    dataClassification?: string;
    accessLevel?: string;
    businessCriticality?: string;
    dataVolume?: string;
    connectivity?: string;
    crossBorderTransfer?: boolean;
    regions?: string[];
    dataTypes?: string[];
  } | null;
  profile?: { regulators?: string[]; infraType?: string; csp?: string; engagementType?: string } | null;
  summary: { assessed: number; compliant: number; nc: number; na: number; posture: number };
  rating: { rating: string; risk: string; approval: string };
  controls: ReportControl[];
  // When set, the PDF is stamped CONFIDENTIAL with a distribution-control note.
  // (Browser print can't encrypt; true password protection is applied by the
  // document-management layer on distribution.)
  confidential?: boolean;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function fileSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "vendor";
}

const VERDICT_COLOR: Record<string, string> = {
  Compliant: "#16a34a",
  "Non-Compliant": "#dc2626",
  "Not Applicable": "#6b7280",
};

// ---- PDF (print) ----
export function reportHtml(r: VendorReport): string {
  const reg = r.profile?.regulators?.length ? r.profile.regulators.join(", ") : "None";
  const infra = [r.profile?.infraType, r.profile?.csp].filter(Boolean).join(" · ") || "—";
  const cap = (s?: string) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const scopeRow = (label: string, value?: string) =>
    value ? `<div class="scope-row"><span class="scope-label">${esc(label)}</span><span>${esc(value)}</span></div>` : "";
  const scopeItems = (label: string, items?: { name: string }[]) =>
    items && items.length
      ? `<div class="scope-row"><span class="scope-label">${esc(label)}</span><span>${items.map((i) => esc(i.name)).join(", ")}</span></div>`
      : "";

  const rows = r.controls
    .map((c) => {
      const color = VERDICT_COLOR[c.verdict] ?? "#374151";
      const ev = c.evidence.length ? c.evidence.map(esc).join("<br/>") : "<span class='muted'>—</span>";
      const recs = c.recommendations.length ? `<ul>${c.recommendations.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
      const ov = c.override
        ? `<div class="override">⚖ Assessor override → <b>${esc(c.override.verdict)}</b>${c.override.by ? ` <span class="muted">by ${esc(c.override.by)}</span>` : ""}<br/><i>${esc(c.override.rationale)}</i></div>`
        : "";
      return `<tr>
        <td class="mono">${esc(c.id)}</td>
        <td>${esc(c.question)}<div class="muted small">${esc(c.family)}</div></td>
        <td>${esc(c.response) || "<span class='muted'>—</span>"}${c.coverage ? `<div class="muted small">via ${esc(c.coverage)}</div>` : ""}</td>
        <td>${ev}</td>
        <td><b style="color:${color}">${esc(c.verdict)}</b>${c.risk && c.risk !== "None" ? `<div class="muted small">${esc(c.risk)}</div>` : ""}${c.riskStatement ? `<div class="small">${esc(c.riskStatement)}</div>` : ""}${recs}${ov}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>TPRM Assessment Report — ${esc(r.vendorName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; margin: 26px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .sub { color: #6b7280; margin-bottom: 18px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; }
  .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 14px; min-width: 120px; }
  .card .n { font-size: 20px; font-weight: 700; }
  .card .l { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .rating { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; margin: 8px 0 4px; background: #f9fafb; }
  .rating b { font-size: 15px; }
  .scope-row { display: flex; gap: 10px; padding: 3px 0; }
  .scope-label { min-width: 130px; color: #6b7280; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: #6b7280; border-bottom: 2px solid #e5e7eb; padding: 6px 8px; }
  td { border-bottom: 1px solid #eef0f3; padding: 8px; vertical-align: top; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 11px; white-space: nowrap; }
  .muted { color: #9ca3af; }
  .small { font-size: 11px; }
  ul { margin: 6px 0 0; padding-left: 16px; }
  .override { margin-top: 6px; padding: 6px 8px; border-left: 3px solid #7c3aed; background: #f5f3ff; border-radius: 4px; font-size: 11px; }
  .footer { margin-top: 28px; color: #9ca3af; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  .confidential-bar { display: inline-block; margin-bottom: 10px; padding: 3px 10px; border-radius: 6px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
  .watermark { position: fixed; inset: 0; display: grid; place-items: center; pointer-events: none; z-index: 0; }
  .watermark span { font-size: 120px; font-weight: 800; color: rgba(220,38,38,0.06); transform: rotate(-30deg); white-space: nowrap; }
  body > *:not(.watermark) { position: relative; z-index: 1; }
  @media print { body { margin: 12mm; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
</style></head>
<body onload="window.print()">
  ${r.confidential ? `<div class="watermark"><span>CONFIDENTIAL</span></div>` : ""}
  ${r.confidential ? `<div class="confidential-bar">CONFIDENTIAL — RESTRICTED DISTRIBUTION</div><br/>` : ""}
  <h1>${esc(r.vendorName)}</h1>
  <div class="sub">Third-Party Risk Assessment Report · Generated ${esc(r.generatedAt)}</div>

  <div class="cards">
    <div class="card"><div class="n">${r.summary.assessed}</div><div class="l">Assessed</div></div>
    <div class="card"><div class="n" style="color:#16a34a">${r.summary.compliant}</div><div class="l">Compliant</div></div>
    <div class="card"><div class="n" style="color:#dc2626">${r.summary.nc}</div><div class="l">Non-Compliant</div></div>
    <div class="card"><div class="n" style="color:#6b7280">${r.summary.na}</div><div class="l">Not Applicable</div></div>
    <div class="card"><div class="n">${r.summary.posture}%</div><div class="l">Posture</div></div>
  </div>

  <div class="rating">
    Consolidated rating: <b>${esc(r.rating.rating)}</b> &nbsp;·&nbsp; Residual risk: <b>${esc(r.rating.risk)}</b><br/>
    <span class="muted">Approval authority:</span> ${esc(r.rating.approval)}
  </div>

  <h2>Assessment scope</h2>
  <div class="scope-row"><span class="scope-label">Engagement</span><span>${esc(r.profile?.engagementType === "existing" ? "Existing vendor" : r.profile?.engagementType === "due_diligence" ? "Due diligence" : "—")}</span></div>
  <div class="scope-row"><span class="scope-label">Regulatory frameworks</span><span>${esc(reg)}</span></div>
  <div class="scope-row"><span class="scope-label">Hosting</span><span>${esc(infra)}</span></div>
  ${scopeRow("Data classification", cap(r.scope?.dataClassification))}
  ${scopeRow("Access level", r.scope?.accessLevel)}
  ${scopeRow("Business criticality", cap(r.scope?.businessCriticality))}
  ${scopeRow("Data volume", cap(r.scope?.dataVolume))}
  ${scopeRow("Connectivity", r.scope?.connectivity)}
  ${r.scope?.crossBorderTransfer ? `<div class="scope-row"><span class="scope-label">Cross-border</span><span>Data transferred across borders</span></div>` : ""}
  ${r.scope?.regions?.length ? `<div class="scope-row"><span class="scope-label">Data residency</span><span>${esc(r.scope.regions.join(", "))}</span></div>` : ""}
  ${r.scope?.dataTypes?.length ? `<div class="scope-row"><span class="scope-label">Data types</span><span>${esc(r.scope.dataTypes.join(", "))}</span></div>` : ""}
  ${scopeItems("Services", r.scope?.services)}
  ${scopeItems("Applications", r.scope?.applications)}
  ${scopeItems("Subcontractors", r.scope?.subcontractors)}

  <h2>Control-by-control findings</h2>
  <table>
    <thead><tr><th>Control</th><th>Requirement</th><th>Vendor response</th><th>Evidence</th><th>Verdict &amp; finding</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" class="muted">No controls assessed.</td></tr>`}</tbody>
  </table>

  <div class="footer">This report reflects the assessment state at generation time. Assessor overrides are the final authority on any control verdict.${r.confidential ? " This document is marked CONFIDENTIAL — apply password protection / access controls before distributing externally." : ""}</div>
</body></html>`;
}

// Opens the report in a new window and triggers the browser print dialog
// (the user chooses "Save as PDF"). Returns false if a popup blocker stopped it.
export function openReportPrint(r: VendorReport): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(reportHtml(r));
  w.document.close();
  return true;
}

// ---- Excel ----
export function exportReportExcel(r: VendorReport): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Vendor: r.vendorName,
        "Generated": r.generatedAt,
        "Assessed Controls": r.summary.assessed,
        Compliant: r.summary.compliant,
        "Non-Compliant": r.summary.nc,
        "Not Applicable": r.summary.na,
        "Posture Score (%)": r.summary.posture,
        "Consolidated Rating": r.rating.rating,
        "Residual Risk": r.rating.risk,
        "Approval Authority": r.rating.approval,
        "Regulatory Frameworks": r.profile?.regulators?.join(", ") || "None",
        Hosting: [r.profile?.infraType, r.profile?.csp].filter(Boolean).join(" / ") || "—",
      },
    ]),
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      r.controls.map((c) => ({
        "Control ID": c.id,
        Family: c.family,
        Requirement: c.question,
        "Vendor Response": c.response,
        Coverage: c.coverage ?? "",
        Evidence: c.evidence.join("; "),
        Verdict: c.verdict,
        Risk: c.risk,
        "Risk Statement": c.riskStatement ?? "",
        Recommendations: c.recommendations.join("; "),
        "Override Verdict": c.override?.verdict ?? "",
        "Override Rationale": c.override?.rationale ?? "",
        "Overridden By": c.override?.by ?? "",
      }))
    ),
    "Controls"
  );
  XLSX.writeFile(wb, `tprm-report-${fileSlug(r.vendorName)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
