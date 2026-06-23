import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { getSubmission, saveAnswer, submitAll, type Answer } from "@/lib/store";
import { CONTROLS } from "@/data/seed";
import { readJson, asBool } from "@/lib/http";

export const runtime = "nodejs";

const MAX_RESPONSE_CHARS = 20_000;

// Vendors act on their own submission; assessors may read a vendor's (?vendorId=).
async function resolveVendorId(req: NextRequest, write: boolean) {
  const s = await currentSession();
  if (!s) return { error: "unauthenticated" as const };
  if (s.role === "vendor") return { vendorId: s.vendorId! };
  if (write) return { error: "forbidden" as const }; // assessors don't write vendor answers
  const q = req.nextUrl.searchParams.get("vendorId");
  return { vendorId: q || "apex" };
}

export async function GET(req: NextRequest) {
  const r = await resolveVendorId(req, false);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  return NextResponse.json(getSubmission(r.vendorId));
}

export async function POST(req: NextRequest) {
  const r = await resolveVendorId(req, true);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  const parsed = await readJson<{ controlId?: string; response?: unknown; applicable?: unknown; justification?: unknown }>(req);
  if ("error" in parsed) return parsed.error;
  const { controlId, response, applicable, justification } = parsed.data;
  if (!controlId || !CONTROLS.some((c) => c.id === controlId)) {
    return NextResponse.json({ error: "valid controlId required" }, { status: 400 });
  }
  const patch: Partial<Answer> = {};
  if (response !== undefined) patch.response = String(response ?? "").slice(0, MAX_RESPONSE_CHARS);
  if (applicable !== undefined) {
    const b = asBool(applicable);
    if (b === undefined) return NextResponse.json({ error: "applicable must be a boolean" }, { status: 400 });
    patch.applicable = b;
  }
  if (justification !== undefined) patch.justification = String(justification ?? "").slice(0, MAX_RESPONSE_CHARS);
  return NextResponse.json(await saveAnswer(r.vendorId, controlId, patch));
}

export async function PUT(req: NextRequest) {
  const r = await resolveVendorId(req, true);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  return NextResponse.json(await submitAll(r.vendorId));
}
