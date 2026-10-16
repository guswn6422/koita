import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

/**
 * DB 클라이언트
 * - 단건 조회: neon-http (가장 빠름, 트랜잭션 없음)
 * - 원자성이 필요한 배치(모니터링 비교 → 이벤트 → 기준 갱신): neon-serverless Pool
 * - DATABASE_URL이 없으면 로컬 데모용 PGlite(내장 Postgres, .data/pglite)로 동작한다
 *
 * 두 드라이버의 쿼리 빌더 API는 같으므로 하나의 타입(Db)으로 다룬다.
 */
export type Db = NeonDatabase<typeof schema>;

type Clients = { read: Db; tx: Db; kind: "neon" | "pglite" };

const g = globalThis as unknown as { __gttDb?: Promise<Clients> };

async function init(): Promise<Clients> {
  const url = process.env.DATABASE_URL;
  if (url) {
    neonConfig.webSocketConstructor = ws;
    const read = drizzleHttp(neon(url), { schema }) as unknown as Db;
    const tx = drizzlePool(new Pool({ connectionString: url }), { schema });
    await seedIfEmpty(tx);
    return { read, tx, kind: "neon" };
  }

  // 로컬 데모 모드 — 마이그레이션을 자동 적용한다
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir, { extensions: { pg_trgm } });
  const lite = drizzleLite(client, { schema });
  await migrate(lite, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const db = lite as unknown as Db;
  await seedIfEmpty(db);
  return { read: db, tx: db, kind: "pglite" };
}

function clients() {
  if (!g.__gttDb) {
    g.__gttDb = init().catch((e) => {
      g.__gttDb = undefined;
      throw e;
    });
  }
  return g.__gttDb;
}

/** 단건 조회용 */
export async function getDb(): Promise<Db> {
  return (await clients()).read;
}

/** 트랜잭션용 (Pool) */
export async function getTxDb(): Promise<Db> {
  return (await clients()).tx;
}

export async function dbKind() {
  return (await clients()).kind;
}
