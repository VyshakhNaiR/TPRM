import { NextRequest, NextResponse } from "next/server";
import { currentSession, can } from "@/lib/auth";
import { addUserToVendor } from "@/lib/users";
import { audit } from "@/lib/audit";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";

// Root or assessor can add additional login accounts to an existing vendor.
// All accounts for the same vendorId share the same submission workspace.
export async function POST(req: NextRequest) {
  const s = await currentSession();
  if (!can(s?.role, "users:manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJson<{ vendorId?: string; email?: string; password?: string; name?: string }>(req);
  if ("error" in parsed) return parsed.error;
  const { vendorId, email, password, name } = parsed.data;

  if (!vendorId || !email || !password) {
    return NextResponse.json({ error: "vendorId, email, and password required" }, { status: 400 });
  }

  try {
    const session = await addUserToVendor({ vendorId, email, password, name });
    audit(s!.username, "added vendor user", `${email} → ${vendorId}`);
    return NextResponse.json({ ok: true, username: session.username });
  } catch (e: any) {
    const msg = e?.message;
    if (msg === "vendor_not_found") return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
    if (msg === "exists") return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    if (msg === "invalid_email") return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    if (msg === "weak_password") return NextResponse.json({ error: e.message }, { status: 400 });
    return NextResponse.json({ error: "Could not create user." }, { status: 500 });
  }
}
