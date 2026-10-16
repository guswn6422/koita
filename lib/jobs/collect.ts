import "server-only";
import { eq } from "drizzle-orm";
import { getDb, getTxDb } from "../db";
import { applicantAliases, patents } from "../db/schema";
import { getActiveAliases, getSettings } from "../db/queries";
import { collectByAliases } from "../kipris/search";
import { dedupe } from "../kipris/normalize";
import type { CallMeter } from "../kipris/client";
import { applyRecords } from "./sync";
import { classifyPending } from "./classify";
import { recomputeRisk } from "./risk";

/** 함수 실행 제한(초)에서 30초 여유를 둔 마감 시각 */
export function deadlineFrom(maxDurationSec: number, start = Date.now()) {
  return start + (maxDurationSec - 30) * 1000;
}

/**
 * 전체 수집(collect): 출원인 변형별 검색 → 정규화·중복 제거 → upsert → 미분류 건 분류 → 위험도
 * 분류는 남은 시간 안에서만 진행하고, 나머지는 "미분류 일괄 분류" 버튼으로 이어서 한다.
 */
export async function runCollect(opts: { dryRun?: boolean; deadline?: number } = {}) {
  const db = await getDb();
  const settings = await getSettings(db);
  const aliases = await getActiveAliases(db);
  if (aliases.length === 0) throw new Error("활성화된 출원인 별칭이 없습니다. 설정 화면에서 별칭을 켜 주세요.");

  const meter: CallMeter = { calls: 0 };
  const result = await collectByAliases({
    aliases: aliases.map((a) => a.name),
    rows: settings.rows,
    maxPages: settings.max_pages,
    deadline: opts.deadline,
    meter,
  });
  const records = dedupe(result.records);

  for (const a of aliases) {
    if (a.name in result.hitsByAlias) {
      await db.update(applicantAliases).set({ lastHitCount: result.hitsByAlias[a.name] }).where(eq(applicantAliases.id, a.id));
    }
  }

  if (opts.dryRun) {
    return { fetched: result.records.length, unique: records.length, hitsByAlias: result.hitsByAlias, apiCalls: meter.calls, partial: !!result.cursor, classified: 0, remaining: 0, aiErrors: [] as string[] };
  }

  const txDb = await getTxDb();
  const { events, replacedSeeds } = await applyRecords(txDb, records, { recordEvents: false });
  // 상태가 바뀐 건과 시드를 대체한 건은 위험도를 다시 계산
  await recomputeRisk(db, [...new Set([...events.filter((e) => e.type !== "NEW").map((e) => e.appNo), ...replacedSeeds])], settings.high_max_elements);

  let classified = 0;
  let remaining = 0;
  let aiErrors: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    const c = await classifyPending(db, { limit: 60, deadline: opts.deadline, highMax: settings.high_max_elements });
    classified = c.classified;
    remaining = c.remaining;
    aiErrors = c.errors;
  } else {
    aiErrors = ["ANTHROPIC_API_KEY 미설정 — 분류를 건너뛰었습니다."];
  }

  const total = (await db.$count(patents));
  return {
    fetched: result.records.length,
    unique: records.length,
    added: events.filter((e) => e.type === "NEW").length,
    changed: events.filter((e) => e.type !== "NEW").length,
    hitsByAlias: result.hitsByAlias,
    apiCalls: meter.calls,
    partial: !!result.cursor,
    classified,
    remaining,
    aiErrors,
    total,
  };
}
