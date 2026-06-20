import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { getExtractionByHash } from "@/lib/extract";
import { CONTROLS } from "@/data/seed";

export const runtime = "nodejs";

const STOP = new Set(["the", "and", "for", "with", "your", "that", "this", "have", "from", "provide", "evidence", "policy", "approved", "most", "recent", "copy", "level", "appropriate", "management", "their", "which", "into", "used", "data", "such", "where", "been", "will", "shall", "must", "please", "share", "list", "sample", "details", "document", "documented"]);
function keywords(rfi: string): string[] {
  return Array.from(new Set(rfi.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 4 && !STOP.has(w)))).slice(0, 8);
}

export async function GET(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const hash = req.nextUrl.searchParams.get("hash") || undefined;
  const controlId = req.nextUrl.searchParams.get("controlId") || "";
  const ex = getExtractionByHash(hash);
  const control = CONTROLS.find((c) => c.id === controlId);
  return NextResponse.json({
    text: ex?.text?.slice(0, 8000) ?? "",
    method: ex?.method ?? "none",
    chars: ex?.chars ?? 0,
    keywords: control ? keywords(control.rfi) : [],
  });
}
