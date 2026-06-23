/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

// Security headers applied to every response. CSP is strict in production; in
// development it additionally allows 'unsafe-eval' and websocket connections,
// which Next.js / Turbopack's dev runtime + HMR require (React uses eval() in
// dev only — never in production).
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";
const connectSrc = isDev
  ? "connect-src 'self' ws: wss:"
  : "connect-src 'self'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  connectSrc,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS only matters over HTTPS; harmless on plain-HTTP LAN/dev.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig = {
  // Standalone output => portable Docker image, runs on any host (not Vercel-locked).
  output: "standalone",
  reactStrictMode: true,
  // Heavy node-only extractors run in API routes; don't bundle them.
  serverExternalPackages: ["pdf-parse", "mammoth", "tesseract.js"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
