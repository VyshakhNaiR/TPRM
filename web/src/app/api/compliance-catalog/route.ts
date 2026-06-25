import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { listCatalog, addCatalogItem, deleteCatalogItem } from "@/lib/compliance";
import { readJson } from "@/lib/http";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

// Org-wide custom compliance list (built-in frameworks + any custom additions).
export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "submission:read:all")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ catalog: listCatalog() });
}

export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJson<{ name?: string; description?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { name, description } = parsed.data;
  if (!name || !name.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const item = await addCatalogItem(name, description);
  audit(s!.username, "added custom compliance", item.name);
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "adjudicate:run")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const itemId = req.nextUrl.searchParams.get("itemId") || "";
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
  const ok = await deleteCatalogItem(itemId);
  if (!ok) return NextResponse.json({ error: "not found or built-in (cannot delete)" }, { status: 404 });
  audit(s!.username, "removed custom compliance", itemId);
  return NextResponse.json({ ok });
}
