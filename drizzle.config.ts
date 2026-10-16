import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // 마이그레이션은 풀러를 거치지 않는 직접 연결을 쓴다
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
  },
});
