import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { addCert, removeCert, getSubmission, type CertType } from "@/lib/store";
import { saveUpload } from "@/lib/storage";
import { validateUpload } from "@/lib/filetypes";
import { extractFile } from "@/lib/extract";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
const MAX_BYTES = 25 * 1024 * 1024;
const CERTS = new Set<CertType>(["iso27001", "pci_aoc", "soc2_type2"]);

// Vendor certification library — upload a certificate/attestation ONCE here, then
// reference it from any control's certification answer (no repeated upload).
export async function GET() {
  const s = await currentSession();
  if (!s || s.role !== "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ certs: getSubmission(s.vendorId!).certs ?? [] });
}

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!s || s.role !== "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "invalid form data" }, { status: 400 }); }
  const file = form.get("file") as File | null;
  const certType = String(form.get("certType") || "") as CertType;
  if (!file || !CERTS.has(certType)) return NextResponse.json({ error: "file and a valid certType required" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "empty file" }, { status: 400 });
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "file too large (max 25MB)" }, { status: 413 });
  const typeErr = validateUpload(file.name, bytes);
  if (typeErr) return NextResponse.json({ error: typeErr }, { status: 415 });

  const ev = await saveUpload(`${s.vendorId}/certs`, file.name, bytes);
  const extraction = await extractFile(file.name, bytes, { ocr: getSettings().static.ocrEnabled });
  const cert = await addCert(s.vendorId!, { certType, filename: file.name, size: ev.size, hash: extraction.hash });
  return NextResponse.json({ cert, certs: getSubmission(s.vendorId!).certs ?? [] });
}

export async function DELETE(req: NextRequest) {
  const s = await currentSession();
  if (!s || s.role !== "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sub = await removeCert(s.vendorId!, id);
  return NextResponse.json({ certs: sub.certs ?? [] });
}
