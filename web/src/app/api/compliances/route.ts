import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { listCompliances, createCompliance, updateCompliance, deleteCompliance, listCatalog, type ComplianceState } from "@/lib/compliance";
import { saveUpload } from "@/lib/storage";
import { validateUpload } from "@/lib/filetypes";
import { readJson } from "@/lib/http";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
const MAX_BYTES = 25 * 1024 * 1024;
const STATE = new Set<ComplianceState>(["valid", "expiring", "expired", "in_progress", "missing"]);

export async function GET(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vendorId = req.nextUrl.searchParams.get("vendorId") || "apex";
  return NextResponse.json({ compliances: listCompliances(vendorId), catalog: listCatalog() });
}

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const ct = req.headers.get("content-type") || "";
  let vendorId = "", framework = "", status = "valid", issuedDate = "", expiryDate = "", note = "";
  let file: { id: string; filename: string; size: number } | undefined;

  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try { form = await req.formData(); } catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }
    vendorId = String(form.get("vendorId") || "");
    framework = String(form.get("framework") || "");
    status = String(form.get("status") || "valid");
    issuedDate = String(form.get("issuedDate") || "");
    expiryDate = String(form.get("expiryDate") || "");
    note = String(form.get("note") || "");
    const f = form.get("file") as File | null;
    if (f) {
      const bytes = Buffer.from(await f.arrayBuffer());
      if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "file too large (max 25MB)" }, { status: 413 });
      const typeErr = validateUpload(f.name, bytes);
      if (typeErr) return NextResponse.json({ error: typeErr }, { status: 415 });
      file = await saveUpload(`${vendorId}/certs`, f.name, bytes);
    }
  } else {
    const parsed = await readJson<any>(req);
    if ("error" in parsed) return parsed.error;
    ({ vendorId = "", framework = "", status = "valid", issuedDate = "", expiryDate = "", note = "" } = parsed.data);
  }

  if (!vendorId || !framework.trim()) return NextResponse.json({ error: "vendorId and framework required" }, { status: 400 });
  const c = await createCompliance({
    vendorId, framework: framework.trim(),
    status: STATE.has(status as ComplianceState) ? (status as ComplianceState) : "valid",
    issuedDate, expiryDate, note: note.slice(0, 2000), file,
  });
  audit(s!.username, "added compliance", `${framework} · ${vendorId}`);
  return NextResponse.json({ compliance: c });
}

export async function PATCH(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJson<any>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, complianceId, ...patch } = parsed.data;
  if (!vendorId || !complianceId) return NextResponse.json({ error: "vendorId and complianceId required" }, { status: 400 });
  if (patch.status && !STATE.has(patch.status)) delete patch.status;
  const c = await updateCompliance(vendorId, complianceId, patch);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ compliance: c });
}

export async function DELETE(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vendorId = req.nextUrl.searchParams.get("vendorId") || "";
  const complianceId = req.nextUrl.searchParams.get("complianceId") || "";
  if (!vendorId || !complianceId) return NextResponse.json({ error: "vendorId and complianceId required" }, { status: 400 });
  const ok = await deleteCompliance(vendorId, complianceId);
  return NextResponse.json({ ok });
}
