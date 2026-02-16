import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['puppeteer-extra', 'puppeteer-extra-plugin-stealth'],
};

export default nextConfig;
