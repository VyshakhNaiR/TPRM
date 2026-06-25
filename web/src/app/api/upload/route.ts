import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { addEvidence } from "@/lib/store";
import { saveUpload } from "@/lib/storage";
import { extractFile } from "@/lib/extract";
import { getSettings } from "@/lib/settings";
import { validateUpload } from "@/lib/filetypes";
import { CONTROLS } from "@/data/seed";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!s) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }
  const file = form.get("file") as File | null;
  const controlId = form.get("controlId") as string | null;
  if (!file || !controlId) return NextResponse.json({ error: "file and controlId required" }, { status: 400 });
  // Only accept evidence against a real control (no arbitrary store keys).
  if (!CONTROLS.some((c) => c.id === controlId)) return NextResponse.json({ error: "unknown control" }, { status: 404 });

  // Resolve the target vendor + provenance. Vendors upload to their own; an
  // assessor/root may upload ON BEHALF (onsite/remote) against ?vendorId=.
  let vendorId: string;
  let onBehalf = false;
  if (s.role === "vendor") {
    vendorId = s.vendorId!;
  } else if (can(s.role, "submission:write:onbehalf")) {
    const q = (form.get("vendorId") as string | null) || req.nextUrl.searchParams.get("vendorId");
    if (!q) return NextResponse.json({ error: "vendorId required for on-behalf upload" }, { status: 400 });
    vendorId = q;
    onBehalf = true;
  } else {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "empty file" }, { status: 400 });
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "file too large (max 25MB)" }, { status: 413 });

  // Extension allow-list + magic-byte check before any parser touches the bytes.
  const typeErr = validateUpload(file.name, bytes);
  if (typeErr) return NextResponse.json({ error: typeErr }, { status: 415 });

  const ev = await saveUpload(vendorId, file.name, bytes);
  // Deterministically extract + cache the file's text (shared by static + AI engines).
  const extraction = await extractFile(file.name, bytes, { ocr: getSettings().static.ocrEnabled });
  const record = { ...ev, hash: extraction.hash, textChars: extraction.chars };
  const submission = await addEvidence(vendorId, controlId, record);
  if (onBehalf) audit(s.username, "uploaded evidence on behalf", `${controlId} · ${vendorId} · ${file.name}`);
  return NextResponse.json({
    evidence: record,
    extracted: { method: extraction.method, chars: extraction.chars, status: extraction.status },
    submission,
  });
}
