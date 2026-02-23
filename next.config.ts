import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  reactCompiler: true,
  serverExternalPackages: ['puppeteer-extra', 'puppeteer-extra-plugin-stealth'],
  allowedDevOrigins: ["nonconducive-suppletory-ha.ngrok-free.dev"],
};

export default nextConfig;
