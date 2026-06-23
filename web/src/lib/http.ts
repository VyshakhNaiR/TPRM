import { NextRequest, NextResponse } from "next/server";

// Safely parse a JSON request body. Returns the parsed object, or a 400
// NextResponse the caller should return as-is. Prevents an unhandled
// SyntaxError (malformed/empty body) from surfacing as an opaque 500.
export async function readJson<T = Record<string, unknown>>(
  req: NextRequest
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const data = (await req.json()) as T;
    if (data === null || typeof data !== "object") {
      return { error: NextResponse.json({ error: "invalid request body" }, { status: 400 }) };
    }
    return { data };
  } catch {
    return { error: NextResponse.json({ error: "invalid JSON body" }, { status: 400 }) };
  }
}

// Coerce an arbitrary value to a strict boolean (so `"false"` / `"true"` strings
// from a loose client don't get stored as truthy strings).
export function asBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}
