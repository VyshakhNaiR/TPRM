import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { listContracts, createContract, updateContract, deleteContract, CLAUSE_TEMPLATE } from "@/lib/compliance";
import { saveUpload } from "@/lib/storage";
import { validateUpload } from "@/lib/filetypes";
import { readJson } from "@/lib/http";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
const MAX_BYTES = 25 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vendorId = req.nextUrl.searchParams.get("vendorId") || "apex";
  return NextResponse.json({ contracts: listContracts(vendorId), clauseTemplate: CLAUSE_TEMPLATE });
}

// Create a contract; optionally with an uploaded MSA file (multipart) or JSON only.
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const ct = req.headers.get("content-type") || "";
  let vendorId = "", title = "", counterparty = "", startDate = "", renewalDate = "", expiryDate = "";
  let file: { id: string; filename: string; size: number } | undefined;

  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try { form = await req.formData(); } catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }
    vendorId = String(form.get("vendorId") || "");
    title = String(form.get("title") || "");
    counterparty = String(form.get("counterparty") || "");
    startDate = String(form.get("startDate") || "");
    renewalDate = String(form.get("renewalDate") || "");
    expiryDate = String(form.get("expiryDate") || "");
    const f = form.get("file") as File | null;
    if (f) {
      const bytes = Buffer.from(await f.arrayBuffer());
      if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "file too large (max 25MB)" }, { status: 413 });
      const typeErr = validateUpload(f.name, bytes);
      if (typeErr) return NextResponse.json({ error: typeErr }, { status: 415 });
      file = await saveUpload(`${vendorId}/contracts`, f.name, bytes);
    }
  } else {
    const parsed = await readJson<any>(req);
    if ("error" in parsed) return parsed.error;
    ({ vendorId = "", title = "", counterparty = "", startDate = "", renewalDate = "", expiryDate = "" } = parsed.data);
  }

  if (!vendorId || !title.trim()) return NextResponse.json({ error: "vendorId and title are required" }, { status: 400 });
  const c = await createContract({
    vendorId, title: title.trim(), counterparty: counterparty.trim(),
    startDate, renewalDate, expiryDate, file, createdBy: s!.username,
  });
  audit(s!.username, "added contract", `${title} · ${vendorId}`);
  return NextResponse.json({ contract: c });
}

// Update metadata or toggle clause present/absent.
export async function PATCH(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJson<any>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, contractId, ...patch } = parsed.data;
  if (!vendorId || !contractId) return NextResponse.json({ error: "vendorId and contractId required" }, { status: 400 });
  const c = await updateContract(vendorId, contractId, patch);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ contract: c });
}

export async function DELETE(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vendorId = req.nextUrl.searchParams.get("vendorId") || "";
  const contractId = req.nextUrl.searchParams.get("contractId") || "";
  if (!vendorId || !contractId) return NextResponse.json({ error: "vendorId and contractId required" }, { status: 400 });
  const ok = await deleteContract(vendorId, contractId);
  audit(s!.username, "deleted contract", `${contractId} · ${vendorId}`);
  return NextResponse.json({ ok });
}
