import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 로컬 데모용 내장 Postgres(PGlite)는 번들하지 않고 Node에서 그대로 로드한다
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
