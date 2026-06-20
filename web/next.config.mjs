/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output => portable Docker image, runs on any host (not Vercel-locked).
  output: "standalone",
  reactStrictMode: true,
  // Heavy node-only extractors run in API routes; don't bundle them.
  serverExternalPackages: ["pdf-parse", "mammoth", "tesseract.js"],
};

export default nextConfig;
