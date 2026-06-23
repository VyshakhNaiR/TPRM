import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { parseSbom } from "@/lib/sbom";

export const runtime = "nodejs";

const MAX_SBOM_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_SBOM_BYTES) return NextResponse.json({ error: "SBOM file too large (max 15MB)" }, { status: 413 });
  return NextResponse.json(parseSbom(buf.toString("utf8")));
}
