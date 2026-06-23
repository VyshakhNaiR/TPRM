// Central runtime configuration + production gating.
//
// Design principle: the DEMO must run with zero config, but PRODUCTION
// (NODE_ENV=production, or explicit flags) must enforce every hardening.
// Anything that would be a security hole in prod is gated here and fails
// loudly (or falls back to a safe default) rather than shipping silently.

export const IS_PROD = process.env.NODE_ENV === "production";

const DEV_SECRET = "dev-only-secret-change-me";

// Lazy so `next build` (which runs with NODE_ENV=production) doesn't throw at
// module-load time — the secret is only required when auth is actually exercised.
let _secret: string | undefined;
export function sessionSecret(): string {
  if (_secret !== undefined) return _secret;
  const s = process.env.SESSION_SECRET;
  if (IS_PROD && (!s || s === DEV_SECRET)) {
    throw new Error(
      "SESSION_SECRET must be set to a strong, unique value in production " +
        "(generate with: openssl rand -hex 32). Refusing to use the public dev default."
    );
  }
  _secret = s || DEV_SECRET;
  return _secret;
}

// Seeded demo accounts (root/dbs/apex/viewer with password "demo") are a
// convenience for showing the product. They are ON in dev, and OFF in prod
// unless an operator explicitly opts back in.
export const ALLOW_DEMO_ACCOUNTS =
  process.env.ALLOW_DEMO_ACCOUNTS === "true" || !IS_PROD;

// Vendor self-onboarding without an invite is fine for the demo, but in prod an
// invite token issued by an assessor/root is required.
export const REQUIRE_INVITE = process.env.REQUIRE_INVITE === "true" || IS_PROD;

// Allow LLM base URLs that resolve to private/loopback ranges. Needed for local
// Ollama in any env; for cloud providers it's blocked in prod (SSRF guard).
export const ALLOW_PRIVATE_LLM_URL =
  process.env.ALLOW_PRIVATE_LLM_URL === "true" || !IS_PROD;

// Key used to encrypt provider API keys at rest in the file store. Derived from
// a dedicated var if present, else the session secret. In prod, getting here
// implies sessionSecret() already validated.
export function encryptionKey(): string {
  return process.env.ENCRYPTION_KEY || sessionSecret();
}

// Audit retention cap for the demo file store (prod should forward to a WORM
// store / SIEM — see lib/audit.ts).
export const AUDIT_CAP = Number(process.env.AUDIT_CAP || 5000);

// Per-IP request budget for sensitive endpoints (see middleware.ts).
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 20);
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
