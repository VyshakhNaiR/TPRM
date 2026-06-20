import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { addEvidence } from "@/lib/store";
import { saveUpload } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!s || s.role !== "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const controlId = form.get("controlId") as string | null;
  if (!file || !controlId) return NextResponse.json({ error: "file and controlId required" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "file too large" }, { status: 413 });

  const ev = await saveUpload(s.vendorId!, file.name, bytes);
  const submission = addEvidence(s.vendorId!, controlId, ev);
  return NextResponse.json({ evidence: ev, submission });
}
