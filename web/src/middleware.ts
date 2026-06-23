import { NextRequest, NextResponse } from "next/server";

// Edge middleware: per-IP rate limiting on auth endpoints + same-origin check on
// all mutating API requests (defense-in-depth CSRF on top of SameSite=strict).
// In-memory counters are per-instance — fine for the demo / single standalone
// server. PRODUCTION: back this with Redis for multi-instance correctness.

const RATE_MAX = Number(process.env.RATE_LIMIT_MAX || 20);
const RATE_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const buckets = new Map<string, { count: number; reset: number }>();

const RATE_LIMITED = ["/api/login", "/api/onboard"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip")) || "unknown";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + RATE_WINDOW });
    return false;
  }
  b.count++;
  return b.count > RATE_MAX;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Same-origin enforcement for mutating API calls (skip GET/HEAD).
  if (pathname.startsWith("/api/") && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.get("host")) {
          return NextResponse.json({ error: "cross-origin request blocked" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "bad origin" }, { status: 403 });
      }
    }
  }

  // Rate limit auth endpoints.
  if (RATE_LIMITED.some((p) => pathname.startsWith(p)) && req.method === "POST") {
    if (rateLimited(`${clientIp(req)}:${pathname}`)) {
      return NextResponse.json({ error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
