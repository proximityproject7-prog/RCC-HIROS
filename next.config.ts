import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,

  // ── Dev Stability: Allow cross-origin requests from preview panel ──
  allowedDevOrigins: [
    "localhost",
  ],

  // ── Dev Stability: Silence Turbopack warning (Next.js 16 uses Turbopack by default) ──
  turbopack: {},

  // ── Dev Stability: External packages that shouldn't be bundled ──
  serverExternalPackages: ["sharp"],

  // ── Dev Stability: Optimize package imports to reduce memory ──
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@radix-ui/react-icons",
      "date-fns",
    ],
  },
};

export default nextConfig;
