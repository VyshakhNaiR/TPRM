import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { parseSbom } from "@/lib/sbom";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
  return NextResponse.json(parseSbom(text));
}
