import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // JSON backups uploaded through the import action can exceed the 1 MB default.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
