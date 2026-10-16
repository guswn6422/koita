import { sql } from "drizzle-orm";
import {
  pgTable, text, date, timestamp, boolean, jsonb, pgEnum, integer, serial, numeric, index,
} from "drizzle-orm/pg-core";

export const family = pgEnum("family", ["NO96", "MK3", "FLEX", "SLIM", "GST", "ETC", "UNCLASSIFIED"]);
export const layer = pgEnum("layer", ["L1", "L2", "L3", "L4", "UNCLASSIFIED"]);
export const risk = pgEnum("risk", ["HIGH", "MID", "LOW"]);
export const statusGroup = pgEnum("status_group", ["valid", "pending", "inactive"]);
export const verified = pgEnum("verified", ["API", "WEB", "UNVERIFIED"]);
export const classSource = pgEnum("class_source", ["AI", "MANUAL"]);
export const claimSource = pgEnum("claim_source", ["API", "MANUAL_INPUT"]);
export const runTrigger = pgEnum("run_trigger", ["CRON", "MANUAL"]);
export const runState = pgEnum("run_state", ["RUNNING", "DONE", "FAILED", "PARTIAL"]);
export const eventType = pgEnum("event_type", ["NEW", "STATUS_CHANGED", "REG_NO_ASSIGNED"]);

/** 기준 테이블 — PK = 출원번호 */
export const patents = pgTable(
  "patents",
  {
    appNo: text("app_no").primaryKey(),
    appDate: date("app_date"),
    title: text("title").notNull(),
    applicant: text("applicant"),
    ipc: text("ipc").array(),
    pubNo: text("pub_no"),
    pubDate: date("pub_date"),
    regNo: text("reg_no"),
    regDate: date("reg_date"),
    status: text("status"),
    statusGroup: statusGroup("status_group"),
    abstract: text("abstract"),
    family: family("family").default("UNCLASSIFIED").notNull(),
    layer: layer("layer").default("UNCLASSIFIED").notNull(),
    risk: risk("risk"),
    riskProvisional: boolean("risk_provisional").default(true).notNull(),
    verified: verified("verified").default("UNVERIFIED").notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow().notNull(),
    lastChecked: timestamp("last_checked", { withTimezone: true }),
    raw: jsonb("raw"),
  },
  (t) => [
    index("patents_status_risk_idx").on(t.statusGroup, t.risk),
    index("patents_family_layer_idx").on(t.family, t.layer),
    index("patents_app_date_idx").on(t.appDate.desc()),
    index("patents_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
  ],
);

/** 분류 근거 보존 (Skill Step 4) */
export const classifications = pgTable("classifications", {
  id: serial("id").primaryKey(),
  appNo: text("app_no").notNull().references(() => patents.appNo, { onDelete: "cascade" }),
  family: family("family").notNull(),
  layer: layer("layer").notNull(),
  evidence: jsonb("evidence").$type<{ family: string[]; layer: string[] }>(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  model: text("model"),
  promptVersion: text("prompt_version"),
  source: classSource("source").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClaimElement = { label: string; gist: string; meaning: string; avoid_points: string[] };

/** 청구항 분해 (Skill Step 5) */
export const claimCharts = pgTable("claim_charts", {
  id: serial("id").primaryKey(),
  appNo: text("app_no").notNull().references(() => patents.appNo, { onDelete: "cascade" }),
  claimNo: integer("claim_no").notNull(),
  otherIndependent: integer("other_independent").array(),
  elements: jsonb("elements").$type<ClaimElement[]>().notNull(),
  elementCount: integer("element_count").notNull(),
  keyLimiting: text("key_limiting"),
  reviewIdeas: text("review_ideas"),
  claimSource: claimSource("claim_source").notNull(),
  model: text("model"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 모니터링 회차 */
export const monitorRuns = pgTable("monitor_runs", {
  id: serial("id").primaryKey(),
  trigger: runTrigger("trigger").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  state: runState("state").default("RUNNING").notNull(),
  cursor: jsonb("cursor").$type<{ aliasIndex: number; page: number } | null>(),
  stats: jsonb("stats").$type<RunStats>(),
  apiCalls: integer("api_calls").default(0).notNull(),
  error: text("error"),
  reportMd: text("report_md"),
});

export type RunStats = { fetched: number; added: number; changed: number; high: number };

/** 상태 변경 이력 — 덮어쓰지 않고 남긴다 */
export const patentStatusHistory = pgTable("patent_status_history", {
  id: serial("id").primaryKey(),
  appNo: text("app_no").notNull().references(() => patents.appNo, { onDelete: "cascade" }),
  runId: integer("run_id").references(() => monitorRuns.id, { onDelete: "set null" }),
  field: text("field").notNull(), // status | reg_no
  before: text("before"),
  after: text("after"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 회차별 감지 결과 */
export const monitorEvents = pgTable("monitor_events", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => monitorRuns.id, { onDelete: "cascade" }),
  appNo: text("app_no").notNull().references(() => patents.appNo, { onDelete: "cascade" }),
  type: eventType("type").notNull(),
  before: text("before"),
  after: text("after"),
  acknowledged: boolean("acknowledged").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 출원인 표기 변형 — 검색 기준을 코드 밖으로 분리 */
export const applicantAliases = pgTable("applicant_aliases", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  active: boolean("active").default(true).notNull(),
  lastHitCount: integer("last_hit_count"),
  note: text("note"),
});

/** 키-값 설정 (보조 IPC, 위험도 임계값, ROWS·MAX_PAGES 등) */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Patent = typeof patents.$inferSelect;
export type NewPatent = typeof patents.$inferInsert;
export type MonitorRun = typeof monitorRuns.$inferSelect;
export type MonitorEvent = typeof monitorEvents.$inferSelect;
export type ClaimChart = typeof claimCharts.$inferSelect;
export type Classification = typeof classifications.$inferSelect;
