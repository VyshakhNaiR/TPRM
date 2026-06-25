import { NextRequest, NextResponse } from "next/server";
import { createVendor, updateVendorProfile, isValidEmail, type VendorProfile } from "@/lib/users";
import { currentSession, can } from "@/lib/auth";
import { computeTier } from "@/lib/risk";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/storage";
import { validateUpload } from "@/lib/filetypes";
import { extractFile } from "@/lib/extract";
import { extractPriorFindings } from "@/lib/prioraudit";
import { setPriorFindings } from "@/lib/store";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
const MAX_BYTES = 25 * 1024 * 1024;
const REGS = new Set(["RBI", "MAS", "SEBI", "None"]);

// Assessor-led onboarding (Phase A). The assessor (not the vendor) creates the
// vendor record, sets engagement type / infra / applicable regulators, and — for
// an EXISTING vendor — uploads the agreement + last TPRM audit report (which seeds
// the prior-findings focus list). The assessor's own session is unaffected.
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }
  const g = (k: string) => String(form.get(k) || "").trim();

  const email = g("email").toLowerCase();
  const company = g("company");
  const password = g("password");
  if (!company || !email || !password) return NextResponse.json({ error: "Company, email and a temporary password are required." }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });

  const engagementType = g("engagementType") === "existing" ? "existing" : "due_diligence";
  const infraType = (["on_prem", "cloud", "hybrid"].includes(g("infraType")) ? g("infraType") : "on_prem") as VendorProfile["infraType"];
  const csp = infraType === "cloud" || infraType === "hybrid" ? g("csp") : "";
  let regulators: string[] = [];
  try { const r = form.get("regulators"); regulators = r ? JSON.parse(String(r)) : []; } catch { regulators = g("regulators").split(",").map((x) => x.trim()); }
  regulators = regulators.filter((r) => REGS.has(r));

  const { tier, score } = computeTier({
    dataSensitivity: (g("dataSensitivity") || "confidential") as any,
    access: (g("access") || "limited") as any,
    criticality: (g("criticality") || "medium") as any,
    frameworks: regulators.filter((r) => r !== "None"),
    volume: (g("volume") || "medium") as any,
  });

  const profile: VendorProfile = {
    company, address: g("address"), website: g("website"), spocEmail: email,
    spocPhone: g("spocPhone"), serviceDescription: g("serviceDescription"), country: g("country"),
    directContract: form.get("directContract") === "true",
    tier, tierScore: score, tierSelfDeclared: false, // assessor-set
    engagementType, infraType, csp, regulators,
    tprmInitiatedAt: new Date().toISOString(), onboardedBy: s!.username,
  };

  let session;
  try {
    session = await createVendor({ email, password, profile });
  } catch (e: any) {
    if (e.message === "exists") return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    if (e.message === "weak_password") return NextResponse.json({ error: "Temporary password too weak — use at least 12 characters with letters and numbers." }, { status: 400 });
    if (e.message === "invalid_email") return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    return NextResponse.json({ error: "Onboarding failed." }, { status: 500 });
  }
  const vendorId = session.vendorId!;

  // Existing vendor: store agreement + last audit report; seed prior-findings.
  let priorCount = 0;
  if (engagementType === "existing") {
    const saveFile = async (field: string) => {
      const f = form.get(field) as File | null;
      if (!f) return undefined;
      const bytes = Buffer.from(await f.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_BYTES) return undefined;
      if (validateUpload(f.name, bytes)) return undefined;
      const ref = await saveUpload(`${vendorId}/onboarding`, f.name, bytes);
      return { ref, bytes, name: f.name };
    };
    const agreement = await saveFile("agreement");
    const lastAudit = await saveFile("lastAudit");
    const patch: Partial<VendorProfile> = {};
    if (agreement) patch.agreementFile = agreement.ref;
    if (lastAudit) patch.lastAuditFile = lastAudit.ref;
    if (Object.keys(patch).length) await updateVendorProfile(vendorId, patch);

    if (lastAudit) {
      try {
        const ex = await extractFile(lastAudit.name, lastAudit.bytes, { ocr: getSettings().static.ocrEnabled });
        const prior = extractPriorFindings(ex.text || "");
        if (Object.keys(prior).length) { await setPriorFindings(vendorId, prior, profile.tprmInitiatedAt); priorCount = Object.keys(prior).length; }
      } catch { /* best-effort parse */ }
    }
  }

  audit(s!.username, "onboarded vendor", `${company} · ${engagementType} · ${tier} tier${priorCount ? ` · ${priorCount} prior findings` : ""}`);
  return NextResponse.json({ ok: true, vendorId, tier, engagementType, priorFindings: priorCount });
}
