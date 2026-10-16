import "server-only";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import type { Db } from "../db";
import { classifications, patents } from "../db/schema";
import { classifyBatch, type ClassifyOutput } from "../ai/classify";
import { recomputeRisk } from "./risk";

async function saveResults(db: Db, results: ClassifyOutput[]) {
  for (const r of results) {
    await db.insert(classifications).values({
      appNo: r.appNo,
      family: r.family,
      layer: r.layer,
      evidence: r.evidence,
      confidence: r.confidence.toFixed(2),
      model: r.model,
      promptVersion: r.promptVersion,
      source: "AI",
      note: r.error ?? null,
    });
    // 연구원이 수동 수정한 건(MANUAL)은 덮어쓰지 않는다
    const manual = await db
      .select({ id: classifications.id })
      .from(classifications)
      .where(and(eq(classifications.appNo, r.appNo), eq(classifications.source, "MANUAL")))
      .limit(1);
    if (manual.length === 0) {
      await db.update(patents).set({ family: r.family, layer: r.layer }).where(eq(patents.appNo, r.appNo));
    }
  }
}

/**
 * 분류 이력이 없는 건을 10건씩 분류한다. 비용 관리를 위해 분류 결과가 있는 건은 재호출하지 않는다.
 * deadline에 가까워지면 멈추고 남은 건수를 돌려준다. 배치는 3개씩 병렬로 보낸다.
 */
export async function classifyPending(
  db: Db,
  opts: { limit?: number; appNos?: string[]; deadline?: number; highMax: number; force?: boolean },
) {
  const conds = [];
  if (!opts.force) {
    conds.push(notExists(db.select({ x: sql`1` }).from(classifications).where(eq(classifications.appNo, patents.appNo))));
  }
  if (opts.appNos) conds.push(inArray(patents.appNo, opts.appNos.length ? opts.appNos : ["__none__"]));
  const where = conds.length ? and(...conds) : undefined;
  const todo = await db
    .select({ appNo: patents.appNo, title: patents.title, abstract: patents.abstract, ipc: patents.ipc })
    .from(patents)
    .where(where)
    .orderBy(sql`${patents.appDate} desc nulls last`)
    .limit(opts.limit ?? 30);

  const batches: (typeof todo)[] = [];
  for (let i = 0; i < todo.length; i += 10) batches.push(todo.slice(i, i + 10));

  let done = 0;
  const errors: string[] = [];
  for (let i = 0; i < batches.length; i += 3) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    const group = batches.slice(i, i + 3);
    const results = await Promise.all(group.map((b) => classifyBatch(b)));
    for (const res of results) {
      await saveResults(db, res);
      done += res.length;
      for (const r of res) if (r.error && !errors.includes(r.error)) errors.push(r.error);
    }
  }
  const classified = todo.slice(0, done).map((t) => t.appNo);
  await recomputeRisk(db, classified, opts.highMax);

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(patents)
    .where(notExists(db.select({ x: sql`1` }).from(classifications).where(eq(classifications.appNo, patents.appNo))));
  return { classified: done, remaining, errors, appNos: classified };
}

/** 수동 분류 수정 — MANUAL이 AI보다 우선 */
export async function setManualClassification(
  db: Db,
  p: { appNo: string; family: ClassifyOutput["family"]; layer: ClassifyOutput["layer"]; note?: string; highMax: number },
) {
  await db.insert(classifications).values({
    appNo: p.appNo, family: p.family, layer: p.layer, evidence: { family: [], layer: [] },
    source: "MANUAL", note: p.note || "연구원 수동 수정",
  });
  await db.update(patents).set({ family: p.family, layer: p.layer }).where(eq(patents.appNo, p.appNo));
  await recomputeRisk(db, [p.appNo], p.highMax);
}
