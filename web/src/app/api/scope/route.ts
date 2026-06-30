import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { getVendorProfile, updateVendorProfile } from "@/lib/users";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

// GET — vendor reads their own scope; assessor/root can read any vendor's scope
export async function GET(req: NextRequest) {
  const s = await currentSession();
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const vendorId = s.role === "vendor"
    ? s.vendorId!
    : (req.nextUrl.searchParams.get("vendorId") || "");

  if (!vendorId) return NextResponse.json({ error: "vendorId required" }, { status: 400 });
  if (s.role !== "vendor" && !can(s.role, "submission:read:all")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const profile = getVendorProfile(vendorId);
  if (!profile) return NextResponse.json({ error: "vendor not found" }, { status: 404 });

  return NextResponse.json({
    scope: profile.assessmentScope ?? { assets: [], applications: [], services: [] },
  });
}

// PUT — vendor updates their own scope
export async function PUT(req: NextRequest) {
  const s = await currentSession();
  if (!s || s.role !== "vendor") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJson<{ scope?: any }>(req);
  if ("error" in parsed) return parsed.error;
  const { scope } = parsed.data;

  if (!scope || typeof scope !== "object") {
    return NextResponse.json({ error: "scope object required" }, { status: 400 });
  }

  const sanitized = {
    assets: (Array.isArray(scope.assets) ? scope.assets : []).map((a: any) => ({
      name: String(a.name || "").slice(0, 200),
      type: String(a.type || "").slice(0, 100),
      description: String(a.description || "").slice(0, 500),
    })),
    applications: (Array.isArray(scope.applications) ? scope.applications : []).map((a: any) => ({
      name: String(a.name || "").slice(0, 200),
      url: String(a.url || "").slice(0, 500),
      description: String(a.description || "").slice(0, 500),
    })),
    services: (Array.isArray(scope.services) ? scope.services : []).map((a: any) => ({
      name: String(a.name || "").slice(0, 200),
      description: String(a.description || "").slice(0, 500),
    })),
  };

  await updateVendorProfile(s.vendorId!, { assessmentScope: sanitized });
  return NextResponse.json({ ok: true, scope: sanitized });
}
