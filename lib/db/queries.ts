import "server-only";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./index";
import {
  applicantAliases, claimCharts, classifications, monitorEvents, monitorRuns, patentStatusHistory, patents, settings,
} from "./schema";
import { DEFAULT_SETTINGS, type AppSettings } from "../domain/settings-defaults";

export async function getSettings(db: Db): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) out[r.key] = r.value;
  return out as AppSettings;
}

export async function getActiveAliases(db: Db) {
  return db.select().from(applicantAliases).where(eq(applicantAliases.active, true)).orderBy(applicantAliases.id);
}

/** 목록 필터 — 목록 화면과 CSV 내보내기가 같은 조건을 쓴다 */
export type PatentFilter = {
  q?: string;
  group?: string;
  family?: string;
  layer?: string;
  risk?: string;
  verified?: string;
  yearFrom?: string;
  yearTo?: string;
  sort?: string;
};

export function parseFilter(sp: Record<string, string | string[] | undefined>): PatentFilter {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  return {
    q: one("q"), group: one("group"), family: one("family"), layer: one("layer"), risk: one("risk"),
    verified: one("verified"), yearFrom: one("yearFrom"), yearTo: one("yearTo"), sort: one("sort"),
  };
}

function filterWhere(f: PatentFilter): SQL | undefined {
  const conds: SQL[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "\\$&")}%`;
    const digits = f.q.replace(/\D/g, "");
    conds.push(
      or(ilike(patents.title, like), ...(digits.length >= 4 ? [ilike(patents.appNo, `%${digits}%`)] : []))!,
    );
  }
  if (f.group) conds.push(eq(patents.statusGroup, f.group as "valid"));
  if (f.family) conds.push(eq(patents.family, f.family as "MK3"));
  if (f.layer) conds.push(eq(patents.layer, f.layer as "L1"));
  if (f.risk === "NONE") conds.push(isNull(patents.risk));
  else if (f.risk) conds.push(eq(patents.risk, f.risk as "HIGH"));
  if (f.verified) conds.push(eq(patents.verified, f.verified as "API"));
  if (f.yearFrom) conds.push(gte(patents.appDate, `${f.yearFrom}-01-01`));
  if (f.yearTo) conds.push(lte(patents.appDate, `${f.yearTo}-12-31`));
  return conds.length ? and(...conds) : undefined;
}

const RISK_ORDER = sql`case ${patents.risk} when 'HIGH' then 0 when 'MID' then 1 when 'LOW' then 2 else 3 end`;

function orderBy(sort?: string) {
  switch (sort) {
    case "app_date_asc":
      return [sql`${patents.appDate} asc nulls last`];
    case "risk":
      return [RISK_ORDER, sql`${patents.appDate} desc nulls last`];
    case "title":
      return [patents.title];
    case "reg_date_desc":
      return [sql`${patents.regDate} desc nulls last`];
    default:
      return [sql`${patents.appDate} desc nulls last`];
  }
}

export async function listPatents(db: Db, f: PatentFilter, page = 1, pageSize = 50) {
  const where = filterWhere(f);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(patents).where(where);
  const rows = await db
    .select({
      appNo: patents.appNo, appDate: patents.appDate, title: patents.title, status: patents.status,
      statusGroup: patents.statusGroup, regNo: patents.regNo, family: patents.family, layer: patents.layer,
      risk: patents.risk, riskProvisional: patents.riskProvisional, verified: patents.verified, ipc: patents.ipc,
    })
    .from(patents)
    .where(where)
    .orderBy(...orderBy(f.sort))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { total: n, rows };
}

export async function exportPatents(db: Db, f: PatentFilter) {
  return db.select().from(patents).where(filterWhere(f)).orderBy(...orderBy(f.sort));
}

export async function dashboardStats(db: Db) {
  const [kpi] = await db
    .select({
      total: sql<number>`count(*)::int`,
      valid: sql<number>`count(*) filter (where ${patents.statusGroup} = 'valid')::int`,
      pending: sql<number>`count(*) filter (where ${patents.statusGroup} = 'pending')::int`,
      inactive: sql<number>`count(*) filter (where ${patents.statusGroup} = 'inactive')::int`,
      high: sql<number>`count(*) filter (where ${patents.risk} = 'HIGH')::int`,
      unclassified: sql<number>`count(*) filter (where ${patents.layer} = 'UNCLASSIFIED')::int`,
      notApi: sql<number>`count(*) filter (where ${patents.verified} <> 'API')::int`,
    })
    .from(patents);
  const byFamily = await db
    .select({ key: patents.family, n: sql<number>`count(*)::int` })
    .from(patents).groupBy(patents.family);
  const byLayer = await db
    .select({ key: patents.layer, n: sql<number>`count(*)::int` })
    .from(patents).groupBy(patents.layer);
  const byYear = await db
    .select({
      year: sql<number>`extract(year from ${patents.appDate})::int`,
      group: patents.statusGroup,
      n: sql<number>`count(*)::int`,
    })
    .from(patents)
    .where(sql`${patents.appDate} is not null`)
    .groupBy(sql`1`, patents.statusGroup)
    .orderBy(sql`1`);
  const recentEvents = await db
    .select({
      id: monitorEvents.id, type: monitorEvents.type, appNo: monitorEvents.appNo, before: monitorEvents.before,
      after: monitorEvents.after, createdAt: monitorEvents.createdAt, title: patents.title, risk: patents.risk,
      acknowledged: monitorEvents.acknowledged, runId: monitorEvents.runId,
    })
    .from(monitorEvents)
    .leftJoin(patents, eq(patents.appNo, monitorEvents.appNo))
    .orderBy(desc(monitorEvents.id))
    .limit(5);
  const [lastRun] = await db.select().from(monitorRuns).orderBy(desc(monitorRuns.id)).limit(1);
  return { kpi, byFamily, byLayer, byYear, recentEvents, lastRun };
}

export async function getPatentDetail(db: Db, appNo: string) {
  const [patent] = await db.select().from(patents).where(eq(patents.appNo, appNo));
  if (!patent) return null;
  const [classHistory, charts, history, events] = await Promise.all([
    db.select().from(classifications).where(eq(classifications.appNo, appNo)).orderBy(desc(classifications.id)),
    db.select().from(claimCharts).where(eq(claimCharts.appNo, appNo)).orderBy(desc(claimCharts.id)),
    db.select().from(patentStatusHistory).where(eq(patentStatusHistory.appNo, appNo)).orderBy(desc(patentStatusHistory.id)),
    db.select().from(monitorEvents).where(eq(monitorEvents.appNo, appNo)).orderBy(desc(monitorEvents.id)),
  ]);
  return { patent, classHistory, charts, history, events };
}

export async function latestElementCounts(db: Db, appNos: string[]) {
  if (appNos.length === 0) return new Map<string, number>();
  const rows = await db
    .selectDistinctOn([claimCharts.appNo], { appNo: claimCharts.appNo, n: claimCharts.elementCount })
    .from(claimCharts)
    .where(inArray(claimCharts.appNo, appNos))
    .orderBy(claimCharts.appNo, desc(claimCharts.id));
  return new Map(rows.map((r) => [r.appNo, r.n]));
}

export async function listRuns(db: Db, limit = 50) {
  return db.select({
    id: monitorRuns.id, trigger: monitorRuns.trigger, startedAt: monitorRuns.startedAt, finishedAt: monitorRuns.finishedAt,
    state: monitorRuns.state, stats: monitorRuns.stats, apiCalls: monitorRuns.apiCalls, error: monitorRuns.error,
  }).from(monitorRuns).orderBy(desc(monitorRuns.id)).limit(limit);
}

export async function listEvents(db: Db, opts: { runId?: number; onlyOpen?: boolean; limit?: number } = {}) {
  const conds: SQL[] = [];
  if (opts.runId) conds.push(eq(monitorEvents.runId, opts.runId));
  if (opts.onlyOpen) conds.push(eq(monitorEvents.acknowledged, false));
  return db
    .select({
      id: monitorEvents.id, runId: monitorEvents.runId, type: monitorEvents.type, appNo: monitorEvents.appNo,
      before: monitorEvents.before, after: monitorEvents.after, acknowledged: monitorEvents.acknowledged,
      createdAt: monitorEvents.createdAt, title: patents.title, status: patents.status, family: patents.family,
      layer: patents.layer, risk: patents.risk, riskProvisional: patents.riskProvisional,
    })
    .from(monitorEvents)
    .leftJoin(patents, eq(patents.appNo, monitorEvents.appNo))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(monitorEvents.id))
    .limit(opts.limit ?? 200);
}
