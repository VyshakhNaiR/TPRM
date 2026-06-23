import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { getSettings, saveSettings, maskSettings, CATEGORIES, LOCAL_PROVIDERS, INTEGRATED_PROVIDERS } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

const SETTINGS_ERR: Record<string, string> = {
  invalid_category: "Invalid processing category.",
  invalid_provider: "Invalid provider selection.",
  invalid_base_url: "The provider base URL is not a valid HTTP(S) URL.",
  private_base_url: "Private/loopback base URLs are not allowed for cloud providers in production.",
};

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
  const parsed = await readJson(req);
  if ("error" in parsed) return parsed.error;
  try {
    // saveSettings validates enums/URLs, drops blank apiKeys, and encrypts at rest.
    const next = saveSettings(parsed.data);
    audit(s!.username, "updated processing settings", `engine: ${next.category}`);
    return NextResponse.json({ settings: maskSettings(next) });
  } catch (e: any) {
    return NextResponse.json({ error: SETTINGS_ERR[e?.message] || "Failed to save settings." }, { status: 400 });
  }
}
