import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { getSettings, saveSettings, maskSettings, CATEGORIES, LOCAL_PROVIDERS, INTEGRATED_PROVIDERS } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "settings:read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({
    settings: maskSettings(getSettings()),
    categories: CATEGORIES,
    localProviders: LOCAL_PROVIDERS,
    integratedProviders: INTEGRATED_PROVIDERS,
    canManage: can(s?.role, "settings:manage"),
  });
}

export async function PUT(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "settings:manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // saveSettings does the safe merge (and drops blank apiKeys so saved tokens aren't wiped).
  return NextResponse.json({ settings: maskSettings(saveSettings(await req.json())) });
}
