/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output => portable Docker image, runs on any host (not Vercel-locked).
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
