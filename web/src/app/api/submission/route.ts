import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { getSubmission, saveAnswer, submitAll } from "@/lib/store";

export const runtime = "nodejs";

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
  const { controlId, response, applicable, justification } = await req.json();
  if (!controlId) return NextResponse.json({ error: "controlId required" }, { status: 400 });
  const patch: any = {};
  if (response !== undefined) patch.response = response;
  if (applicable !== undefined) patch.applicable = applicable;
  if (justification !== undefined) patch.justification = justification;
  return NextResponse.json(saveAnswer(r.vendorId, controlId, patch));
}

export async function PUT(req: NextRequest) {
  const r = await resolveVendorId(req, true);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "unauthenticated" ? 401 : 403 });
  return NextResponse.json(submitAll(r.vendorId));
}
