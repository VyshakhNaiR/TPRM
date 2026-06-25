import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { listObligations, createObligation, updateObligation, deleteObligation, type Recurrence, type ObligationStatus } from "@/lib/compliance";
import { readJson } from "@/lib/http";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const RECUR = new Set<Recurrence>(["none", "monthly", "quarterly", "annual"]);
const STATUS = new Set<ObligationStatus>(["open", "in_progress", "done"]);
const SOURCE = new Set(["contract", "regulation", "finding", "manual"]);

export async function GET(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vendorId = req.nextUrl.searchParams.get("vendorId") || "apex";
  return NextResponse.json({ obligations: listObligations(vendorId) });
}

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJson<any>(req);
  if ("error" in parsed) return parsed.error;
  const b = parsed.data;
  if (!b.vendorId || !b.title?.trim()) return NextResponse.json({ error: "vendorId and title required" }, { status: 400 });
  const o = await createObligation({
    vendorId: b.vendorId,
    title: String(b.title).trim().slice(0, 300),
    description: String(b.description || "").slice(0, 4000),
    owner: String(b.owner || "").slice(0, 200),
    dueDate: b.dueDate || undefined,
    recurrence: RECUR.has(b.recurrence) ? b.recurrence : "none",
    source: SOURCE.has(b.source) ? b.source : "manual",
    status: STATUS.has(b.status) ? b.status : "open",
  });
  audit(s!.username, "added obligation", `${o.title} · ${b.vendorId}`);
  return NextResponse.json({ obligation: o });
}

export async function PATCH(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJson<any>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, obligationId, ...patch } = parsed.data;
  if (!vendorId || !obligationId) return NextResponse.json({ error: "vendorId and obligationId required" }, { status: 400 });
  if (patch.status && !STATUS.has(patch.status)) delete patch.status;
  if (patch.recurrence && !RECUR.has(patch.recurrence)) delete patch.recurrence;
  const o = await updateObligation(vendorId, obligationId, patch);
  if (!o) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ obligation: o });
}

export async function DELETE(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const vendorId = req.nextUrl.searchParams.get("vendorId") || "";
  const obligationId = req.nextUrl.searchParams.get("obligationId") || "";
  if (!vendorId || !obligationId) return NextResponse.json({ error: "vendorId and obligationId required" }, { status: 400 });
  const ok = await deleteObligation(vendorId, obligationId);
  return NextResponse.json({ ok });
}
