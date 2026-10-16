import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db";
import { classifications, monitorEvents, patents, patentStatusHistory } from "../db/schema";
import { diffSnapshots, type DiffEvent } from "../domain/diff";
import { toStatusGroup } from "../domain/status";
import { regNoKey, type NormalizedPatent } from "../kipris/normalize";

/**
 * 수집 결과를 기준 DB에 반영한다 (트랜잭션).
 * 비교 → 이벤트 기록 → 상태 이력 → patents 갱신을 하나로 묶어 원자성을 보장한다.
 * 상태가 바뀌어도 덮어쓰기 전에 patent_status_history에 이전 값을 남긴다.
 */
export async function applyRecords(
  txDb: Db,
  records: NormalizedPatent[],
  opts: { runId?: number | null; recordEvents: boolean },
): Promise<{ events: DiffEvent[]; replacedSeeds: string[] }> {
  if (records.length === 0) return { events: [], replacedSeeds: [] };
  const now = new Date();

  return txDb.transaction(async (tx) => {
    const appNos = records.map((r) => r.appNo);
    const baseline = await tx
      .select({ appNo: patents.appNo, status: patents.status, regNo: patents.regNo })
      .from(patents)
      .where(inArray(patents.appNo, appNos));
    // diff는 전체 기준과 비교해야 "신규"가 정확하다 — 이번 결과에 없는 출원번호는 기준에 없는 것으로 본다
    const events = diffSnapshots(baseline, records);

    // patents upsert (100건씩) — 분류·위험도 필드는 건드리지 않는다
    for (let i = 0; i < records.length; i += 100) {
      const chunk = records.slice(i, i + 100).map((r) => ({
        appNo: r.appNo,
        appDate: r.appDate,
        title: r.title,
        applicant: r.applicant,
        ipc: r.ipc,
        pubNo: r.pubNo,
        pubDate: r.pubDate,
        regNo: r.regNo,
        regDate: r.regDate,
        status: r.status,
        statusGroup: toStatusGroup(r.status),
        abstract: r.abstract,
        verified: "API" as const,
        lastChecked: now,
        raw: r.raw,
      }));
      await tx
        .insert(patents)
        .values(chunk)
        .onConflictDoUpdate({
          target: patents.appNo,
          set: {
            appDate: sql`excluded.app_date`,
            title: sql`excluded.title`,
            applicant: sql`excluded.applicant`,
            ipc: sql`excluded.ipc`,
            pubNo: sql`excluded.pub_no`,
            pubDate: sql`excluded.pub_date`,
            regNo: sql`excluded.reg_no`,
            regDate: sql`excluded.reg_date`,
            status: sql`excluded.status`,
            statusGroup: sql`excluded.status_group`,
            abstract: sql`coalesce(excluded.abstract, ${patents.abstract})`,
            verified: sql`excluded.verified`,
            lastChecked: sql`excluded.last_checked`,
            raw: sql`excluded.raw`,
          },
        });
    }

    // 상태 이력 (덮어쓰지 않고 남김)
    const historyRows = events
      .filter((e) => e.type !== "NEW")
      .map((e) => ({
        appNo: e.appNo,
        runId: opts.runId ?? null,
        field: e.type === "STATUS_CHANGED" ? "status" : "reg_no",
        before: e.before,
        after: e.after,
      }));
    if (historyRows.length) await tx.insert(patentStatusHistory).values(historyRows);

    if (opts.recordEvents && opts.runId && events.length) {
      await tx.insert(monitorEvents).values(
        events.map((e) => ({ runId: opts.runId!, appNo: e.appNo, type: e.type, before: e.before, after: e.after })),
      );
    }

    // 부록 B 웹 시드: 같은 등록번호의 API 레코드가 들어오면 분류를 넘겨주고 시드를 지운다
    const seeds = await tx
      .select({ appNo: patents.appNo, regNo: patents.regNo, family: patents.family, layer: patents.layer })
      .from(patents)
      .where(eq(patents.verified, "WEB"));
    const replacedSeeds: string[] = [];
    for (const s of seeds) {
      const key = regNoKey(s.regNo);
      const match = key ? records.find((r) => regNoKey(r.regNo) === key) : undefined;
      if (!match) continue;
      await tx
        .update(patents)
        .set({ family: s.family, layer: s.layer })
        .where(sql`${patents.appNo} = ${match.appNo} and ${patents.layer} = 'UNCLASSIFIED'`);
      await tx.update(classifications).set({ appNo: match.appNo }).where(eq(classifications.appNo, s.appNo));
      await tx.delete(patents).where(eq(patents.appNo, s.appNo));
      replacedSeeds.push(match.appNo);
    }

    return { events, replacedSeeds };
  });
}
