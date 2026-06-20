import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ session: await currentSession() });
}
