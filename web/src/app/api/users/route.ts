import { NextResponse } from "next/server";
import { currentSession, can, USERS } from "@/lib/auth";
import { getSubmission } from "@/lib/store";
import { listVendors } from "@/lib/users";
import { CONTROLS } from "@/data/seed";

export const runtime = "nodejs";

function vendorActivity(vendorId: string, base: any) {
  const sub = getSubmission(vendorId);
  const answered = CONTROLS.filter((c) => sub.answers[c.id] && (sub.answers[c.id].response?.trim() || sub.answers[c.id].applicable === false)).length;
  return { ...base, status: sub.status, answered, total: CONTROLS.length, updatedAt: sub.updatedAt };
}

export async function GET() {
  const s = await currentSession();
  if (!can(s?.role, "users:read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const seeded = Object.values(USERS).map((u) => {
    const base = { username: u.session.username, name: u.session.name, role: u.session.role, vendorId: u.session.vendorId, onboarded: false };
    return u.session.role === "vendor" && u.session.vendorId ? vendorActivity(u.session.vendorId, base) : base;
  });
  // Dynamically onboarded vendors
  const onboarded = listVendors().map((v) =>
    vendorActivity(v.vendorId, { username: v.username, name: v.name, role: "vendor", vendorId: v.vendorId, onboarded: true, country: v.profile.country, service: v.profile.serviceDescription, tier: v.profile.tier })
  );

  return NextResponse.json({ users: [...seeded, ...onboarded], canManage: can(s?.role, "users:manage") });
}
