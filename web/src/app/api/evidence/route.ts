import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { getExtractionByHash } from "@/lib/extract";
import { evidenceHashOwner } from "@/lib/store";
import { CONTROLS } from "@/data/seed";
import { keywords } from "@/lib/keywords";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const hash = req.nextUrl.searchParams.get("hash") || undefined;
  const controlId = req.nextUrl.searchParams.get("controlId") || "";
  const control = CONTROLS.find((c) => c.id === controlId);

  // Only serve extracted text for a hash that was actually uploaded as evidence
  // (blocks a hash-oracle over the global extraction cache).
  if (!hash || !evidenceHashOwner(hash)) {
    return NextResponse.json({ text: "", method: "none", chars: 0, keywords: control ? keywords(control.rfi) : [] });
  }
  const ex = getExtractionByHash(hash);
  return NextResponse.json({
    text: ex?.text?.slice(0, 8000) ?? "",
    method: ex?.method ?? "none",
    chars: ex?.chars ?? 0,
    keywords: control ? keywords(control.rfi) : [],
  });
}
