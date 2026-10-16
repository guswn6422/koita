import "server-only";
import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { getDb, getTxDb } from "../db";
import { applicantAliases, monitorRuns, patents, type MonitorRun, type RunStats } from "../db/schema";
import { getActiveAliases, getSettings, listEvents } from "../db/queries";
import { collectByAliases } from "../kipris/search";
import { dedupe } from "../kipris/normalize";
import { KiprisError, maskKey, type CallMeter } from "../kipris/client";
import { monitorReport } from "../report/markdown";
import { notifySlack } from "../notify/slack";
import { applyRecords } from "./sync";
import { classifyPending } from "./classify";
import { recomputeRisk } from "./risk";
import { analyzePatent } from "./analyze";

const STALE_MS = 15 * 60_000;

function kstDayStart(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3600_000);
}

/**
 * 진행 중(PARTIAL 또는 오래된 RUNNING) 회차가 있으면 이어서, 없으면 새 회차를 연다.
 * 멱등성: Cron 트리거는 같은 날(KST) 이미 DONE인 회차가 있으면 건너뛴다(null 반환).
 */
export async function startOrResumeRun(trigger: "CRON" | "MANUAL"): Promise<MonitorRun | null> {
  const db = await getDb();
  if (trigger === "CRON") {
    const [doneToday] = await db
      .select({ id: monitorRuns.id })
      .from(monitorRuns)
      .where(and(eq(monitorRuns.state, "DONE"), gte(monitorRuns.startedAt, kstDayStart())))
      .limit(1);
    if (doneToday) return null;
  }
  const [open] = await db
    .select()
    .from(monitorRuns)
    .where(
      or(
        eq(monitorRuns.state, "PARTIAL"),
        and(eq(monitorRuns.state, "RUNNING"), lt(monitorRuns.startedAt, new Date(Date.now() - STALE_MS))),
      ),
    )
    .orderBy(desc(monitorRuns.id))
    .limit(1);
  if (open) {
    const [resumed] = await db.update(monitorRuns).set({ state: "RUNNING" }).where(eq(monitorRuns.id, open.id)).returning();
    return resumed;
  }
  const [running] = await db
    .select({ id: monitorRuns.id })
    .from(monitorRuns)
    .where(eq(monitorRuns.state, "RUNNING"))
    .limit(1);
  if (running) throw new Error(`회차 #${running.id}가 실행 중입니다. 끝난 뒤 다시 시도하세요.`);
  const [created] = await db.insert(monitorRuns).values({ trigger, stats: { fetched: 0, added: 0, changed: 0, high: 0 } }).returning();
  return created;
}

/**
 * 모니터링 1회차: 수집 → diff → 이벤트 → 분류 → 위험도 → (상이면 청구항 분해) → 보고서 → 알림
 * 마감 시각이 오면 cursor를 저장하고 PARTIAL로 끝낸다.
 */
export async function runMonitor(run: MonitorRun, deadline: number) {
  const db = await getDb();
  const settings = await getSettings(db);
  const aliases = await getActiveAliases(db);
  const meter: CallMeter = { calls: 0 };
  const prev: RunStats = run.stats ?? { fetched: 0, added: 0, changed: 0, high: 0 };
  let state: "DONE" | "PARTIAL" | "FAILED" = "DONE";
  let error: string | null = null;
  let cursor = run.cursor ?? null;
  const stats: RunStats = { ...prev };

  try {
    if (aliases.length === 0) throw new Error("활성화된 출원인 별칭이 없습니다.");
    const result = await collectByAliases({
      aliases: aliases.map((a) => a.name),
      rows: settings.rows,
      maxPages: settings.max_pages,
      start: cursor,
      deadline,
      meter,
    });
    cursor = result.cursor;
    for (const a of aliases) {
      if (a.name in result.hitsByAlias) {
        await db.update(applicantAliases).set({ lastHitCount: result.hitsByAlias[a.name] }).where(eq(applicantAliases.id, a.id));
      }
    }
    const records = dedupe(result.records);
    const txDb = await getTxDb();
    const { events, replacedSeeds } = await applyRecords(txDb, records, { runId: run.id, recordEvents: true });
    stats.fetched += result.records.length;
    stats.added += events.filter((e) => e.type === "NEW").length;
    stats.changed += events.filter((e) => e.type !== "NEW").length;

    const touched = [...new Set([...events.map((e) => e.appNo), ...replacedSeeds])];
    // 신규·변경 건 분류 (분류 이력이 없는 것만) → 위험도
    if (touched.length && process.env.ANTHROPIC_API_KEY) {
      await classifyPending(db, { appNos: touched, limit: touched.length, deadline, highMax: settings.high_max_elements });
    }
    const risks = await recomputeRisk(db, touched, settings.high_max_elements);
    const newHigh = risks.filter((r) => r.risk === "HIGH" && events.some((e) => e.appNo === r.appNo && e.type === "NEW"));
    stats.high += risks.filter((r) => r.risk === "HIGH").length;

    // 위험도 '상' 신규 건은 청구항 분해까지 (시간·비용 한도 안에서)
    if (process.env.ANTHROPIC_API_KEY) {
      for (const h of newHigh.slice(0, settings.auto_analyze_limit)) {
        if (Date.now() > deadline) break;
        try {
          await analyzePatent(db, h.appNo, { meter });
        } catch {
          /* 분해 실패는 회차 실패로 보지 않는다 — 상세 화면에서 재시도 */
        }
      }
    }
    if (cursor) state = "PARTIAL";
  } catch (e) {
    state = "FAILED";
    error = e instanceof KiprisError ? e.message : maskKey(e instanceof Error ? e.message : String(e));
  }

  // 회차 보고서 (이 회차의 모든 이벤트 기준)
  const [previousDone] = await db
    .select({ startedAt: monitorRuns.startedAt })
    .from(monitorRuns)
    .where(and(eq(monitorRuns.state, "DONE"), lt(monitorRuns.id, run.id)))
    .orderBy(desc(monitorRuns.id))
    .limit(1);
  const events = await listEvents(db, { runId: run.id, limit: 1000 });
  const apiCalls = run.apiCalls + meter.calls;
  const reportMd = monitorReport({
    startedAt: run.startedAt,
    previousCheck: previousDone?.startedAt ?? null,
    aliases: aliases.map((a) => a.name),
    events: events.reverse().map((e) => ({
      type: e.type, appNo: e.appNo, before: e.before, after: e.after,
      patent: e.title ? { title: e.title, status: e.status, family: e.family!, layer: e.layer!, risk: e.risk, riskProvisional: e.riskProvisional! } : null,
    })),
    state: state === "PARTIAL" ? "PARTIAL(이어서 실행 필요)" : state,
    apiCalls,
    error,
  });
  stats.high = events.filter((e) => e.risk === "HIGH").length;

  const [saved] = await db
    .update(monitorRuns)
    .set({
      state,
      cursor: state === "PARTIAL" ? cursor : null,
      stats,
      apiCalls,
      error,
      reportMd,
      finishedAt: state === "PARTIAL" ? null : new Date(),
    })
    .where(eq(monitorRuns.id, run.id))
    .returning();

  if (state === "FAILED" || (state === "DONE" && events.length > 0)) {
    const base = process.env.APP_BASE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
    await notifySlack(
      state === "FAILED"
        ? `⚠️ GTT 특허 모니터링 #${run.id} 실패: ${error}`
        : `📌 GTT 특허 모니터링 #${run.id}: 신규 ${stats.added}건 · 변경 ${stats.changed}건 · 위험도 상 ${stats.high}건${base ? `\n${base}/monitor/${run.id}` : ""}`,
    );
  }
  return saved;
}

/** 시연용: 기준 DB에서 최근 출원 1건을 지워 "신규 1건 감지" 장면을 만든다 */
export async function demoDeleteLatest() {
  const db = await getDb();
  const [p] = await db
    .select({ appNo: patents.appNo, title: patents.title })
    .from(patents)
    .where(eq(patents.verified, "API"))
    .orderBy(desc(patents.appDate))
    .limit(1);
  if (!p) return null;
  await db.delete(patents).where(inArray(patents.appNo, [p.appNo]));
  return p;
}
